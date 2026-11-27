/**
 * BieberKit
 *
 * @file        packages/admin-core/src/resilience.test.ts
 * @description Tests of what keeps the admin usable when the network or a deploy fails: the retry policy, the backoff, the offline state and the reload on a missing chunk (UI-19, UI-22).
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

import { describe, expect, it } from 'vitest';
import { AdminApiError } from './client.ts';
import { backoffMs, chunkReload, connection, isChunkError, isNetworkFailure, shouldRetry } from './resilience.ts';

const full = (): number => 1;
const api = (status: number): AdminApiError => new AdminApiError(status, 'X', 'x', 'x');

describe('UI-19 the retry policy', () => {
  it('UI-19 a network failure is retried a few times, and a failure of the server fewer, and a refusal never', () => {
    const network = new TypeError('Failed to fetch');
    expect(isNetworkFailure(network)).toBe(true);
    expect(isNetworkFailure(api(500))).toBe(false);
    expect([0, 1, 2, 3, 4, 5].map((count) => shouldRetry(count, network))).toEqual([
      true,
      true,
      true,
      true,
      true,
      false,
    ]);
    expect([0, 1, 2].map((count) => shouldRetry(count, api(503)))).toEqual([true, true, true]);
    expect(shouldRetry(3, api(503))).toBe(false);
    expect([shouldRetry(0, api(500)), shouldRetry(1, api(500)), shouldRetry(2, api(500))]).toEqual([true, true, false]);
    for (const status of [400, 401, 403, 404, 409, 412, 422]) expect(shouldRetry(0, api(status))).toBe(false);
    expect(shouldRetry(0, api(429))).toBe(true);
    expect(shouldRetry(0, new Error('a bug'))).toBe(false);
  });

  it('UI-19 the delay doubles from half a second to half a minute, and a jitter spreads the clients', () => {
    expect([0, 1, 2, 3].map((attempt) => backoffMs(attempt, full))).toEqual([500, 1000, 2000, 4000]);
    expect(backoffMs(20, full)).toBe(30_000);
    expect(backoffMs(2, () => 0.5)).toBe(1000);
    expect(backoffMs(2, () => 0)).toBe(0);
    expect(backoffMs(-1, full)).toBe(500);
  });
});

describe('UI-19 the offline state', () => {
  it('UI-19 the banner shows from the first sign of being offline and goes only when a request or the browser says that we are back', () => {
    let state = { online: true };
    state = connection(state, 'offline');
    expect(state.online).toBe(false);
    state = connection(state, 'request-failed');
    expect(state.online).toBe(false);
    state = connection(state, 'request-ok');
    expect(state.online).toBe(true);
    expect(connection({ online: true }, 'request-failed').online).toBe(false);
    expect(connection({ online: false }, 'online').online).toBe(true);
    expect(connection({ online: true }, 'request-ok')).toEqual({ online: true });
  });
});

describe('UI-22 the reload on a missing chunk', () => {
  it('UI-22 an error of a module that could not be loaded is a chunk error, in every browser that says it', () => {
    for (const message of [
      'Failed to fetch dynamically imported module: https://x/assets/List-abc.js',
      'error loading dynamically imported module',
      'Importing a module script failed.',
      'Loading chunk 12 failed.',
    ])
      expect(isChunkError(new Error(message))).toBe(true);
    expect(isChunkError(new Error('Cannot read properties of undefined'))).toBe(false);
    expect(isChunkError('Failed to fetch dynamically imported module')).toBe(true);
    expect(isChunkError(undefined)).toBe(false);
  });

  it('UI-22 the page reloads once, and a second chunk error inside the window shows the error and does not loop', () => {
    expect(chunkReload(1_000, undefined)).toBe('reload');
    expect(chunkReload(1_000 + 10_000, 1_000)).toBe('show');
    expect(chunkReload(1_000 + 61_000, 1_000)).toBe('reload');
    expect(chunkReload(1_000, 5_000)).toBe('show');
  });
});
