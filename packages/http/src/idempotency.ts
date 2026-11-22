/**
 * BieberKit
 *
 * @file        packages/http/src/idempotency.ts
 * @description The store behind Idempotency-Key: one answer for each key, kept for a time, with the states of a request that is running (spec 13.1).
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

/** What is kept of an answer, and what a replay sends. */
export interface StoredResponse {
  readonly status: number;
  readonly headers: Readonly<Record<string, string>>;
  readonly body: string;
}

export type IdempotencyBegin =
  | { readonly state: 'new' }
  | { readonly state: 'replay'; readonly response: StoredResponse }
  | { readonly state: 'mismatch' }
  | { readonly state: 'busy' };

/**
 * Where the answers of idempotent requests are kept. A shared store (the cache of M1.5) lets several processes answer for one key. The
 * memory store below is for one process.
 */
export interface IdempotencyStore {
  /** Claims `key` for a request with this `fingerprint`, or says what became of an earlier one. */
  begin(key: string, fingerprint: string): Promise<IdempotencyBegin>;
  /** Keeps the answer of the request that `begin` let through. */
  complete(key: string, response: StoredResponse): Promise<void>;
  /** The request failed: forget the key, so that it can be sent again. */
  abandon(key: string): Promise<void>;
}

export interface MemoryIdempotencyOptions {
  /** How long a key and its answer, or a request that never finished, are kept. Defaults to 24 hours. */
  readonly ttlMs?: number;
  readonly now?: () => number;
}

interface Entry {
  readonly fingerprint: string;
  readonly expires: number;
  response: StoredResponse | undefined;
}

export function createMemoryIdempotencyStore(options: MemoryIdempotencyOptions = {}): IdempotencyStore {
  const ttl = options.ttlMs ?? 24 * 3_600_000;
  const now = options.now ?? Date.now;
  const entries = new Map<string, Entry>();
  return {
    async begin(key, fingerprint) {
      const at = now();
      const found = entries.get(key);
      if (found !== undefined && found.expires <= at) entries.delete(key);
      const live = entries.get(key);
      if (live === undefined) {
        entries.set(key, { fingerprint, expires: at + ttl, response: undefined });
        return { state: 'new' };
      }
      if (live.fingerprint !== fingerprint) return { state: 'mismatch' };
      return live.response === undefined ? { state: 'busy' } : { state: 'replay', response: live.response };
    },
    async complete(key, response) {
      const entry = entries.get(key);
      if (entry !== undefined) entry.response = response;
    },
    async abandon(key) {
      entries.delete(key);
    },
  };
}
