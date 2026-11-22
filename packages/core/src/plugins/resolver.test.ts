/**
 * BieberKit
 *
 * @file        packages/core/src/plugins/resolver.test.ts
 * @description Tests for the plugin resolver shared by the scaffolder, bieberkit add and the kernel (spec 11.2, ADR 0011, PLG-07).
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
import type { Manifest } from './manifest.ts';
import { PluginError } from './errors.ts';
import { resolvePlugins } from './resolver.ts';
import type { Installed } from './resolver.ts';

const EMPTY: Manifest = {
  core: '^1.0.0',
  dialects: ['postgres', 'mysql', 'sqlite'],
  requires: {},
  conflicts: [],
  env: [],
  tables: [],
  routes: [],
  permissions: [],
  admin: [],
};

function plugin(name: string, patch: Partial<Manifest> = {}, version = '1.0.0'): Installed {
  return { name, version, manifest: { ...EMPTY, ...patch } };
}

const CTX = { core: '1.4.0', dialect: 'postgres' } as const;
const P = (short: string): string => `@bieberkit/plugin-${short}`;

function failure(
  plugins: readonly Installed[],
  ctx: { core: string; dialect: 'postgres' | 'mysql' | 'sqlite' } = CTX,
): PluginError {
  try {
    resolvePlugins(plugins, ctx);
  } catch (error) {
    if (error instanceof PluginError) return error;
    throw error;
  }
  throw new Error('Expected resolvePlugins to throw.');
}

describe('PLG-resolve order', () => {
  it('PLG-resolve an empty list resolves to an empty order', () => {
    expect(resolvePlugins([], CTX)).toEqual({ order: [] });
  });

  it('PLG-resolve puts every plugin after the plugins it requires', () => {
    const plugins = [
      plugin(P('seo'), { requires: { [P('pages')]: '^1.0.0' } }),
      plugin(P('pages'), { requires: { [P('users')]: '^1.0.0' } }),
      plugin(P('users')),
    ];
    expect(resolvePlugins(plugins, CTX).order).toEqual([P('users'), P('pages'), P('seo')]);
  });

  it('PLG-resolve breaks ties by name, so the order does not depend on the input order', () => {
    const plugins = [plugin(P('c')), plugin(P('a')), plugin(P('b'), { requires: { [P('a')]: '*' } })];
    const expected = [P('a'), P('b'), P('c')];
    expect(resolvePlugins(plugins, CTX).order).toEqual(expected);
    expect(resolvePlugins(plugins.toReversed(), CTX).order).toEqual(expected);
    expect(resolvePlugins([...plugins.slice(1), ...plugins.slice(0, 1)], CTX).order).toEqual(expected);
  });

  it('PLG-resolve returns plain data, so every caller gets the same answer', () => {
    const result = resolvePlugins([plugin(P('a')), plugin(P('b'))], CTX);
    expect(JSON.parse(JSON.stringify(result))).toEqual(result);
  });

  it('PLG-resolve does not change its input', () => {
    const plugins = [plugin(P('b'), { requires: { [P('a')]: '*' } }), plugin(P('a'))];
    const before = JSON.stringify(plugins);
    resolvePlugins(plugins, CTX);
    expect(JSON.stringify(plugins)).toBe(before);
  });
});

describe('PLG-resolve checks', () => {
  it('PLG_CORE_RANGE when core is outside the range of a plugin', () => {
    const error = failure([plugin(P('seo'), { core: '^2.0.0' })]);
    expect(error.code).toBe('PLG_CORE_RANGE');
    expect(error.message).toContain(P('seo'));
    expect(error.message).toContain('^2.0.0');
    expect(error.message).toContain('1.4.0');
  });

  it('PLG_DIALECT when the project dialect is not supported', () => {
    const error = failure([plugin(P('seo'), { dialects: ['postgres'] })], { core: '1.4.0', dialect: 'sqlite' });
    expect(error.code).toBe('PLG_DIALECT');
    expect(error.message).toContain('sqlite');
  });

  it('PLG_MISSING_REQUIRE when a required plugin is not installed', () => {
    const error = failure([plugin(P('seo'), { requires: { [P('pages')]: '^1.0.0' } })]);
    expect(error.code).toBe('PLG_MISSING_REQUIRE');
    expect(error.message).toContain(P('pages'));
  });

  it('PLG_REQUIRE_RANGE when a required plugin has the wrong version', () => {
    const error = failure([
      plugin(P('seo'), { requires: { [P('pages')]: '^2.0.0' } }),
      plugin(P('pages'), {}, '1.5.0'),
    ]);
    expect(error.code).toBe('PLG_REQUIRE_RANGE');
    expect(error.message).toContain('1.5.0');
    expect(error.message).toContain('^2.0.0');
  });

  it('PLG_CONFLICT when a conflicting plugin is installed, and not otherwise', () => {
    const conflicting = [plugin(P('a'), { conflicts: [P('b')] }), plugin(P('b'))];
    expect(failure(conflicting).code).toBe('PLG_CONFLICT');
    expect(() => resolvePlugins([plugin(P('a'), { conflicts: [P('b')] })], CTX)).not.toThrow();
  });

  it('PLG_CYCLE names the plugins in the cycle', () => {
    const error = failure([
      plugin(P('a'), { requires: { [P('b')]: '*' } }),
      plugin(P('b'), { requires: { [P('c')]: '*' } }),
      plugin(P('c'), { requires: { [P('a')]: '*' } }),
      plugin(P('free')),
    ]);
    expect(error.code).toBe('PLG_CYCLE');
    for (const name of ['a', 'b', 'c']) expect(error.message).toContain(P(name));
    expect(error.message).not.toContain(P('free'));
  });

  it('PLG_CYCLE for a plugin that requires itself', () => {
    expect(failure([plugin(P('a'), { requires: { [P('a')]: '*' } })]).code).toBe('PLG_CYCLE');
  });

  it('PLG_BAD_RANGE for a range the matcher refuses, in core or in requires', () => {
    expect(failure([plugin(P('a'), { core: '^1.0' })]).code).toBe('PLG_BAD_RANGE');
    expect(failure([plugin(P('a'), { requires: { [P('b')]: '1.x' } }), plugin(P('b'))]).code).toBe('PLG_BAD_RANGE');
  });
});

describe('PLG-resolve prefixes and collisions', () => {
  it('PLG_PREFIX_ENV when an env key does not start with the short name in upper case', () => {
    const error = failure([plugin(P('seo'), { env: ['SITEMAP_CRON'] })]);
    expect(error.code).toBe('PLG_PREFIX_ENV');
    expect(error.message).toContain('SEO_');
  });

  it('PLG_PREFIX_PERMISSION when a permission does not start with the short name and a dot', () => {
    const error = failure([plugin(P('seo'), { permissions: ['manage'] })]);
    expect(error.code).toBe('PLG_PREFIX_PERMISSION');
    expect(error.message).toContain('seo.');
  });

  it('PLG-resolve accepts correctly prefixed keys, with dashes in the name becoming underscores', () => {
    const ok = plugin(P('audit-log'), { env: ['AUDIT_LOG_RETENTION'], permissions: ['audit-log.read'] });
    expect(() => resolvePlugins([ok], CTX)).not.toThrow();
  });

  it.each([
    ['PLG_COLLISION_TABLE', 'tables', 'pages'],
    ['PLG_COLLISION_ROUTE', 'routes', '/api/pages'],
    ['PLG_COLLISION_ADMIN', 'admin', '/pages'],
  ] as const)('%s when two plugins claim the same %s entry', (code, field, value) => {
    const error = failure([plugin(P('a'), { [field]: [value] }), plugin(P('b'), { [field]: [value] })]);
    expect(error.code).toBe(code);
    expect(error.message).toContain(value);
    expect(error.message).toContain(P('a'));
    expect(error.message).toContain(P('b'));
  });

  it('PLG_COLLISION_ENV and PLG_COLLISION_PERMISSION come from two plugins with the same short name in different scopes', () => {
    const first = plugin('@bieberkit/plugin-seo', { env: ['SEO_CRON'], permissions: ['seo.read'] });
    const second = plugin('bieberkit-plugin-seo', { env: ['SEO_CRON'], permissions: ['seo.read'] });
    const codes = failure([first, second]).problems.map((problem) => problem.code);
    expect(codes).toContain('PLG_COLLISION_ENV');
    expect(codes).toContain('PLG_COLLISION_PERMISSION');
  });

  it.each([
    ['@bieberkit/plugin-seo', 'seo'],
    ['bieberkit-plugin-seo', 'seo'],
    ['@acme/plugin-seo', 'seo'],
    ['@acme/seo', 'seo'],
    ['seo', 'seo'],
  ])('PLG-resolve derives the short name of %s as %s', (name, short) => {
    const ok = plugin(name, { env: [`${short.toUpperCase()}_KEY`], permissions: [`${short}.read`] });
    expect(() => resolvePlugins([ok], CTX)).not.toThrow();
  });

  it('PLG-resolve one plugin repeating its own key is not a collision with another plugin', () => {
    expect(() => resolvePlugins([plugin(P('a'), { tables: ['x', 'x'] })], CTX)).not.toThrow();
  });
});

describe('PLG-resolve reporting', () => {
  it('PLG-resolve reports every problem together, and the first gives the error code', () => {
    const error = failure([
      plugin(P('a'), { core: '^2.0.0', permissions: ['oops'] }),
      plugin(P('b'), { dialects: ['mysql'], requires: { [P('missing')]: '^1.0.0' } }),
    ]);
    const codes = error.problems.map((problem) => problem.code);
    expect(codes).toEqual(
      expect.arrayContaining(['PLG_CORE_RANGE', 'PLG_PREFIX_PERMISSION', 'PLG_DIALECT', 'PLG_MISSING_REQUIRE']),
    );
    expect(error.code).toBe(codes[0]);
    expect(error.problems.every((problem) => problem.message.length > 0)).toBe(true);
  });

  it('PLG-resolve the error is a BkError with a fix and no private detail in toJSON', () => {
    const error = failure([plugin(P('a'), { core: '^2.0.0' })]);
    expect(error.status).toBe(500);
    expect(error.fix).not.toBe('');
    expect(Object.keys(error.toJSON()).toSorted()).toEqual(['code', 'fix', 'message', 'status']);
  });

  it('PLG-resolve gives the same problems in the same order for any input order', () => {
    const plugins = [
      plugin(P('a'), { core: '^2.0.0' }),
      plugin(P('b'), { core: '^3.0.0' }),
      plugin(P('c'), { dialects: ['mysql'] }),
    ];
    const forward = failure(plugins).problems;
    const backward = failure(plugins.toReversed()).problems;
    expect(backward).toEqual(forward);
  });
});
