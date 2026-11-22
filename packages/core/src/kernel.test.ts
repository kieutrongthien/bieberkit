/**
 * BieberKit
 *
 * @file        packages/core/src/kernel.test.ts
 * @description The done-when test of roadmap M1.1: a test app boots a module and a plugin graph, fails on a missing env key with a stable code, and stops in reverse order.
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
import {
  createContainer,
  createEventBus,
  createLifecycle,
  defineConfig,
  defineModule,
  definePlugin,
  env,
  EnvValidationError,
  exitCode,
  loadEnv,
  PluginError,
  registerModule,
  resolvePlugins,
  toManifest,
  validateConfig,
} from './index.ts';
import type { ModuleDef, PluginDef } from './index.ts';

declare module './index.ts' {
  interface ServiceRegistry {
    pagesStore: { root: string; titles: string[] };
    seoIndex: { entries: string[] };
  }
  interface EventRegistry {
    'pages.page.published': { title: string };
  }
}

const trace: string[] = [];

function pagesPlugin(): PluginDef {
  return definePlugin({
    name: '@bieberkit/plugin-pages',
    version: '1.0.0',
    core: '^1.0.0',
    dialects: ['postgres', 'mysql', 'sqlite'],
    env: { PAGES_ROOT: env.string().describe('Folder of the page files') },
    services: {
      pagesStore: { scope: 'singleton', create: () => ({ root: 'unset', titles: [] }) },
    },
  });
}

function seoPlugin(): PluginDef {
  return definePlugin({
    name: '@bieberkit/plugin-seo',
    version: '1.0.0',
    core: '^1.0.0',
    dialects: ['postgres', 'mysql', 'sqlite'],
    requires: { '@bieberkit/plugin-pages': '^1.0.0' },
    env: { SEO_SITEMAP_CRON: env.string().default('0 3 * * *') },
    services: {
      seoIndex: { scope: 'singleton', deps: ['pagesStore'], create: () => ({ entries: [] }) },
    },
  });
}

const projectModule: ModuleDef = defineModule({ name: 'app' });

const config = defineConfig({
  name: 'test-app',
  author: 'Test <test@example.com>',
  license: 'UNLICENSED',
  database: { dialect: 'sqlite' },
  tenancy: { mode: 'single' },
  locales: { default: 'vi', supported: ['vi', 'en'] },
  plugins: ['@bieberkit/plugin-seo', '@bieberkit/plugin-pages'],
});

/** What a kernel will do in a later milestone, written out with the pieces of core. */
async function startApp(source: Readonly<Record<string, string | undefined>>, plugins: readonly PluginDef[]) {
  const settings = validateConfig(config);
  const { order } = resolvePlugins(
    plugins.map((plugin) => ({ name: plugin.name, version: plugin.version, manifest: toManifest(plugin) })),
    { core: '1.0.0', dialect: settings.database.dialect },
  );
  const byName = new Map(plugins.map((plugin) => [plugin.name, plugin]));
  const ordered = order.flatMap((name) => byName.get(name) ?? []);

  const loaded = loadEnv({
    source,
    envFile: false,
    extra: ordered.map((plugin) => ({
      name: plugin.shortName,
      prefix: `${plugin.shortName.toUpperCase()}_`,
      schema: plugin.envSchema,
    })),
  });

  const container = createContainer();
  const lifecycle = createLifecycle();
  const events = createEventBus();
  for (const def of [projectModule, ...ordered.map((plugin) => plugin.module)]) {
    registerModule(container, def);
    lifecycle.onBoot(def.name, () => void trace.push(`boot ${def.name}`));
    lifecycle.onShutdown(def.name, () => void trace.push(`stop ${def.name}`));
  }
  await container.boot();
  await lifecycle.boot();
  return { container, lifecycle, events, loaded, order };
}

describe('M1.1 done when: a test app boots a module and a plugin graph', () => {
  it('boots the plugins in dependency order and stops them in reverse order', async () => {
    trace.length = 0;
    const app = await startApp({ PAGES_ROOT: '/srv/pages' }, [seoPlugin(), pagesPlugin()]);
    expect(app.order).toEqual(['@bieberkit/plugin-pages', '@bieberkit/plugin-seo']);
    expect(app.lifecycle.phase).toBe('ready');
    expect(trace).toEqual(['boot app', 'boot pages', 'boot seo']);

    const result = await app.lifecycle.stop();
    expect(trace).toEqual(['boot app', 'boot pages', 'boot seo', 'stop seo', 'stop pages', 'stop app']);
    expect(exitCode(result)).toBe(0);
    expect(app.lifecycle.phase).toBe('stopped');
  });

  it('gives each plugin its services, with the env of the plugins merged into one validated read', async () => {
    const app = await startApp({ PAGES_ROOT: '/srv/pages', SEO_SITEMAP_CRON: '0 4 * * *' }, [
      pagesPlugin(),
      seoPlugin(),
    ]);
    expect(app.container.services.seoIndex.entries).toEqual([]);
    expect(app.loaded.extra).toEqual({ PAGES_ROOT: '/srv/pages', SEO_SITEMAP_CRON: '0 4 * * *' });
    await app.lifecycle.stop();
  });

  it('lets one plugin react to the event of another, through the bus', async () => {
    const app = await startApp({ PAGES_ROOT: '/srv/pages' }, [pagesPlugin(), seoPlugin()]);
    app.events.on(
      'pages.page.published',
      (payload) => void app.container.services.seoIndex.entries.push(payload.title),
    );
    const result = await app.events.forModule('pages').emit('pages.page.published', { title: 'Home' });
    expect(result.failures).toEqual([]);
    expect(app.container.services.seoIndex.entries).toEqual(['Home']);
    await app.lifecycle.stop();
  });
});

describe('M1.1 done when: fails on a missing env key with a stable code', () => {
  it('stops before anything boots, with CFG_ENV_MISSING naming the key and the plugin fix', async () => {
    trace.length = 0;
    const started = startApp({}, [pagesPlugin(), seoPlugin()]);
    await expect(started).rejects.toBeInstanceOf(EnvValidationError);
    await expect(started).rejects.toMatchObject({
      code: 'CFG_ENV_MISSING',
      problems: [expect.objectContaining({ key: 'PAGES_ROOT' })],
    });
    expect(trace).toEqual([]);
  });

  it('reports a bad core env value together with the missing plugin key', async () => {
    const started = startApp({ APP_PORT: 'abc' }, [pagesPlugin()]);
    await expect(started).rejects.toMatchObject({
      problems: [
        expect.objectContaining({ key: 'APP_PORT', code: 'CFG_ENV_INVALID' }),
        expect.objectContaining({ key: 'PAGES_ROOT', code: 'CFG_ENV_MISSING' }),
      ],
    });
  });
});

describe('M1.1 done when: a plugin graph that cannot resolve never boots', () => {
  it('PLG_MISSING_REQUIRE when seo is installed without pages', async () => {
    trace.length = 0;
    const started = startApp({ PAGES_ROOT: '/srv/pages' }, [seoPlugin()]);
    await expect(started).rejects.toBeInstanceOf(PluginError);
    await expect(started).rejects.toMatchObject({ code: 'PLG_MISSING_REQUIRE' });
    expect(trace).toEqual([]);
  });
});
