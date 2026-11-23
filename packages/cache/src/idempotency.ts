/**
 * BieberKit
 *
 * @file        packages/cache/src/idempotency.ts
 * @description A shared store for Idempotency-Key on the cache, so that several processes answer for one key (13.1).
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

import { createHash } from 'node:crypto';
import type { IdempotencyBegin, IdempotencyStore, StoredResponse } from '@bieberkit/http';
import type { Cache, AtomicCache } from './cache.ts';
import type { CacheValue } from './contract.ts';

export interface CacheIdempotencyOptions {
  /** How long a key and its answer are kept once the request is done. Defaults to 24 hours. */
  readonly ttlMs?: number;
  /** How long a request that has not finished holds its key. Defaults to 10 minutes. */
  readonly pendingTtlMs?: number;
}

interface Entry {
  readonly fingerprint: string;
  readonly response: StoredResponse | null;
}

/** The key of the request holds a user, a route and the header of the client: hash it to a fixed, safe name. */
const name = (key: string): string => `idem:${createHash('sha256').update(key).digest('hex')}`;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/** What the cache gives back, checked: a value that is not an entry of ours is a miss. */
function entryOf(value: CacheValue | undefined): Entry | undefined {
  if (!isRecord(value) || typeof value['fingerprint'] !== 'string') return undefined;
  const response = value['response'];
  if (!isRecord(response)) return { fingerprint: value['fingerprint'], response: null };
  const { status, headers, body } = response;
  if (typeof status !== 'number' || typeof body !== 'string' || !isRecord(headers)) {
    return { fingerprint: value['fingerprint'], response: null };
  }
  const flat: Record<string, string> = {};
  for (const [key, header] of Object.entries(headers)) if (typeof header === 'string') flat[key] = header;
  return { fingerprint: value['fingerprint'], response: { status, headers: flat, body } };
}

/** The entry as the cache keeps it: a plain JSON object. */
function toValue(entry: Entry): CacheValue {
  const response = entry.response;
  return {
    fingerprint: entry.fingerprint,
    response:
      response === null ? null : { status: response.status, headers: { ...response.headers }, body: response.body },
  };
}

/**
 * The `IdempotencyStore` of `@bieberkit/http` on the strongly consistent keys of the cache (`atomic`): `begin` claims the key with
 * `add`, so two processes can never both get `new` for one key.
 */
export function createCacheIdempotencyStore(cache: Cache, options: CacheIdempotencyOptions = {}): IdempotencyStore {
  const ttlMs = options.ttlMs ?? 86_400_000;
  const pendingTtlMs = options.pendingTtlMs ?? 600_000;
  const store: AtomicCache = cache.atomic;

  async function begin(key: string, fingerprint: string, retry: boolean): Promise<IdempotencyBegin> {
    if (await store.add(name(key), toValue({ fingerprint, response: null }), pendingTtlMs)) return { state: 'new' };
    const found = entryOf(await store.get(name(key)));
    // The key expired between the two calls: claim it again, once.
    if (found === undefined) return retry ? begin(key, fingerprint, false) : { state: 'busy' };
    if (found.fingerprint !== fingerprint) return { state: 'mismatch' };
    return found.response === null ? { state: 'busy' } : { state: 'replay', response: found.response };
  }

  return {
    begin: (key, fingerprint) => begin(key, fingerprint, true),
    async complete(key, response) {
      const found = entryOf(await store.get(name(key)));
      if (found === undefined) return;
      await store.set(name(key), toValue({ fingerprint: found.fingerprint, response }), ttlMs);
    },
    async abandon(key) {
      await store.delete(name(key));
    },
  };
}
