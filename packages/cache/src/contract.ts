/**
 * BieberKit
 *
 * @file        packages/cache/src/contract.ts
 * @description The types of the cache and of its engines, the errors and the rules for keys, values and TTLs (C-01).
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

import { BkError } from '@bieberkit/core';

/** What a cache keeps: anything that survives `JSON.stringify`. `undefined` is a miss, so `null` is how "nothing" is cached. */
export type CacheValue =
  | null
  | boolean
  | number
  | string
  | readonly CacheValue[]
  | { readonly [key: string]: CacheValue };

/**
 * Keys that are strongly consistent: they never come from a first level and every node sees a write at once. They hold locks,
 * tag generations and the claims of `Idempotency-Key`. Values are strings, the cache encodes JSON.
 */
export interface Atomic {
  /** Stores `value` only if the key is absent. True when this call stored it. */
  add(key: string, value: string, ttlMs: number): Promise<boolean>;
  get(key: string): Promise<string | undefined>;
  set(key: string, value: string, ttlMs: number): Promise<void>;
  delete(key: string): Promise<void>;
  /** Deletes the key only if it still holds `value`. True when it did. */
  deleteIf(key: string, value: string): Promise<boolean>;
  /** Adds one to a counter that starts at zero, and answers the new value. The key expires `ttlMs` after the last call. */
  increment(key: string, ttlMs: number): Promise<number>;
}

/**
 * What a driver gives to `createCache`. `get`, `set` and `delete` may be served from a first level and may be a few seconds old on
 * another node. A value that must not be stale goes through `atomic`.
 */
export interface CacheEngine {
  readonly name: string;
  get(key: string): Promise<string | undefined>;
  set(key: string, value: string, ttlMs: number): Promise<void>;
  delete(key: string): Promise<void>;
  readonly atomic: Atomic;
  close(): Promise<void>;
}

export class CacheError extends BkError {}

export function cacheError(code: string, status: number, message: string, fix: string): CacheError {
  return new CacheError(message, { code, status, fix });
}

/** Every key, tag and prefix: 1 to 200 characters that are safe in a file name, a URL and a Redis key. */
const NAME = /^[\w.:/@=-]{1,200}$/;

export function checkName(kind: 'key' | 'tag' | 'prefix', value: string): string {
  if (typeof value !== 'string' || !NAME.test(value)) {
    throw cacheError(
      'CACHE_KEY_INVALID',
      500,
      `The ${kind} ${JSON.stringify(value)} is not valid.`,
      `A ${kind} is 1 to 200 characters of letters, digits and _ . : / @ = -.`,
    );
  }
  return value;
}

export function checkTtl(ttlMs: number, maxTtlMs: number): number {
  if (!Number.isSafeInteger(ttlMs) || ttlMs <= 0 || ttlMs > maxTtlMs) {
    throw cacheError(
      'CACHE_TTL_INVALID',
      500,
      `The TTL ${String(ttlMs)} ms is not valid.`,
      `Give a whole number of milliseconds from 1 to ${String(maxTtlMs)}. A cache entry with no expiry fills the instance (Q-08).`,
    );
  }
  return ttlMs;
}

/** Encodes a value as JSON, or throws `CACHE_VALUE_INVALID`. */
export function encodeValue(value: unknown): string {
  let text: string | undefined;
  try {
    text = JSON.stringify(value);
  } catch {
    text = undefined;
  }
  if (text === undefined) {
    throw cacheError(
      'CACHE_VALUE_INVALID',
      500,
      'The value cannot be kept as JSON.',
      'Cache plain data: no undefined, functions, bigint or cycles. Use null for "nothing".',
    );
  }
  return text;
}
