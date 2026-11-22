/**
 * BieberKit
 *
 * @file        packages/core/src/config/core-env.test.ts
 * @description Tests for the core environment keys, generated secrets and the production safety checks (CFG-07).
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
import { ConfigError, EnvValidationError } from '../errors/errors.ts';
import type { EnvSource } from './env.ts';
import { describeEnv, redact } from './env.ts';
import { assertProductionSafe, coreEnv, readCoreEnv } from './core-env.ts';
import type { CoreEnv } from './core-env.ts';

const key = Buffer.alloc(32, 7).toString('base64');
const secret = 'a'.repeat(40);
const production = { APP_ENV: 'production', APP_KEY: key, AUTH_SECRET: secret } satisfies EnvSource;
const safeProduction = {
  ...production,
  QUEUE_DRIVER: 'redis',
  CACHE_DRIVER: 'redis',
  STORAGE_DISK: 's3',
} satisfies EnvSource;

let counter = 0;
const random = (): string => Buffer.alloc(32, ++counter).toString('base64');

function failureOf(read: () => unknown): EnvValidationError {
  try {
    read();
  } catch (error) {
    if (error instanceof EnvValidationError) return error;
    throw error;
  }
  throw new Error('Expected the read to throw.');
}

describe('CFG-01 core keys', () => {
  it('CFG-01 has the defaults of section 8.2', () => {
    const { env } = readCoreEnv({}, { random });
    expect(env).toMatchObject({
      APP_ENV: 'development',
      APP_URL: 'http://localhost:3000',
      APP_PORT: 3000,
      LOG_LEVEL: 'info',
      TRUST_PROXY: false,
      DB_POOL_MAX: 10,
      QUEUE_DRIVER: 'sync',
      CACHE_DRIVER: 'file',
      STORAGE_DISK: 'local',
      STORAGE_LOCAL_ROOT: './storage',
      MAIL_DRIVER: 'log',
      METRICS_PORT: 9464,
      APP_SINGLE_NODE: false,
      API_DOCS_PUBLIC: false,
      S3_FORCE_PATH_STYLE: false,
    });
    expect(env.DATABASE_READ_URLS).toEqual([]);
  });

  it('CFG-01 TRUST_PROXY accepts a boolean or a hop count', () => {
    expect(readCoreEnv({ TRUST_PROXY: 'true' }, { random }).env.TRUST_PROXY).toBe(true);
    expect(readCoreEnv({ TRUST_PROXY: '2' }, { random }).env.TRUST_PROXY).toBe(2);
    expect(failureOf(() => readCoreEnv({ TRUST_PROXY: 'lots' }, { random })).problems[0]?.key).toBe('TRUST_PROXY');
  });

  it('CFG-01 DATABASE_READ_URLS is a comma-separated list', () => {
    const { env } = readCoreEnv({ DATABASE_READ_URLS: 'postgres://a/db, postgres://b/db' }, { random });
    expect(env.DATABASE_READ_URLS).toEqual(['postgres://a/db', 'postgres://b/db']);
  });

  it('CFG-01 CACHE_PREFIX defaults to APP_NAME', () => {
    expect(readCoreEnv({ APP_NAME: 'shop' }, { random }).env.CACHE_PREFIX).toBe('shop');
    expect(readCoreEnv({ APP_NAME: 'shop', CACHE_PREFIX: 'x' }, { random }).env.CACHE_PREFIX).toBe('x');
  });

  it('CFG-01 CACHE_REDIS_URL and MIGRATE_DATABASE_URL fall back to their sibling in development only', () => {
    const source = { REDIS_URL: 'redis://localhost:6379', DATABASE_URL: 'postgres://localhost/db' };
    const dev = readCoreEnv(source, { random }).env;
    expect(dev.CACHE_REDIS_URL).toBe('redis://localhost:6379');
    expect(dev.MIGRATE_DATABASE_URL).toBe('postgres://localhost/db');
    const prod = readCoreEnv({ ...safeProduction, ...source }, { random }).env;
    expect(prod.CACHE_REDIS_URL).toBeUndefined();
    expect(prod.MIGRATE_DATABASE_URL).toBeUndefined();
  });

  it('CFG-env every invalid core key is reported together', () => {
    const error = failureOf(() => readCoreEnv({ APP_PORT: 'x', LOG_LEVEL: 'loud', APP_URL: 'nope' }, { random }));
    expect(error.problems.map((problem) => problem.key)).toEqual(['APP_URL', 'APP_PORT', 'LOG_LEVEL']);
  });
});

describe('CFG-07 generated secrets', () => {
  it('CFG-07 in development a missing APP_KEY and AUTH_SECRET get a random value and a warning', () => {
    const { env, warnings } = readCoreEnv({}, { random });
    expect(Buffer.from(env.APP_KEY, 'base64').length).toBeGreaterThanOrEqual(32);
    expect(env.AUTH_SECRET.length).toBeGreaterThanOrEqual(32);
    expect(warnings.join('\n')).toContain('APP_KEY');
    expect(warnings.join('\n')).toContain('AUTH_SECRET');
  });

  it('CFG-07 a given value is kept and not warned about', () => {
    const { env, warnings } = readCoreEnv({ APP_KEY: key, AUTH_SECRET: secret }, { random });
    expect(env.APP_KEY).toBe(key);
    expect(env.AUTH_SECRET).toBe(secret);
    expect(warnings).toEqual([]);
  });

  it('CFG-07 in production a missing APP_KEY and AUTH_SECRET are CFG_ENV_MISSING, reported with other problems', () => {
    const error = failureOf(() => readCoreEnv({ APP_ENV: 'production', APP_PORT: 'x' }, { random }));
    expect(error.problems.map((problem) => [problem.key, problem.code])).toEqual([
      ['APP_PORT', 'CFG_ENV_INVALID'],
      ['APP_KEY', 'CFG_ENV_MISSING'],
      ['AUTH_SECRET', 'CFG_ENV_MISSING'],
    ]);
  });

  it('CFG-07 the site secrets are generated in development, and required in production only with SITE_URL', () => {
    expect(readCoreEnv({}, { random }).env.SITE_SERVICE_TOKEN).toBeDefined();
    expect(readCoreEnv(safeProduction, { random }).env.SITE_SERVICE_TOKEN).toBeUndefined();
    const error = failureOf(() => readCoreEnv({ ...safeProduction, SITE_URL: 'https://site.test' }, { random }));
    expect(error.problems.map((problem) => problem.key)).toEqual(['SITE_SERVICE_TOKEN', 'SITE_REVALIDATE_SECRET']);
  });

  it('CFG-07 never gives two secrets the same generated value', () => {
    const { env } = readCoreEnv({}, { random });
    expect(new Set([env.APP_KEY, env.AUTH_SECRET, env.SITE_SERVICE_TOKEN, env.SITE_REVALIDATE_SECRET]).size).toBe(4);
  });
});

const read = (source: EnvSource): CoreEnv => readCoreEnv(source, { random }).env;

function unsafeFailure(source: EnvSource): ConfigError {
  try {
    assertProductionSafe(read(source));
  } catch (error) {
    if (error instanceof ConfigError) return error;
    throw error;
  }
  throw new Error('Expected a throw.');
}

describe('CFG-07 assertProductionSafe', () => {
  it('CFG-07 passes a safe production setup', () => {
    expect(() => assertProductionSafe(read(safeProduction))).not.toThrow();
  });

  it('CFG-07 does nothing outside production', () => {
    expect(() => assertProductionSafe(read({}))).not.toThrow();
    expect(() => assertProductionSafe(read({ APP_ENV: 'test' }))).not.toThrow();
  });

  it('CFG-07 refuses local storage without APP_SINGLE_NODE', () => {
    expect(() => assertProductionSafe(read({ ...safeProduction, STORAGE_DISK: 'local' }))).toThrowError(
      expect.objectContaining({ code: 'CFG_UNSAFE_PRODUCTION', message: expect.stringContaining('STORAGE_DISK') }),
    );
  });

  it.each(['memory', 'file'])('CFG-07 refuses the %s cache without APP_SINGLE_NODE', (driver) => {
    expect(() => assertProductionSafe(read({ ...safeProduction, CACHE_DRIVER: driver }))).toThrowError(
      expect.objectContaining({ message: expect.stringContaining('CACHE_DRIVER') }),
    );
  });

  it('CFG-07 refuses the sync queue driver even on a single node', () => {
    expect(() =>
      assertProductionSafe(read({ ...safeProduction, QUEUE_DRIVER: 'sync', APP_SINGLE_NODE: 'true' })),
    ).toThrowError(expect.objectContaining({ message: expect.stringContaining('QUEUE_DRIVER') }));
  });

  it('CFG-07 refuses an APP_KEY under 32 bytes and an AUTH_SECRET under 32 bytes', () => {
    const short = Buffer.alloc(16, 1).toString('base64');
    expect(() => assertProductionSafe(read({ ...safeProduction, APP_KEY: short }))).toThrowError(
      expect.objectContaining({ message: expect.stringContaining('APP_KEY') }),
    );
    expect(() => assertProductionSafe(read({ ...safeProduction, AUTH_SECRET: 'short' }))).toThrowError(
      expect.objectContaining({ message: expect.stringContaining('AUTH_SECRET') }),
    );
  });

  it('CFG-07 APP_SINGLE_NODE=true allows local storage and the file cache', () => {
    const single = { ...production, QUEUE_DRIVER: 'database', APP_SINGLE_NODE: 'true' };
    expect(() => assertProductionSafe(read(single))).not.toThrow();
  });

  it('CFG-07 reports every unsafe setting together, each with a fix', () => {
    const error = unsafeFailure(production);
    for (const name of ['STORAGE_DISK', 'CACHE_DRIVER', 'QUEUE_DRIVER']) expect(error.message).toContain(name);
    expect(error.fix).toContain('APP_SINGLE_NODE');
    expect(error.code).toBe('CFG_UNSAFE_PRODUCTION');
  });
});

describe('CFG-05 and CFG-06 on the core keys', () => {
  it('CFG-05 redact hides every secret core key', () => {
    const { env } = readCoreEnv(
      {
        DATABASE_URL: 'postgres://user:pw@host/db',
        REDIS_URL: 'redis://:pw@host',
        SMTP_URL: 'smtp://u:pw@host',
        S3_SECRET_ACCESS_KEY: 'pw',
      },
      { random },
    );
    const text = JSON.stringify(redact(coreEnv, env));
    for (const leaked of [env.APP_KEY, env.AUTH_SECRET, 'user:pw', ':pw@', 'u:pw', '"pw"'])
      expect(text).not.toContain(leaked);
  });

  it('CFG-06 describeEnv lists every key of section 8.2 and marks the secrets', () => {
    const rows = describeEnv(coreEnv);
    const secrets = rows.filter((row) => row.secret).map((row) => row.key);
    expect(secrets).toEqual(
      expect.arrayContaining([
        'APP_KEY',
        'APP_KEY_PREVIOUS',
        'AUTH_SECRET',
        'DATABASE_URL',
        'REDIS_URL',
        'SMTP_URL',
        'S3_ACCESS_KEY_ID',
        'S3_SECRET_ACCESS_KEY',
        'SITE_SERVICE_TOKEN',
        'SITE_REVALIDATE_SECRET',
        'CACHE_REDIS_URL',
        'MIGRATE_DATABASE_URL',
      ]),
    );
    expect(rows.map((row) => row.key)).toEqual(
      expect.arrayContaining([
        'APP_NAME',
        'APP_ENV',
        'APP_URL',
        'APP_PORT',
        'LOG_LEVEL',
        'TRUST_PROXY',
        'DB_CONNECTION',
        'DB_POOL_MAX',
        'QUEUE_DRIVER',
        'CACHE_DRIVER',
        'CACHE_PREFIX',
        'STORAGE_DISK',
        'MAIL_DRIVER',
        'OTEL_EXPORTER_OTLP_ENDPOINT',
        'METRICS_PORT',
        'APP_SINGLE_NODE',
        'API_DOCS_PUBLIC',
        'SITE_URL',
        'SITE_API_URL',
      ]),
    );
    expect(rows.every((row) => row.description !== '')).toBe(true);
  });
});
