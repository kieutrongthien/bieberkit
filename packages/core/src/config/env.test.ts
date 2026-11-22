/**
 * BieberKit
 *
 * @file        packages/core/src/config/env.test.ts
 * @description Tests for the environment schema: types, defaults, merging, redaction and the .env.example description (CFG-01, CFG-05, CFG-06).
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
import { defineEnv, describeEnv, env, mergeEnv, readEnv, redact } from './env.ts';

const schema = defineEnv({
  PORT: env.int({ min: 1, max: 65535 }).default(3000).describe('HTTP port'),
  LOG_LEVEL: env.enum(['debug', 'info', 'warn']).default('info').describe('Log level'),
  DEBUG: env.boolean().default(false).describe('Verbose mode'),
  PUBLIC_URL: env.url().describe('Public base URL'),
  SIGNING_KEY: env.base64().secret().describe('Signing key'),
  NOTE: env.string().optional().describe('Free text'),
});

/** Runs `read` and returns the error it must throw. Keeps `expect` out of catch blocks. */
function failureOf(read: () => unknown): EnvValidationError {
  try {
    read();
  } catch (error) {
    if (error instanceof EnvValidationError) return error;
    throw error;
  }
  throw new Error('Expected the read to throw.');
}

const valid = {
  PUBLIC_URL: 'https://example.test',
  SIGNING_KEY: 'c2VjcmV0LXZhbHVlLXNlY3JldC12YWx1ZS0xMjM0NTY3OA==',
};

describe('CFG-01 defineEnv and readEnv', () => {
  it('CFG-01 applies defaults and converts types', () => {
    const values = readEnv(schema, valid);
    expect(values.PORT).toBe(3000);
    expect(values.LOG_LEVEL).toBe('info');
    expect(values.DEBUG).toBe(false);
    expect(values.PUBLIC_URL).toBe('https://example.test');
    expect(values.NOTE).toBeUndefined();
  });

  it('CFG-01 reads each type from a string', () => {
    const values = readEnv(schema, { ...valid, PORT: '8080', LOG_LEVEL: 'warn', DEBUG: 'TRUE', NOTE: 'hi' });
    expect(values.PORT).toBe(8080);
    expect(values.LOG_LEVEL).toBe('warn');
    expect(values.DEBUG).toBe(true);
    expect(values.NOTE).toBe('hi');
  });

  it('CFG-01 booleans accept true, false, 1 and 0', () => {
    for (const [raw, expected] of [
      ['true', true],
      ['false', false],
      ['1', true],
      ['0', false],
    ] as const) {
      expect(readEnv(schema, { ...valid, DEBUG: raw }).DEBUG).toBe(expected);
    }
  });

  it('CFG-01 treats an empty string as unset', () => {
    expect(readEnv(schema, { ...valid, PORT: '' }).PORT).toBe(3000);
    expect(() => readEnv(schema, { ...valid, PUBLIC_URL: '' })).toThrow(EnvValidationError);
  });

  it('CFG-01 a missing required key is CFG_ENV_MISSING and names the key', () => {
    const problem = failureOf(() => readEnv(schema, { SIGNING_KEY: valid.SIGNING_KEY })).problems[0];
    expect(problem?.key).toBe('PUBLIC_URL');
    expect(problem?.code).toBe('CFG_ENV_MISSING');
    expect(problem?.message).toContain('PUBLIC_URL');
    expect(problem?.fix).toContain('PUBLIC_URL');
  });

  it('CFG-01 rejects values of the wrong type with CFG_ENV_INVALID', () => {
    const cases: readonly Record<string, string>[] = [
      { PORT: 'abc' },
      { PORT: '12.5' },
      { PORT: '0' },
      { PORT: '70000' },
      { LOG_LEVEL: 'loud' },
      { DEBUG: 'yes' },
      { PUBLIC_URL: 'not a url' },
      { SIGNING_KEY: '***' },
    ];
    for (const bad of cases) {
      expect(failureOf(() => readEnv(schema, { ...valid, ...bad })).code).toBe('CFG_ENV_INVALID');
    }
  });

  it('CFG-env reports every problem in one error', () => {
    const keys = failureOf(() => readEnv(schema, { PORT: 'abc', DEBUG: 'maybe' })).problems.map(
      (problem) => problem.key,
    );
    expect(keys).toEqual(['PORT', 'DEBUG', 'PUBLIC_URL', 'SIGNING_KEY']);
  });

  it('CFG-01 builders are immutable', () => {
    const base = env.int();
    const withDefault = base.default(5);
    expect(readEnv(defineEnv({ A: withDefault }), {}).A).toBe(5);
    expect(() => readEnv(defineEnv({ A: base }), {})).toThrow(EnvValidationError);
  });

  it('CFG-01 refuses a key name that is not upper snake case', () => {
    expect(() => defineEnv({ 'bad-key': env.string() })).toThrow(ConfigError);
  });
});

describe('CFG-05 redaction', () => {
  it('CFG-05 redact hides secret values only', () => {
    const values = readEnv(schema, valid);
    const safe = redact(schema, values);
    expect(safe['SIGNING_KEY']).toBe('[redacted]');
    expect(safe['PORT']).toBe(3000);
    expect(JSON.stringify(safe)).not.toContain(valid.SIGNING_KEY);
  });

  it('CFG-05 an invalid secret never appears in the error', () => {
    const error = failureOf(() => readEnv(schema, { ...valid, SIGNING_KEY: '***top-secret***' }));
    expect(JSON.stringify(error.problems) + error.message).not.toContain('top-secret');
  });
});

describe('CFG-06 describeEnv', () => {
  it('CFG-06 returns one row per key and never a secret value', () => {
    const secretWithDefault = defineEnv({ TOKEN: env.string().secret().default('hunter2').describe('Token') });
    const rows = describeEnv(schema);
    expect(rows.map((row) => row.key)).toEqual(['PORT', 'LOG_LEVEL', 'DEBUG', 'PUBLIC_URL', 'SIGNING_KEY', 'NOTE']);
    expect(rows[0]).toMatchObject({
      key: 'PORT',
      type: 'int',
      required: false,
      default: '3000',
      secret: false,
      description: 'HTTP port',
    });
    expect(rows[1]?.values).toEqual(['debug', 'info', 'warn']);
    expect(rows[3]?.required).toBe(true);
    expect(rows[4]?.secret).toBe(true);
    expect(JSON.stringify(describeEnv(secretWithDefault))).not.toContain('hunter2');
  });
});

describe('CFG-01 mergeEnv', () => {
  const core = defineEnv({ PORT: env.int().default(3000) });

  it('CFG-01 merges core and plugin keys into one schema', () => {
    const seo = defineEnv({ SEO_SITEMAP: env.boolean().default(true) });
    const merged = mergeEnv([
      { name: 'core', schema: core },
      { name: 'seo', prefix: 'SEO_', schema: seo },
    ]);
    const values = readEnv(merged, { SEO_SITEMAP: 'false' });
    expect(values['PORT']).toBe(3000);
    expect(values['SEO_SITEMAP']).toBe(false);
  });

  it('CFG-01 rejects a key declared twice with CFG_ENV_DUPLICATE', () => {
    const other = defineEnv({ PORT: env.int().default(1) });
    expect(() =>
      mergeEnv([
        { name: 'core', schema: core },
        { name: 'x', schema: other },
      ]),
    ).toThrowError(expect.objectContaining({ code: 'CFG_ENV_DUPLICATE' }));
  });

  it('CFG-01 rejects a plugin key without the plugin prefix with CFG_ENV_PREFIX', () => {
    const stray = defineEnv({ PORTAL: env.string().optional() });
    expect(() => mergeEnv([{ name: 'seo', prefix: 'SEO_', schema: stray }])).toThrowError(
      expect.objectContaining({ code: 'CFG_ENV_PREFIX' }),
    );
  });
});
