/**
 * BieberKit
 *
 * @file        packages/admin-core/src/resilience.ts
 * @description What keeps the admin usable when the network or a deploy fails: the retry policy, the backoff, the offline state and the reload on a missing chunk (UI-19, UI-22).
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

import { AdminApiError } from './client.ts';

/** A request that did not reach the server: the browser raises a `TypeError` for it. */
export const isNetworkFailure = (error: unknown): boolean => error instanceof TypeError;

const TRANSIENT = [408, 429, 502, 503, 504];

/**
 * Whether a failed read is tried again. A network failure is tried a few times, a failure of the server fewer, and a refusal never:
 * a 4xx says that the same request will get the same answer (UI-19).
 */
export function shouldRetry(failures: number, error: unknown): boolean {
  if (isNetworkFailure(error)) return failures < 5;
  if (error instanceof AdminApiError) {
    if (TRANSIENT.includes(error.status)) return failures < 3;
    if (error.status >= 500) return failures < 2;
  }
  return false;
}

/** The wait before the next try, in ms: half a second, doubled each time up to half a minute, spread by a random factor (full jitter). */
export function backoffMs(attempt: number, random: () => number = Math.random): number {
  return Math.round(Math.min(30_000, 500 * 2 ** Math.max(0, attempt)) * random());
}

export interface Connection {
  readonly online: boolean;
}

export type ConnectionEvent = 'online' | 'offline' | 'request-failed' | 'request-ok';

/** Whether the admin thinks that it can reach the server: the browser's events, and the outcome of the requests that were made. */
export function connection(state: Connection, event: ConnectionEvent): Connection {
  const online = event === 'online' || event === 'request-ok';
  return state.online === online ? state : { online };
}

const CHUNK = /dynamically imported module|Importing a module script failed|Loading chunk \S+ failed|ChunkLoadError/i;

/** Whether an error is a screen of the application that could not be loaded: a deploy replaced the files of the tab that is open (UI-22). */
export function isChunkError(error: unknown): boolean {
  const text = error instanceof Error ? error.message : typeof error === 'string' ? error : '';
  return CHUNK.test(text);
}

const RELOAD_WINDOW_MS = 60_000;

/** `reload` the page for a missing chunk, once: a second one inside a minute is shown, so a bad deploy cannot make a loop. */
export function chunkReload(now: number, lastReloadAt: number | undefined): 'reload' | 'show' {
  return lastReloadAt === undefined || now - lastReloadAt > RELOAD_WINDOW_MS ? 'reload' : 'show';
}
