/**
 * BieberKit
 *
 * @file        packages/cache/src/adapters/bentocache/secondary-storage.test.ts
 * @description Tests of the session store of Better Auth on a real Valkey: values with a lifetime, an atomic get and delete, and a counter that keeps its first lifetime (AUTH-02).
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

import { afterAll, describe, expect, it } from 'vitest';
import { describeRedis } from '../../testing/redis.ts';
import { redisSecondaryStorage } from './secondary-storage.ts';

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

describeRedis('AUTH-02 the session store on Valkey', (url) => {
  const prefix = `sec${Date.now()}`;
  const opened: ReturnType<typeof redisSecondaryStorage>[] = [];
  const open = (extra: Partial<Parameters<typeof redisSecondaryStorage>[0]> = {}) => {
    const store = redisSecondaryStorage({ url, prefix, ...extra });
    opened.push(store);
    return store;
  };
  afterAll(async () => {
    await Promise.all(opened.map((store) => store.close()));
  });

  it('AUTH-02 keeps a value, and answers null for a key that is not there', async () => {
    const store = open();
    expect(await store.get('missing')).toBeNull();
    await store.set('session:abc', JSON.stringify({ user: 'Nguyễn 🙂' }));
    expect(JSON.parse((await store.get('session:abc')) ?? '{}')).toEqual({ user: 'Nguyễn 🙂' });
    await store.delete('session:abc');
    expect(await store.get('session:abc')).toBeNull();
    await store.delete('session:abc');
  });

  it('AUTH-02 gives a value the lifetime that it is asked for, in seconds, and none when it is not asked', async () => {
    const store = open();
    await store.set('short', 'x', 1);
    await store.set('forever', 'y');
    await store.set('zero', 'z', 0);
    expect(await store.get('short')).toBe('x');
    await sleep(1_300);
    expect(await store.get('short')).toBeNull();
    expect(await store.get('forever')).toBe('y');
    expect(await store.get('zero')).toBe('z');
  });

  it('AUTH-02 getAndDelete answers the value once, also when many ask at the same time', async () => {
    const store = open();
    await store.set('once', 'token');
    const answers = await Promise.all(Array.from({ length: 10 }, () => store.getAndDelete('once')));
    expect(answers.filter((answer) => answer === 'token')).toHaveLength(1);
    expect(await store.get('once')).toBeNull();
  });

  it('AUTH-02 a counter counts from one, in one step, and keeps the lifetime of its first call', async () => {
    const store = open();
    const counts = await Promise.all(Array.from({ length: 20 }, () => store.increment('window', 2)));
    expect(counts.toSorted((a, b) => a - b)).toEqual(Array.from({ length: 20 }, (_, i) => i + 1));
    await sleep(1_200);
    // A later call does not move the end of the window: the key is gone 2 seconds after the first call.
    expect(await store.increment('window', 2)).toBe(21);
    await sleep(1_100);
    expect(await store.increment('window', 2)).toBe(1);
  });

  it('AUTH-02 two apps that share a server, with other prefixes, do not meet', async () => {
    const one = open({ prefix: `${prefix}-one` });
    const two = open({ prefix: `${prefix}-two` });
    await one.set('k', 'from one');
    expect(await two.get('k')).toBeNull();
    expect(await one.get('k')).toBe('from one');
  });

  it('AUTH-02 two connections to one server see each other at once: a replica finds the session of another', async () => {
    const a = open();
    const b = open();
    await a.set('shared', 'seen');
    expect(await b.get('shared')).toBe('seen');
  });

  it('AUTH-02 close can be called twice', async () => {
    const store = redisSecondaryStorage({ url, prefix });
    await expect(store.close()).resolves.toBeUndefined();
    await expect(store.close()).resolves.toBeUndefined();
  });
});

describe('AUTH-02 the session store without a server', () => {
  it('AUTH-02 an address that nobody answers is an error of the call, and never an exception that nobody catches', async () => {
    const store = redisSecondaryStorage({ url: 'redis://127.0.0.1:1', prefix: 'none' });
    await expect(store.get('k')).rejects.toBeDefined();
    await store.close();
  });
});
