/**
 * BieberKit
 *
 * @file        packages/cache/src/adapters/bentocache/doctor.test.ts
 * @description Tests of the doctor checks on Redis instances: the policy of the queue and of the cache, one instance for both, an instance that is down or has no CONFIG, and no password in a finding (Q-08).
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
import { describeRedis } from '../../testing/redis.ts';
import { checkRedisInstances, describeInstance, readInstance, sameInstance } from './index.ts';
import type { DoctorFinding, InstanceInfo, RedisInstanceConfig } from './index.ts';

const QUEUE = 'redis://:queuepass@queue.internal:6379/0';
const CACHE = 'redis://:cachepass@cache.internal:6379/0';
const production: RedisInstanceConfig = {
  APP_ENV: 'production',
  QUEUE_DRIVER: 'redis',
  CACHE_DRIVER: 'redis',
  REDIS_URL: QUEUE,
  CACHE_REDIS_URL: CACHE,
};

const instances =
  (table: Record<string, InstanceInfo | Error>) =>
  async (url: string): Promise<InstanceInfo> => {
    const found = Object.entries(table).find(([prefix]) => url.includes(prefix))?.[1];
    if (found === undefined) throw new Error('no such instance in the test');
    if (found instanceof Error) throw found;
    return found;
  };
const noevict: InstanceInfo = { policy: 'noeviction', maxmemoryBytes: 1_000_000 };
const lru: InstanceInfo = { policy: 'allkeys-lru', maxmemoryBytes: 1_000_000 };

const recording =
  (reads: string[]) =>
  async (url: string): Promise<InstanceInfo> => {
    reads.push(url);
    return noevict;
  };
const mustNotRead = async (): Promise<InstanceInfo> => {
  throw new Error('must not be read');
};

const byId = (findings: readonly DoctorFinding[], id: string): DoctorFinding | undefined =>
  findings.find((finding) => finding.id === id);

describe('Q-08 the doctor checks on Redis instances', () => {
  it('Q-08 a queue on noeviction and a cache on an evicting policy, on two servers, is all ok', async () => {
    const findings = await checkRedisInstances(production, {
      read: instances({ 'queue.internal': noevict, 'cache.internal': lru }),
    });
    expect(findings.map((finding) => [finding.id, finding.level])).toEqual([
      ['redis.queue.policy', 'ok'],
      ['redis.cache.policy', 'ok'],
    ]);
  });

  it('Q-08 a queue that is not on noeviction is an error that says that jobs are deleted, and how to fix it', async () => {
    const findings = await checkRedisInstances(production, {
      read: instances({ 'queue.internal': lru, 'cache.internal': lru }),
    });
    const finding = byId(findings, 'redis.queue.policy');
    expect(finding).toMatchObject({
      level: 'error',
      fix: expect.stringContaining('CONFIG SET maxmemory-policy noeviction'),
    });
    expect(finding?.message).toContain('allkeys-lru');
    expect(finding?.message).toContain('deletes jobs');
  });

  it('Q-08 a cache on noeviction is an error, and every evicting policy is fine, including volatile ones', async () => {
    const bad = await checkRedisInstances(production, {
      read: instances({ 'queue.internal': noevict, 'cache.internal': noevict }),
    });
    expect(byId(bad, 'redis.cache.policy')?.level).toBe('error');
    for (const policy of ['allkeys-lru', 'allkeys-lfu', 'allkeys-random', 'volatile-lru', 'volatile-ttl']) {
      const good = await checkRedisInstances(production, {
        read: instances({ 'queue.internal': noevict, 'cache.internal': { policy, maxmemoryBytes: 5 } }),
      });
      expect(byId(good, 'redis.cache.policy')?.level).toBe('ok');
    }
  });

  it('Q-08 a cache with no memory limit is a warning, because its policy never runs', async () => {
    const findings = await checkRedisInstances(production, {
      read: instances({ 'queue.internal': noevict, 'cache.internal': { policy: 'allkeys-lru', maxmemoryBytes: 0 } }),
    });
    expect(byId(findings, 'redis.cache.maxmemory')).toMatchObject({
      level: 'warning',
      fix: expect.stringContaining('maxmemory'),
    });
    // A queue with no limit is not a finding: it deletes nothing and a full host is the operator's own alarm.
    expect(byId(findings, 'redis.queue.maxmemory')).toBeUndefined();
  });

  it('Q-08 the queue and the cache on one server are an error in production and a warning in development', async () => {
    const same = { ...production, CACHE_REDIS_URL: 'redis://:other@queue.internal:6379/5' };
    const read = instances({ 'queue.internal': noevict });
    expect(
      (await checkRedisInstances(same, { read })).find((finding) => finding.id === 'redis.separate'),
    ).toMatchObject({ level: 'error' });
    expect(
      (await checkRedisInstances({ ...same, APP_ENV: 'development' }, { read })).find(
        (finding) => finding.id === 'redis.separate',
      ),
    ).toMatchObject({ level: 'warning' });
    // With one policy for both, one of the two policy findings is an error, whichever way it is set.
    const findings = await checkRedisInstances(same, { read });
    expect(findings.filter((finding) => finding.level === 'error').length).toBeGreaterThanOrEqual(2);
  });

  it('Q-08 the same server under another name or port is not the same instance, and the same server with another database is', () => {
    expect(sameInstance('redis://a:6379/0', 'redis://a:6379/3')).toBe(true);
    expect(sameInstance('redis://A:6379', 'redis://a')).toBe(true);
    expect(sameInstance('redis://a:6379', 'redis://a:6380')).toBe(false);
    expect(sameInstance('redis://a:6379', 'redis://b:6379')).toBe(false);
    expect(sameInstance('not a url', 'not a url')).toBe(false);
  });

  it('Q-08 only the instances that are used are read', async () => {
    const reads: string[] = [];
    const read = recording(reads);
    expect(
      await checkRedisInstances({ ...production, QUEUE_DRIVER: 'database', CACHE_DRIVER: 'file' }, { read }),
    ).toEqual([]);
    await checkRedisInstances({ ...production, CACHE_DRIVER: 'memory' }, { read });
    expect(reads).toEqual([QUEUE]);
  });

  it('Q-08 a driver that needs an URL and has none is an error, and nothing is read', async () => {
    const read = mustNotRead;
    const findings = await checkRedisInstances(
      { ...production, REDIS_URL: undefined, CACHE_REDIS_URL: undefined },
      { read },
    );
    expect(findings.map((finding) => [finding.id, finding.level])).toEqual([
      ['redis.queue.url', 'error'],
      ['redis.cache.url', 'error'],
    ]);
  });

  it('Q-08 an instance that is down is an error with its address and without its password', async () => {
    const findings = await checkRedisInstances(production, {
      read: instances({ 'queue.internal': new Error(`connect ECONNREFUSED ${QUEUE}`), 'cache.internal': lru }),
    });
    const finding = byId(findings, 'redis.queue.reachable');
    expect(finding?.level).toBe('error');
    expect(JSON.stringify(findings)).not.toContain('queuepass');
    expect(JSON.stringify(findings)).not.toContain('cachepass');
    expect(finding?.message).toContain('queue.internal:6379');
    expect(byId(findings, 'redis.cache.policy')?.level).toBe('ok');
  });

  it('Q-08 an instance that does not allow CONFIG is a warning to check by hand, not an error', async () => {
    const findings = await checkRedisInstances(production, {
      read: instances({
        'queue.internal': new Error("ERR unknown command 'CONFIG'"),
        'cache.internal': new Error('NOPERM this user has no permissions to run the config command'),
      }),
    });
    expect(findings.map((finding) => finding.level)).toEqual(['warning', 'warning']);
    expect(byId(findings, 'redis.queue.reachable')?.fix).toContain('noeviction');
    expect(byId(findings, 'redis.cache.reachable')?.fix).toContain('allkeys-lru');
  });

  it('Q-08 describeInstance prints the host and the port, and never a user or a password', () => {
    expect(describeInstance('rediss://user:secret@Cache.Example.com:6380/2')).toBe('cache.example.com:6380');
    expect(describeInstance('redis://host')).toBe('host:6379');
    expect(describeInstance('secret-looking-text')).toBe('an address that is not a URL');
  });
});

describeRedis('Q-08 the doctor reads a real Valkey', (url) => {
  it('Q-08 reads the policy and the limit of the instance of the tests', async () => {
    const info = await readInstance(url);
    expect(info.policy).toBe('allkeys-lru');
    expect(info.maxmemoryBytes).toBeGreaterThanOrEqual(0);
  });

  it('Q-08 finds the cache of the tests ok, and says that the same server cannot also hold the queue', async () => {
    const findings = await checkRedisInstances({
      APP_ENV: 'production',
      QUEUE_DRIVER: 'redis',
      CACHE_DRIVER: 'redis',
      REDIS_URL: url,
      CACHE_REDIS_URL: url,
    });
    expect(byId(findings, 'redis.cache.policy')?.level).toBe('ok');
    expect(byId(findings, 'redis.queue.policy')?.level).toBe('error');
    expect(byId(findings, 'redis.separate')?.level).toBe('error');
  });

  it('Q-08 an instance that is not there is an error, and comes back fast', async () => {
    const started = Date.now();
    const findings = await checkRedisInstances({
      APP_ENV: 'production',
      QUEUE_DRIVER: 'redis',
      CACHE_DRIVER: 'memory',
      REDIS_URL: 'redis://:pw@127.0.0.1:1',
      CACHE_REDIS_URL: undefined,
    });
    expect(byId(findings, 'redis.queue.reachable')?.level).toBe('error');
    expect(JSON.stringify(findings)).not.toContain('pw@');
    expect(Date.now() - started).toBeLessThan(5_000);
  });
});
