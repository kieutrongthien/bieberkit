/**
 * BieberKit
 *
 * @file        packages/data/src/orm/outbox-retry.test.ts
 * @description Tests of the backoff of a failing outbox row and of the retry on a deadlock, which MySQL needs (MOD-18, ADR 0010).
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
import { backoffMs, isDeadlock, retryOnDeadlock } from './outbox.ts';

describe('backoffMs', () => {
  it('MOD-18 waits one second after the first failure and doubles it after each', () => {
    expect([1, 2, 3, 4].map((attempts) => backoffMs(attempts))).toEqual([1000, 2000, 4000, 8000]);
  });

  it('MOD-18 never waits longer than one hour, or than the limit it is given', () => {
    expect(backoffMs(40)).toBe(3_600_000);
    expect(backoffMs(40, 5000)).toBe(5000);
    expect(backoffMs(2, 5000)).toBe(2000);
  });
});

describe('isDeadlock', () => {
  it('MOD-18 knows the deadlock of MySQL, MariaDB and PostgreSQL, also when it is the cause', () => {
    expect(isDeadlock({ errno: 1213 })).toBe(true);
    expect(isDeadlock({ code: 'ER_LOCK_DEADLOCK' })).toBe(true);
    expect(isDeadlock({ code: '40P01' })).toBe(true);
    expect(isDeadlock(new Error('wrapped', { cause: { errno: 1213 } }))).toBe(true);
  });

  it('MOD-18 does not take another error for a deadlock', () => {
    expect(isDeadlock(new Error('boom'))).toBe(false);
    expect(isDeadlock({ code: 'ER_DUP_ENTRY', errno: 1062 })).toBe(false);
    expect(isDeadlock(undefined)).toBe(false);
    expect(isDeadlock('1213')).toBe(false);
  });
});

describe('retryOnDeadlock', () => {
  it('MOD-18 returns the result at once when nothing fails', async () => {
    let calls = 0;
    expect(await retryOnDeadlock(async () => ++calls)).toBe(1);
  });

  it('MOD-18 tries again after a deadlock, until it works', async () => {
    let calls = 0;
    const result = await retryOnDeadlock(async () => {
      calls += 1;
      if (calls < 3) throw Object.assign(new Error('deadlock'), { errno: 1213 });
      return 'done';
    });
    expect(result).toBe('done');
    expect(calls).toBe(3);
  });

  it('MOD-18 gives up after five tries and throws the deadlock', async () => {
    let calls = 0;
    const failing = retryOnDeadlock(async () => {
      calls += 1;
      throw Object.assign(new Error('deadlock'), { errno: 1213 });
    });
    await expect(failing).rejects.toThrow('deadlock');
    expect(calls).toBe(5);
  });

  it('MOD-18 does not try again after another error', async () => {
    let calls = 0;
    const failing = retryOnDeadlock(async () => {
      calls += 1;
      throw new Error('disk full');
    });
    await expect(failing).rejects.toThrow('disk full');
    expect(calls).toBe(1);
  });
});
