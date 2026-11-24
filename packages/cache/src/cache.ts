/**
 * BieberKit
 *
 * @file        packages/cache/src/cache.ts
 * @description createCache: get, set, remember, tags, locks and the tenant view over any cache engine (C-01 to C-03, DATA-13).
 * @author      Bieber Kieu <kieutrongthien@gmail.com>
 * @copyright   Copyright (c) 2026 Bieber Kieu
 * @license     Apache-2.0
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import { randomUUID } from 'node:crypto';
import { createLogger, createNoopMetrics, createNoopTracer } from '@bieberkit/core';
import type { Logger, Metrics, Span, Tracer } from '@bieberkit/core';
import { afterCommit, currentTenantId } from '@bieberkit/data/orm';
import { cacheError, checkName, checkTtl, encodeValue } from './contract.ts';
import type { CacheEngine, CacheValue } from './contract.ts';

export interface CacheOptions {
  readonly engine: CacheEngine;
  /** Isolates apps that share one store. Defaults to `bk`. In an app it is `CACHE_PREFIX`. */
  readonly prefix?: string;
  /** Used when a call gives no TTL. Defaults to 5 minutes. */
  readonly defaultTtlMs?: number;
  /** The longest TTL that is accepted. Defaults to 7 days. */
  readonly maxTtlMs?: number;
  /** How long the caller that computes a `remember` may hold the lock before the others compute too. Defaults to 30 seconds. */
  readonly rememberLockMs?: number;
  /** How long the other callers of a `remember` wait for the first one. Defaults to 5 seconds. */
  readonly rememberWaitMs?: number;
  readonly logger?: Logger;
  /** Records a span for each call of the cache. A span names the operation and says hit or miss, and never holds a key (OBS-02). */
  readonly tracer?: Tracer;
  /** Counts the lookups by result, `bk_cache_lookups_total{result=hit|miss}`, for the hit ratio (OBS-03). */
  readonly metrics?: Metrics;
}

export interface Lock {
  /** Frees the lock if it is still ours. False when it had expired and someone else may hold it. */
  release(): Promise<boolean>;
}

export interface LockOptions {
  /** How long to wait for a lock that is held. Defaults to 0: answer at once. */
  readonly waitMs?: number;
}

/** What a tag set and the cache itself share. */
export interface CacheReader {
  get<T extends CacheValue = CacheValue>(key: string): Promise<T | undefined>;
  set(key: string, value: CacheValue, ttlMs?: number): Promise<void>;
  has(key: string): Promise<boolean>;
  forget(key: string): Promise<void>;
  /** The value of `key`, computed by `factory` and kept for `ttlMs` when it is missing. One caller computes, the others wait (C-03). */
  remember<T extends CacheValue>(key: string, ttlMs: number, factory: () => Promise<T> | T): Promise<T>;
}

export interface TaggedCache extends CacheReader {
  /** Makes every entry that was written with one of these tags unreadable. */
  flush(): Promise<void>;
  /** `flush` when the transaction that is running commits. A failure only logs a warning (DATA-13). */
  flushAfterCommit(): void;
}

/** Keys that are the same on every node at once: claims, counters, small shared state. They are never served from a first level. */
export interface AtomicCache {
  /** Stores only if the key is absent. True when this call stored it. */
  add(key: string, value: CacheValue, ttlMs: number): Promise<boolean>;
  get<T extends CacheValue = CacheValue>(key: string): Promise<T | undefined>;
  set(key: string, value: CacheValue, ttlMs: number): Promise<void>;
  delete(key: string): Promise<void>;
}

export interface Cache extends CacheReader {
  tags(tags: readonly string[]): TaggedCache;
  lock(key: string, ttlMs: number, options?: LockOptions): Promise<Lock | undefined>;
  readonly atomic: AtomicCache;
  /** The same cache inside the namespace of the tenant of the request. Without a tenant each call throws `CACHE_TENANT_REQUIRED` (C-01). */
  readonly tenant: Cache;
  close(): Promise<void>;
}

const DAY = 86_400_000;
const GENERATION_TTL_MS = 30 * DAY;
const MAX_TAGS = 10;
const POLL_MS = 25;

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/** The value that a call stored. As with `JSON.parse`, the type is the claim of the caller. */
// oxlint-disable-next-line typescript/no-unnecessary-type-parameters
function parse<T>(text: string | undefined): T | undefined {
  if (text === undefined) return undefined;
  try {
    // oxlint-disable-next-line typescript/no-unsafe-type-assertion
    return JSON.parse(text) as T;
  } catch {
    return undefined;
  }
}

const tenantScope = (): string => {
  const tenantId = currentTenantId();
  if (tenantId === undefined) {
    throw cacheError(
      'CACHE_TENANT_REQUIRED',
      500,
      'cache.tenant was used with no tenant in the request context.',
      'Use cache.tenant inside a request or a job of a tenant, or use the root cache for data that every tenant shares.',
    );
  }
  return `t:${checkName('key', tenantId)}:`;
};

export function createCache(options: CacheOptions): Cache {
  const { engine } = options;
  const prefix = checkName('prefix', options.prefix ?? 'bk');
  const maxTtlMs = options.maxTtlMs ?? 7 * DAY;
  const defaultTtlMs = checkTtl(options.defaultTtlMs ?? 300_000, maxTtlMs);
  const rememberLockMs = options.rememberLockMs ?? 30_000;
  const rememberWaitMs = options.rememberWaitMs ?? 5_000;
  const logger = options.logger ?? createLogger({ level: 'warn', role: 'cache' });
  const inflight = new Map<string, Promise<unknown>>();
  const tracer = options.tracer ?? createNoopTracer();
  const lookups = (options.metrics ?? createNoopMetrics()).counter(
    'bk_cache_lookups_total',
    'Lookups of the cache by result, for the hit ratio.',
    { labels: ['result'] },
  );
  const traced = <T>(operation: string, run: (span: Span) => Promise<T>): Promise<T> =>
    tracer.span(`cache ${operation}`, { kind: 'client', attributes: { 'bk.cache.op': operation } }, run);
  /** Counts a lookup, and says on the span whether it found the value. */
  const noted = (span: Span, hit: boolean): void => {
    lookups.inc({ result: hit ? 'hit' : 'miss' });
    span.setAttribute('bk.cache.hit', hit);
  };

  const full = (kind: string, scope: string, name: string): string => `${prefix}:${scope}${kind}:${name}`;

  async function tryLock(lockKey: string, ttlMs: number): Promise<Lock | undefined> {
    const token = randomUUID();
    if (!(await engine.atomic.add(lockKey, token, ttlMs))) return undefined;
    return { release: () => engine.atomic.deleteIf(lockKey, token) };
  }

  async function acquire(
    lockKey: string,
    ttlMs: number,
    waitMs: number,
    settled?: () => Promise<boolean>,
  ): Promise<Lock | undefined> {
    const deadline = Date.now() + waitMs;
    for (;;) {
      const lock = await tryLock(lockKey, ttlMs);
      if (lock !== undefined) return lock;
      if (settled !== undefined && (await settled())) return undefined;
      if (Date.now() >= deadline) return undefined;
      await sleep(POLL_MS + Math.floor(Math.random() * POLL_MS));
    }
  }

  async function remember<T extends CacheValue>(
    span: Span,
    valueKey: string,
    ttlMs: number,
    factory: () => Promise<T> | T,
  ): Promise<T> {
    const ttl = checkTtl(ttlMs, maxTtlMs);
    const hit = parse<T>(await engine.get(valueKey));
    noted(span, hit !== undefined);
    if (hit !== undefined) return hit;
    const running = inflight.get(valueKey);
    // oxlint-disable-next-line typescript/no-unsafe-type-assertion
    if (running !== undefined) return (await running) as T;
    const task = (async (): Promise<T> => {
      let found: T | undefined;
      const lock = await acquire(full('r', '', valueKey), rememberLockMs, rememberWaitMs, async () => {
        found = parse<T>(await engine.get(valueKey));
        return found !== undefined;
      });
      if (found !== undefined) return found;
      try {
        // The caller that held the lock before us may have stored the value while we waited.
        const again = lock === undefined ? undefined : parse<T>(await engine.get(valueKey));
        if (again !== undefined) return again;
        const value = await factory();
        await engine.set(valueKey, encodeValue(value), ttl);
        return value;
      } finally {
        await lock?.release();
      }
    })().finally(() => inflight.delete(valueKey));
    inflight.set(valueKey, task);
    return task;
  }

  /** The calls on values, for a scope and for tags. `place` turns a key into the stored key, reading tag generations when needed. */
  function reader(place: (key: string) => Promise<string>): CacheReader {
    return {
      get: <T extends CacheValue>(key: string) =>
        traced('get', async (span) => {
          const value = parse<T>(await engine.get(await place(key)));
          noted(span, value !== undefined);
          return value;
        }),
      set: (key, value, ttlMs = defaultTtlMs) =>
        traced('set', async () => {
          const text = encodeValue(value);
          const ttl = checkTtl(ttlMs, maxTtlMs);
          await engine.set(await place(key), text, ttl);
        }),
      has: (key) =>
        traced('has', async (span) => {
          const found = (await engine.get(await place(key))) !== undefined;
          noted(span, found);
          return found;
        }),
      forget: (key) =>
        traced('forget', async () => {
          await engine.delete(await place(key));
        }),
      remember: (key, ttlMs, factory) =>
        traced('remember', async (span) => remember(span, await place(key), ttlMs, factory)),
    };
  }

  function view(scopeOf: () => string): Cache {
    const base = reader(async (key) => full('v', scopeOf(), checkName('key', key)));
    const atomicKey = (key: string) => full('a', scopeOf(), checkName('key', key));
    const root: Cache = {
      ...base,
      tags(tags) {
        const names = [...new Set(tags.map((tag) => checkName('tag', tag)))].toSorted();
        if (names.length === 0 || names.length > MAX_TAGS) {
          throw cacheError(
            'CACHE_KEY_INVALID',
            500,
            `A tag set has 1 to ${String(MAX_TAGS)} tags.`,
            'Pass between one and ten tags.',
          );
        }
        const generations = async (scope: string): Promise<string[]> =>
          Promise.all(names.map(async (tag) => `${tag}=${(await engine.atomic.get(full('g', scope, tag))) ?? '0'}`));
        const flush = async (scope: string): Promise<void> => {
          await Promise.all(names.map((tag) => engine.atomic.increment(full('g', scope, tag), GENERATION_TTL_MS)));
        };
        const tagged = reader(async (key) => {
          const scope = scopeOf();
          return full('v', scope, `${(await generations(scope)).join('|')}|${checkName('key', key)}`);
        });
        return {
          ...tagged,
          flush: () => flush(scopeOf()),
          flushAfterCommit() {
            // The scope is read now, inside the request. The callback may run when no request context is left.
            const scope = scopeOf();
            afterCommit(async () => {
              try {
                await flush(scope);
              } catch (error) {
                logger.warn(
                  'a cache flush after commit failed; entries of these tags may be served until they expire',
                  {
                    tags: names,
                    reason: error instanceof Error ? error.message : String(error),
                  },
                );
              }
            });
          },
        };
      },
      lock: (key, ttlMs, lockOptions = {}) =>
        traced('lock', async () => {
          const ttl = checkTtl(ttlMs, maxTtlMs);
          return acquire(full('l', scopeOf(), checkName('key', key)), ttl, lockOptions.waitMs ?? 0);
        }),
      atomic: {
        add: (key, value, ttlMs) =>
          traced('atomic add', async () =>
            engine.atomic.add(atomicKey(key), encodeValue(value), checkTtl(ttlMs, maxTtlMs)),
          ),
        get: <T extends CacheValue>(key: string) =>
          traced('atomic get', async () => parse<T>(await engine.atomic.get(atomicKey(key)))),
        set: (key, value, ttlMs) =>
          traced('atomic set', async () => {
            await engine.atomic.set(atomicKey(key), encodeValue(value), checkTtl(ttlMs, maxTtlMs));
          }),
        delete: (key) =>
          traced('atomic delete', async () => {
            await engine.atomic.delete(atomicKey(key));
          }),
      },
      get tenant() {
        return scopeOf === tenantScope ? root : view(tenantScope);
      },
      close: () => engine.close(),
    };
    return root;
  }

  return view(() => '');
}
