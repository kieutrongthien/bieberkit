/**
 * BieberKit
 *
 * @file        packages/cache/src/adapters/bentocache/doctor.ts
 * @description The checks of bieberkit doctor on the Redis or Valkey instances: the queue needs noeviction, the cache needs an eviction policy, and they must not be one instance (Q-08, CFG-07).
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

import { Redis } from 'ioredis';

export interface InstanceInfo {
  /** The value of `maxmemory-policy`. */
  readonly policy: string;
  /** The value of `maxmemory` in bytes, `0` for no limit. */
  readonly maxmemoryBytes: number;
}

export interface RedisInstanceConfig {
  readonly APP_ENV: string;
  readonly QUEUE_DRIVER: 'sync' | 'database' | 'redis';
  readonly CACHE_DRIVER: 'memory' | 'file' | 'database' | 'redis';
  readonly REDIS_URL: string | undefined;
  readonly CACHE_REDIS_URL: string | undefined;
}

export interface DoctorFinding {
  /** A stable name, for example `redis.queue.policy`. */
  readonly id: string;
  readonly level: 'ok' | 'warning' | 'error';
  readonly message: string;
  /** What to do. Present for a warning and an error. */
  readonly fix?: string;
}

export interface RedisInstanceChecks {
  /** Reads an instance. For tests; defaults to `CONFIG GET` over ioredis. */
  readonly read?: (url: string) => Promise<InstanceInfo>;
}

/** `host:port` of a Redis URL, without the user and the password, so that a finding can be printed and logged. */
export function describeInstance(url: string): string {
  try {
    const parsed = new URL(url);
    return `${parsed.hostname.toLowerCase()}:${parsed.port === '' ? '6379' : parsed.port}`;
  } catch {
    return 'an address that is not a URL';
  }
}

/** True when two URLs name one server. Logical databases (`/0`, `/1`) of one server share its memory and its policy, so they count as one. */
export function sameInstance(a: string, b: string): boolean {
  const left = describeInstance(a);
  return !left.startsWith('an address') && left === describeInstance(b);
}

/** Reads the policy and the memory limit of an instance, with a short timeout and no retry. */
export async function readInstance(url: string): Promise<InstanceInfo> {
  const client = new Redis(url, {
    connectTimeout: 3_000,
    maxRetriesPerRequest: 1,
    retryStrategy: () => null,
    lazyConnect: true,
  });
  client.on('error', () => undefined);
  try {
    await client.connect();
    const [policy, memory] = await Promise.all([
      client.config('GET', 'maxmemory-policy'),
      client.config('GET', 'maxmemory'),
    ]);
    const policyValue = Array.isArray(policy) ? String(policy[1] ?? '') : '';
    const memoryValue = Array.isArray(memory) ? Number(memory[1] ?? 0) : 0;
    if (policyValue === '') throw new Error('The server did not answer CONFIG GET maxmemory-policy.');
    return { policy: policyValue, maxmemoryBytes: Number.isFinite(memoryValue) ? memoryValue : 0 };
  } finally {
    client.disconnect();
  }
}

type Role = 'queue' | 'cache';

async function check(role: Role, url: string, read: (url: string) => Promise<InstanceInfo>): Promise<DoctorFinding[]> {
  const where = describeInstance(url);
  let info: InstanceInfo;
  try {
    info = await read(url);
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    // Managed services often turn CONFIG off: that is a thing to check by hand, not a failure of the instance.
    const disabled =
      /unknown command|CONFIG|NOPERM|not allowed/i.test(reason) && !/ECONNREFUSED|ETIMEDOUT|ENOTFOUND/.test(reason);
    return [
      {
        id: `redis.${role}.reachable`,
        level: disabled ? 'warning' : 'error',
        message: disabled
          ? `The ${role} instance at ${where} does not allow CONFIG, so its policy could not be read.`
          : `The ${role} instance at ${where} could not be reached (${reason.replace(url, where)}).`,
        fix: disabled
          ? `Check by hand that maxmemory-policy is ${role === 'queue' ? 'noeviction' : 'an evicting policy such as allkeys-lru'}.`
          : `Check ${role === 'queue' ? 'REDIS_URL' : 'CACHE_REDIS_URL'} and that the server runs.`,
      },
    ];
  }
  const findings: DoctorFinding[] = [];
  if (role === 'queue') {
    findings.push(
      info.policy === 'noeviction'
        ? {
            id: 'redis.queue.policy',
            level: 'ok',
            message: `The queue instance at ${where} has maxmemory-policy noeviction.`,
          }
        : {
            id: 'redis.queue.policy',
            level: 'error',
            message: `The queue instance at ${where} has maxmemory-policy ${info.policy}: when memory is full it deletes jobs.`,
            fix: 'Run CONFIG SET maxmemory-policy noeviction, and set it in the configuration of the server (Q-08).',
          },
    );
  } else {
    findings.push(
      info.policy === 'noeviction'
        ? {
            id: 'redis.cache.policy',
            level: 'error',
            message: `The cache instance at ${where} has maxmemory-policy noeviction: when memory is full every write of the cache fails.`,
            fix: 'Run CONFIG SET maxmemory-policy allkeys-lru, and set it in the configuration of the server (Q-08).',
          }
        : {
            id: 'redis.cache.policy',
            level: 'ok',
            message: `The cache instance at ${where} has maxmemory-policy ${info.policy}.`,
          },
    );
    if (info.maxmemoryBytes === 0) {
      findings.push({
        id: 'redis.cache.maxmemory',
        level: 'warning',
        message: `The cache instance at ${where} has no memory limit, so the policy never runs and the cache grows until the host is full.`,
        fix: 'Set maxmemory, for example CONFIG SET maxmemory 512mb.',
      });
    }
  }
  return findings;
}

/**
 * The checks of `bieberkit doctor` on Redis or Valkey (Q-08). The queue instance must have `noeviction`, because a job that is evicted is
 * lost. The cache instance must have an evicting policy, because a full cache with `noeviction` fails every write. One server has one
 * policy, so the two cannot be one server: in production that is an error, and in development, where `CACHE_REDIS_URL` falls back to
 * `REDIS_URL`, a warning. An instance that is not used (another driver) is not read.
 */
export async function checkRedisInstances(
  config: RedisInstanceConfig,
  checks: RedisInstanceChecks = {},
): Promise<DoctorFinding[]> {
  const read = checks.read ?? readInstance;
  const findings: DoctorFinding[] = [];
  const queueUrl = config.QUEUE_DRIVER === 'redis' ? config.REDIS_URL : undefined;
  const cacheUrl = config.CACHE_DRIVER === 'redis' ? config.CACHE_REDIS_URL : undefined;
  if (config.QUEUE_DRIVER === 'redis' && queueUrl === undefined) {
    findings.push({
      id: 'redis.queue.url',
      level: 'error',
      message: 'QUEUE_DRIVER=redis needs REDIS_URL.',
      fix: 'Set REDIS_URL to the Valkey of the queue.',
    });
  }
  if (config.CACHE_DRIVER === 'redis' && cacheUrl === undefined) {
    findings.push({
      id: 'redis.cache.url',
      level: 'error',
      message: 'CACHE_DRIVER=redis needs CACHE_REDIS_URL.',
      fix: 'Set CACHE_REDIS_URL to the Valkey of the cache. It is not the one of the queue.',
    });
  }
  if (queueUrl !== undefined && cacheUrl !== undefined && sameInstance(queueUrl, cacheUrl)) {
    findings.push({
      id: 'redis.separate',
      level: config.APP_ENV === 'production' ? 'error' : 'warning',
      message: `The queue and the cache use the same instance, ${describeInstance(queueUrl)}. One instance has one policy, so a full cache would delete jobs, or a full queue would stop the cache.`,
      fix: 'Run a second Valkey for the cache and set CACHE_REDIS_URL to it (Q-08).',
    });
  }
  const [queue, cache] = await Promise.all([
    queueUrl === undefined ? [] : check('queue', queueUrl, read),
    cacheUrl === undefined ? [] : check('cache', cacheUrl, read),
  ]);
  findings.push(...queue, ...cache);
  return findings;
}
