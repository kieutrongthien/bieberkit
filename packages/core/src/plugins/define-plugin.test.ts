/**
 * BieberKit
 *
 * @file        packages/core/src/plugins/define-plugin.test.ts
 * @description Tests for definePlugin, the static manifest and its CI check (spec 11.1, PLG-07, ADR 0011).
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
import { env } from '../config/env.ts';
import { createContainer } from '../container/container.ts';
import { PluginError } from './errors.ts';
import { checkManifest, toManifest } from './manifest.ts';
import type { KeyCollector } from './manifest.ts';
import { definePlugin, parsePluginOptions } from './define-plugin.ts';
import { registerModule } from '../module/define-module.ts';

const base = {
  name: '@bieberkit/plugin-seo',
  version: '1.2.0',
  core: '^1.0.0',
  dialects: ['sqlite', 'postgres', 'mysql'],
} as const;

function codeOf(run: () => unknown): string | undefined {
  try {
    run();
  } catch (error) {
    return error instanceof PluginError ? error.code : 'NOT_A_PLUGIN_ERROR';
  }
  return undefined;
}

describe('MOD-01 definePlugin', () => {
  it('MOD-01 derives the short name and wraps the plugin as a module with that name', () => {
    const def = definePlugin({ ...base });
    expect(def.kind).toBe('plugin');
    expect(def.name).toBe('@bieberkit/plugin-seo');
    expect(def.shortName).toBe('seo');
    expect(def.module.name).toBe('seo');
    expect(def.version).toBe('1.2.0');
    expect(Object.isFrozen(def)).toBe(true);
  });

  it('MOD-02 the services of a plugin register through its module', async () => {
    const def = definePlugin({ ...base, services: {} });
    const container = createContainer();
    registerModule(container, def.module);
    await expect(container.boot()).resolves.toBeUndefined();
  });

  it('CFG-01 builds an env schema from the keys of the plugin', () => {
    const def = definePlugin({ ...base, env: { SEO_SITEMAP_CRON: env.string().default('0 3 * * *') } });
    expect(Object.keys(def.envSchema.keys)).toEqual(['SEO_SITEMAP_CRON']);
  });

  it('CFG-01 a plugin without env has an empty schema', () => {
    expect(Object.keys(definePlugin({ ...base }).envSchema.keys)).toEqual([]);
  });
});

describe('PLG-07 definePlugin refuses what the resolver would refuse, so authors see it at build', () => {
  it.each([
    ['PLG_BAD_RANGE', { core: '^1.0' }],
    ['PLG_BAD_RANGE', { requires: { '@bieberkit/plugin-pages': '1.x' } }],
    ['PLG_BAD_VERSION', { version: '1.0' }],
    ['PLG_PREFIX_ENV', { env: { SITEMAP_CRON: env.string().optional() } }],
    ['PLG_PREFIX_PERMISSION', { permissions: ['manage'] }],
    ['PLG_DIALECT', { dialects: [] }],
    ['PLG_DIALECT', { dialects: ['oracle'] }],
    ['PLG_NAME', { name: 'Not A Package' }],
    ['PLG_NAME', { name: '' }],
  ] as const)('%s for %j', (code, patch) => {
    // @ts-expect-error some patches are deliberately outside the declared types
    expect(codeOf(() => definePlugin({ ...base, ...patch }))).toBe(code);
  });

  it('PLG-07 a plugin cannot conflict with itself or require itself', () => {
    expect(codeOf(() => definePlugin({ ...base, requires: { [base.name]: '*' } }))).toBe('PLG_CYCLE');
    expect(codeOf(() => definePlugin({ ...base, conflicts: [base.name] }))).toBe('PLG_CONFLICT');
  });

  it('PLG-07 accepts a plugin that follows every rule', () => {
    expect(() =>
      definePlugin({
        ...base,
        requires: { '@bieberkit/plugin-pages': '^1.0.0' },
        conflicts: ['@bieberkit/plugin-legacy-seo'],
        env: { SEO_SITEMAP_CRON: env.string().default('0 3 * * *') },
        permissions: ['seo.read', 'seo.manage'],
      }),
    ).not.toThrow();
  });
});

describe('PLG-07 plugin options', () => {
  const options = {
    parse(input: unknown): { sitemap: boolean } {
      if (typeof input === 'object' && input !== null && 'sitemap' in input && typeof input.sitemap === 'boolean')
        return { sitemap: input.sitemap };
      throw new Error('sitemap must be a boolean');
    },
  };

  it('PLG-07 parsePluginOptions runs the parser of the plugin and returns its value', () => {
    const def = definePlugin({ ...base, options });
    expect(parsePluginOptions(def, { sitemap: true })).toEqual({ sitemap: true });
  });

  it('CFG-09 a parser failure is reported with the path of the plugin entry, in the config error format', () => {
    const def = definePlugin({ ...base, options });
    expect(() => parsePluginOptions(def, { sitemap: 'yes' }, 'plugins[3]')).toThrowError(
      expect.objectContaining({
        code: 'CFG_CONFIG_INVALID',
        problems: [
          expect.objectContaining({ key: 'plugins[3]', message: expect.stringContaining('sitemap must be a boolean') }),
        ],
      }),
    );
  });

  it('CFG-09 a plugin without options that is given options is an error, not ignored', () => {
    const def = definePlugin({ ...base });
    expect(() => parsePluginOptions(def, { sitemap: true })).toThrowError(
      expect.objectContaining({ code: 'CFG_CONFIG_INVALID' }),
    );
  });

  it('CFG-09 no options given to a plugin without options is fine and gives undefined', () => {
    expect(parsePluginOptions(definePlugin({ ...base }), undefined)).toBeUndefined();
  });

  it('CFG-09 a parser that is Zod-like reports one problem per issue', () => {
    const zodLike = {
      parse(): never {
        throw Object.assign(new Error('invalid'), {
          issues: [
            { path: ['sitemap'], message: 'Expected boolean' },
            { path: ['depth', 0], message: 'Expected number' },
          ],
        });
      },
    };
    const def = definePlugin({ ...base, options: zodLike });
    expect(() => parsePluginOptions(def, {}, 'plugins[0]')).toThrowError(
      expect.objectContaining({
        problems: [
          expect.objectContaining({ key: 'plugins[0].sitemap', message: expect.stringContaining('Expected boolean') }),
          expect.objectContaining({ key: 'plugins[0].depth[0]', message: expect.stringContaining('Expected number') }),
        ],
      }),
    );
  });
});

describe('PLG-07 toManifest', () => {
  const def = definePlugin({
    ...base,
    requires: { '@bieberkit/plugin-users': '^1.0.0', '@bieberkit/plugin-pages': '^1.0.0' },
    conflicts: ['@bieberkit/plugin-z', '@bieberkit/plugin-a'],
    env: { SEO_Z: env.string().optional(), SEO_A: env.string().optional() },
    permissions: ['seo.read', 'seo.manage'],
  });

  it('PLG-07 writes core, dialects, requires, conflicts, env and permissions, each sorted', () => {
    expect(toManifest(def)).toEqual({
      core: '^1.0.0',
      dialects: ['mysql', 'postgres', 'sqlite'],
      requires: { '@bieberkit/plugin-pages': '^1.0.0', '@bieberkit/plugin-users': '^1.0.0' },
      conflicts: ['@bieberkit/plugin-a', '@bieberkit/plugin-z'],
      env: ['SEO_A', 'SEO_Z'],
      tables: [],
      routes: [],
      permissions: ['seo.manage', 'seo.read'],
      admin: [],
    });
  });

  it('PLG-07 takes tables, routes and admin paths from the collectors of the packages that own those contributions', () => {
    const withContributions = definePlugin({ ...base });
    const collectors: readonly KeyCollector[] = [
      { field: 'tables', collect: () => ['seo_meta', 'seo_a'] },
      { field: 'routes', collect: () => ['/api/seo'] },
      { field: 'admin', collect: () => ['/seo'] },
    ];
    const manifest = toManifest(withContributions, collectors);
    expect(manifest.tables).toEqual(['seo_a', 'seo_meta']);
    expect(manifest.routes).toEqual(['/api/seo']);
    expect(manifest.admin).toEqual(['/seo']);
  });

  it('PLG-07 two collectors for one field are joined, without duplicates', () => {
    const collectors: readonly KeyCollector[] = [
      { field: 'tables', collect: () => ['a', 'b'] },
      { field: 'tables', collect: () => ['b', 'c'] },
    ];
    expect(toManifest(definePlugin({ ...base }), collectors).tables).toEqual(['a', 'b', 'c']);
  });
});

describe('PLG-07 checkManifest', () => {
  const def = definePlugin({ ...base, env: { SEO_A: env.string().optional() }, permissions: ['seo.read'] });
  const pkg = { name: base.name, version: base.version, bieberkit: toManifest(def) };

  it('PLG-07 passes when the field equals what definePlugin produces', () => {
    expect(checkManifest(pkg, def)).toEqual({ ok: true });
  });

  it('PLG-07 passes when the same content has its keys in another order', () => {
    const reordered = {
      name: pkg.name,
      version: pkg.version,
      bieberkit: Object.fromEntries(Object.entries(pkg.bieberkit).toReversed()),
    };
    expect(checkManifest(reordered, def)).toEqual({ ok: true });
  });

  it('PLG_MANIFEST_MISSING when the package has no bieberkit field', () => {
    expect(checkManifest({ name: base.name, version: base.version }, def)).toMatchObject({
      ok: false,
      code: 'PLG_MANIFEST_MISSING',
    });
  });

  it('PLG_MANIFEST_VERSION when the versions differ', () => {
    expect(checkManifest({ ...pkg, version: '1.3.0' }, def)).toMatchObject({ ok: false, code: 'PLG_MANIFEST_VERSION' });
  });

  it('PLG_MANIFEST_NAME when the names differ', () => {
    expect(checkManifest({ ...pkg, name: '@bieberkit/plugin-other' }, def)).toMatchObject({
      ok: false,
      code: 'PLG_MANIFEST_NAME',
    });
  });

  it('PLG_MANIFEST_STALE when the field no longer matches the definition, for example a new permission', () => {
    const stale = { ...pkg, bieberkit: { ...pkg.bieberkit, permissions: [] } };
    const result = checkManifest(stale, def);
    expect(result).toMatchObject({ ok: false, code: 'PLG_MANIFEST_STALE' });
    expect(result.ok ? '' : result.message).toContain('bieberkit');
  });

  it('PLG_MANIFEST_STALE also covers a collector result that changed', () => {
    const collectors: readonly KeyCollector[] = [{ field: 'tables', collect: () => ['seo_meta'] }];
    expect(checkManifest(pkg, def, collectors)).toMatchObject({ ok: false, code: 'PLG_MANIFEST_STALE' });
    expect(checkManifest({ ...pkg, bieberkit: toManifest(def, collectors) }, def, collectors)).toEqual({ ok: true });
  });
});
