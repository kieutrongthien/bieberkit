/**
 * BieberKit
 *
 * @file        packages/core/src/config/load-env.test.ts
 * @description Tests for loadEnv, the only function that reads process.env (CFG-02, CFG-03, CFG-04, CFG-07).
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

import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { defineEnv, env } from './env.ts';
import { loadEnv } from './load-env.ts';

const dirs: string[] = [];
afterEach(() => {
  vi.unstubAllEnvs();
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

function envFile(text: string): string {
  const dir = mkdtempSync(join(tmpdir(), 'bk-load-'));
  dirs.push(dir);
  const file = join(dir, '.env');
  writeFileSync(file, text);
  return file;
}

describe('CFG-02 loadEnv', () => {
  it('CFG-02 reads process.env when no source is given', () => {
    vi.stubEnv('APP_PORT', '4100');
    vi.stubEnv('APP_NAME', 'from-process');
    const { env: values } = loadEnv({ envFile: false });
    expect(values.APP_PORT).toBe(4100);
    expect(values.APP_NAME).toBe('from-process');
  });

  it('CFG-02 does not write to process.env', () => {
    const file = envFile('LOADENV_PROBE_KEY=1\n');
    loadEnv({ source: {}, envFile: file });
    expect(process.env['LOADENV_PROBE_KEY']).toBeUndefined();
  });
});

describe('CFG-03 and CFG-04 .env file', () => {
  it('CFG-03 real variables win over the file, and the file fills the rest', () => {
    const file = envFile('APP_PORT=3000\nAPP_NAME=from-file\n');
    const { env: values } = loadEnv({ source: { APP_PORT: '9000' }, envFile: file });
    expect(values.APP_PORT).toBe(9000);
    expect(values.APP_NAME).toBe('from-file');
  });

  it('CFG-04 a missing file is not an error, also in production', () => {
    const source = {
      APP_ENV: 'production',
      APP_KEY: Buffer.alloc(32, 1).toString('base64'),
      AUTH_SECRET: 'x'.repeat(40),
      QUEUE_DRIVER: 'redis',
      CACHE_DRIVER: 'redis',
      STORAGE_DISK: 's3',
    };
    expect(() => loadEnv({ source, envFile: join(tmpdir(), 'bk-no-such-dir', '.env') })).not.toThrow();
  });

  it('CFG-04 envFile false skips the file', () => {
    envFile('APP_NAME=from-file\n');
    expect(loadEnv({ source: {}, envFile: false }).env.APP_NAME).toBe('bieberkit-app');
  });
});

describe('CFG-07 loadEnv', () => {
  it('CFG-07 refuses an unsafe production setup', () => {
    const source = {
      APP_ENV: 'production',
      APP_KEY: Buffer.alloc(32, 1).toString('base64'),
      AUTH_SECRET: 'x'.repeat(40),
    };
    expect(() => loadEnv({ source, envFile: false })).toThrowError(
      expect.objectContaining({ code: 'CFG_UNSAFE_PRODUCTION' }),
    );
  });

  it('CFG-01 reads the keys of plugins next to the core keys', () => {
    const seo = defineEnv({ SEO_SITEMAP: env.boolean().default(true) });
    const result = loadEnv({
      source: { SEO_SITEMAP: 'false' },
      envFile: false,
      extra: [{ name: 'seo', prefix: 'SEO_', schema: seo }],
    });
    expect(result.extra['SEO_SITEMAP']).toBe(false);
  });

  it('CFG-07 returns the warnings about generated secrets', () => {
    expect(loadEnv({ source: {}, envFile: false }).warnings.length).toBe(2);
  });
});
