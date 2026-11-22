/**
 * BieberKit
 *
 * @file        packages/core/src/config/define-config.test.ts
 * @description Tests for defineConfig, config sections and validateConfig (CFG-08, CFG-09, spec 8.3).
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
import { ConfigValidationError } from '../errors/errors.ts';
import { defineConfig, defineConfigSection, validateConfig } from './define-config.ts';

declare module '../index.ts' {
  interface ConfigSections {
    admin?: { path: string; adapter: string };
    theme?: { radius: number };
  }
}

const valid = {
  name: 'example-project',
  author: 'Nguyen Van A <a@example.com>',
  license: 'UNLICENSED',
  database: { dialect: 'postgres' },
  tenancy: { mode: 'single' },
  locales: { default: 'vi', supported: ['vi', 'en', 'zh'] },
  plugins: ['@bieberkit/plugin-users', ['@bieberkit/plugin-seo', { sitemap: true }]],
} as const;

const adminSection = defineConfigSection('admin', {
  parse(input: unknown): { path: string; adapter: string } {
    if (
      typeof input === 'object' &&
      input !== null &&
      'path' in input &&
      'adapter' in input &&
      typeof input.path === 'string' &&
      typeof input.adapter === 'string'
    ) {
      return { path: input.path, adapter: input.adapter };
    }
    throw new Error('admin needs a path and an adapter');
  },
});

function failure(input: unknown, sections: Parameters<typeof validateConfig>[1] = {}): ConfigValidationError {
  try {
    validateConfig(input, sections);
  } catch (error) {
    if (error instanceof ConfigValidationError) return error;
    throw error;
  }
  throw new Error('Expected validateConfig to throw.');
}

const keysOf = (error: ConfigValidationError): string[] => error.problems.map((problem) => problem.key);

describe('CFG-09 defineConfig', () => {
  it('CFG-09 is a typing helper and returns its argument', () => {
    const input = defineConfig({ ...valid, plugins: [...valid.plugins] });
    expect(input.name).toBe('example-project');
  });

  it('CFG-09 checks the shape at compile time', () => {
    // @ts-expect-error tenancy.mode is single or shared-schema
    defineConfig({ ...valid, plugins: [], tenancy: { mode: 'multi' } });
    expect(true).toBe(true);
  });
});

describe('CFG-09 validateConfig', () => {
  it('CFG-09 accepts the example of spec 8.3', () => {
    expect(validateConfig(valid).name).toBe('example-project');
  });

  it('CFG-09 returns the validated input, with the values of the sections parsed', () => {
    const result = validateConfig(
      { ...valid, admin: { path: '/admin', adapter: '@bieberkit/admin-antd', extra: 1 } },
      { sections: [adminSection] },
    );
    expect(result.admin).toEqual({ path: '/admin', adapter: '@bieberkit/admin-antd' });
  });

  it('CFG-09 reports every problem together, with the dotted path in key and a fix', () => {
    const error = failure({
      ...valid,
      name: '',
      database: { dialect: 'oracle' },
      tenancy: { mode: 'multi' },
      locales: { default: 'fr', supported: ['vi'] },
    });
    expect(keysOf(error)).toEqual(['name', 'database.dialect', 'tenancy.mode', 'locales.default']);
    expect(error.code).toBe('CFG_CONFIG_INVALID');
    expect(
      error.problems.every(
        (problem) => problem.code === 'CFG_CONFIG_INVALID' && problem.fix !== '' && problem.message !== '',
      ),
    ).toBe(true);
  });

  it('CFG-09 uses the same error format as env validation: code, problems with key, code, message and fix', () => {
    const error = failure({});
    expect(error.problems[0]).toEqual({
      key: expect.any(String),
      code: expect.any(String),
      message: expect.any(String),
      fix: expect.any(String),
    });
    expect(error.safeMessage).not.toContain('name');
  });

  it('CFG-09 a value that is not an object is one problem', () => {
    for (const bad of [null, undefined, 'config', 42, []]) expect(keysOf(failure(bad))).toEqual(['(root)']);
  });

  it('CFG-09 missing fields are reported by path', () => {
    expect(keysOf(failure({}))).toEqual(['name', 'author', 'license', 'database', 'tenancy', 'locales', 'plugins']);
  });

  it('CFG-09 supported locales are a non-empty list of language tags and include the default', () => {
    expect(keysOf(failure({ ...valid, locales: { default: 'vi', supported: [] } }))).toContain('locales.supported');
    expect(keysOf(failure({ ...valid, locales: { default: 'vi', supported: ['vi', 'not a tag'] } }))).toEqual([
      'locales.supported[1]',
    ]);
    expect(
      validateConfig({ ...valid, locales: { default: 'pt-BR', supported: ['pt-BR', 'en'] } }).locales.default,
    ).toBe('pt-BR');
  });

  it('CFG-09 plugins are names or [name, options] pairs, without repeats', () => {
    expect(keysOf(failure({ ...valid, plugins: [42] }))).toEqual(['plugins[0]']);
    expect(keysOf(failure({ ...valid, plugins: [['@bieberkit/plugin-seo']] }))).toEqual(['plugins[0]']);
    expect(keysOf(failure({ ...valid, plugins: [['@bieberkit/plugin-seo', 'yes']] }))).toEqual(['plugins[0][1]']);
    expect(keysOf(failure({ ...valid, plugins: ['@bieberkit/plugin-seo', ['@bieberkit/plugin-seo', {}]] }))).toEqual([
      'plugins[1]',
    ]);
    expect(validateConfig({ ...valid, plugins: [] }).plugins).toEqual([]);
  });
});

describe('CFG-09 sections', () => {
  it('CFG-09 an unknown top-level key is CFG_CONFIG_UNKNOWN and names the key', () => {
    const error = failure({ ...valid, admn: {} });
    expect(error.problems).toEqual([expect.objectContaining({ key: 'admn', code: 'CFG_CONFIG_UNKNOWN' })]);
    expect(error.problems[0]?.fix).toContain('admn');
  });

  it('CFG-09 a key becomes known when its section is passed in', () => {
    expect(() =>
      validateConfig({ ...valid, admin: { path: '/admin', adapter: 'x' } }, { sections: [adminSection] }),
    ).not.toThrow();
  });

  it('CFG-09 a section parser failure is a problem under the section key', () => {
    const error = failure({ ...valid, admin: { path: 1 } }, { sections: [adminSection] });
    expect(error.problems).toEqual([
      expect.objectContaining({
        key: 'admin',
        code: 'CFG_CONFIG_INVALID',
        message: expect.stringContaining('admin needs a path'),
      }),
    ]);
  });

  it('CFG-09 a parser with issues, like a Zod schema, gives one problem per issue under the section path', () => {
    const themeSection = defineConfigSection('theme', {
      parse(): never {
        throw Object.assign(new Error('invalid'), {
          issues: [
            { path: ['radius'], message: 'Expected number' },
            { path: ['colors', 'primary'], message: 'Invalid color' },
          ],
        });
      },
    });
    expect(keysOf(failure({ ...valid, theme: {} }, { sections: [themeSection] }))).toEqual([
      'theme.radius',
      'theme.colors.primary',
    ]);
  });

  it('CFG-09 an absent optional section is not parsed', () => {
    expect(() => validateConfig(valid, { sections: [adminSection] })).not.toThrow();
  });

  it('CFG-09 problems of the core fields and of sections come together', () => {
    const error = failure({ ...valid, name: '', admin: {}, extra: 1 }, { sections: [adminSection] });
    expect(keysOf(error)).toEqual(['name', 'extra', 'admin']);
  });
});

describe('CFG-08 no secrets in the config file', () => {
  it.each([
    ['password'],
    ['apiKey'],
    ['api_key'],
    ['secret'],
    ['clientSecret'],
    ['token'],
    ['authorization'],
    ['privateKey'],
  ])('CFG-08 a key named %s is CFG_CONFIG_SECRET', (name) => {
    const error = failure(
      { ...valid, admin: { path: '/admin', adapter: 'x', [name]: 'value' } },
      { sections: [adminSection] },
    );
    expect(error.problems).toEqual([expect.objectContaining({ key: `admin.${name}`, code: 'CFG_CONFIG_SECRET' })]);
    expect(error.problems[0]?.fix).toContain('environment');
  });

  it('CFG-08 the check also covers plugin options and the sections that parsers would drop', () => {
    const error = failure({ ...valid, plugins: [['@bieberkit/plugin-mail', { smtp: { password: 'x' } }]] });
    expect(keysOf(error)).toEqual(['plugins[0][1].smtp.password']);
  });

  it('CFG-08 the message never repeats the value', () => {
    const error = failure({ ...valid, plugins: [['@bieberkit/plugin-mail', { token: 'super-secret-value' }]] });
    expect(JSON.stringify(error.problems)).not.toContain('super-secret-value');
  });

  it('CFG-08 a key such as tokenizer is not a secret by itself... only whole words count', () => {
    expect(() =>
      validateConfig({ ...valid, plugins: [['@bieberkit/plugin-search', { tokenizer: 'icu', passwordless: true }]] }),
    ).not.toThrow();
  });
});
