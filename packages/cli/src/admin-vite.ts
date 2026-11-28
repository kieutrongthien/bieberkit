/**
 * BieberKit
 *
 * @file        packages/cli/src/admin-vite.ts
 * @description The Vite plugin that builds the admin of a project, `bieberkit/admin-vite`: the list of the admin parts of the plugins of the config as the module `virtual:bieberkit/admin`, the check of what they declare, one copy of each shared package, and in dev the page and the way to the API (UI-34, UI-36, UI-37, UI-14).
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

import { existsSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { composeAdmin, messageProblems } from '@bieberkit/admin-core';
import type { AdminPart, AdminProblem } from '@bieberkit/admin-core';
import { loadEnv } from '@bieberkit/core';
import { adminPageOf, findProjectRoot, loadConfig, loadProject } from '@bieberkit/server';
import type { Plugin } from 'vite';
import { ADMIN_APP } from './admin-app.ts';

const VIRTUAL = 'virtual:bieberkit/admin';
const RESOLVED = `\0${VIRTUAL}`;

/** The packages that the admin of a project holds once: a second copy of one breaks hooks, contexts or the theme. */
export const SINGLE_COPY: readonly string[] = [
  'react',
  'react-dom',
  'antd',
  '@bieberkit/admin-antd',
  '@bieberkit/admin-core',
  '@tanstack/react-query',
  '@tanstack/react-router',
];

export interface AdminPartRef {
  /** The npm name of the plugin, or `app` for the part of the project itself. */
  readonly name: string;
  /** What imports it: `<plugin>/admin`, or the file of the project. */
  readonly specifier: string;
}

const exportsAdmin = (packageRoot: string): boolean => {
  const manifest: unknown = JSON.parse(readFileSync(join(packageRoot, 'package.json'), 'utf8'));
  const exported: unknown = Reflect.get(Object(manifest), 'exports');
  return typeof exported === 'object' && exported !== null && './admin' in exported;
};

/** The admin parts of a project: of its plugins, in boot order, then of the project itself. */
export async function adminPartsOf(
  root: string,
): Promise<{ readonly parts: readonly AdminPartRef[]; readonly problems: readonly AdminProblem[] }> {
  const project = await loadProject(root);
  const parts: AdminPartRef[] = [];
  const problems: AdminProblem[] = [];
  for (const { def, root: packageRoot } of project.plugins) {
    if (!exportsAdmin(packageRoot)) continue;
    // pnpm gives a plugin the React of the package that depends on it, so the admin must depend on every plugin that has screens.
    if (!existsSync(join(project.root, ADMIN_APP, 'node_modules', def.name))) {
      problems.push({
        plugin: def.name,
        code: 'not-in-admin',
        message: `It has an admin part, and ${ADMIN_APP} does not depend on it. Run: pnpm --filter ./${ADMIN_APP} add ${def.name}`,
      });
      continue;
    }
    parts.push({ name: def.name, specifier: `${def.name}/admin` });
  }
  for (const file of ['part.ts', 'part.tsx', 'part.js']) {
    const own = join(project.root, ADMIN_APP, 'src', file);
    if (existsSync(own)) {
      parts.push({ name: 'app', specifier: own });
      break;
    }
  }
  return { parts, problems };
}

/** The module that the entry of `apps/admin` imports: the parts, in order. */
export function virtualModuleOf(parts: readonly AdminPartRef[]): string {
  const imports = parts.map((item, index) => `import part${String(index)} from ${JSON.stringify(item.specifier)};`);
  const list = parts.map((_item, index) => `part${String(index)}`).join(', ');
  return `${imports.join('\n')}\nexport const parts = [${list}];\n`;
}

/** The shared packages that a build takes from more than one folder. */
export function duplicatedPackages(moduleIds: Iterable<string>): string[] {
  const folders = new Map<string, Set<string>>();
  for (const id of moduleIds)
    for (const name of SINGLE_COPY) {
      const at = id.lastIndexOf(`/node_modules/${name}/`);
      if (at === -1) continue;
      const known = folders.get(name) ?? new Set<string>();
      known.add(id.slice(0, at));
      folders.set(name, known);
    }
  return SINGLE_COPY.filter((name) => (folders.get(name)?.size ?? 0) > 1);
}

/** The page of the admin in dev, written as the web role writes it, from the config of the project (UI-06, UI-33). */
export async function adminDevPage(root: string): Promise<(html: string) => string> {
  const { config } = await loadConfig(root);
  return adminPageOf(config, '');
}

const failure = (code: string, lines: readonly string[]): string =>
  `${code}: the admin cannot be built.\n${lines.map((line) => `  - ${line}`).join('\n')}`;

const line = (problem: AdminProblem): string =>
  problem.plugin === '' ? problem.message : `${problem.plugin}: ${problem.message}`;

/** What runs the modules of the admin parts in Node.js. It stays open, for a part reads its texts with an `import()` of its own. */
interface Runner {
  readonly import: (id: string) => Promise<unknown>;
  readonly close: () => Promise<void>;
}

/** A function of the Vite of the project, whose types the project has. */
function callOf(from: unknown, name: string, where: string): (...args: readonly unknown[]) => unknown {
  const found: unknown = Reflect.get(Object(from), name);
  if (typeof found !== 'function') throw new Error(`${where} has no ${name}. The admin needs Vite 8.`);
  return (...args) => Reflect.apply(found, from, args);
}

/**
 * A runner of the Vite of the project, which is the one that builds, set up as its `runnerImport` sets one up. That function closes
 * what it opens before an answer can be used, so it is not the one that is called.
 */
async function openRunner(vitePath: string, root: string): Promise<Runner> {
  const vite: unknown = await import(/* @vite-ignore */ pathToFileURL(vitePath).href);
  const config = await callOf(
    vite,
    'resolveConfig',
    vitePath,
  )(
    {
      root,
      configFile: false,
      envDir: false,
      logLevel: 'silent',
      environments: {
        inline: {
          consumer: 'server',
          dev: { moduleRunnerTransform: true },
          resolve: { external: true, mainFields: [], conditions: ['node', 'module-sync'] },
        },
      },
    },
    'serve',
  );
  const environment = callOf(vite, 'createRunnableDevEnvironment', vitePath)('inline', config, {
    runnerOptions: { hmr: { logger: false } },
    hot: false,
  });
  await callOf(environment, 'init', vitePath)();
  const runner: unknown = Reflect.get(Object(environment), 'runner');
  const load = callOf(runner, 'import', vitePath);
  const close = callOf(environment, 'close', vitePath);
  return {
    import: async (id) => await load(id),
    close: async () => void (await close()),
  };
}

export interface AdminViteOptions {
  /**
   * Stop when no plugin gives the sign in (UI-26).
   * @default false until the account screens are in the users plugin
   */
  readonly requireSignIn?: boolean;
}

export function bieberkitAdmin(options: AdminViteOptions = {}): Plugin {
  let adminDir = process.cwd();
  let root = adminDir;
  let serving = false;
  let found: readonly AdminPartRef[] = [];

  return {
    name: 'bieberkit-admin',
    config(user, environment) {
      adminDir = resolve(user.root ?? process.cwd());
      root = findProjectRoot(adminDir) ?? adminDir;
      serving = environment.command === 'serve';
      const port = serving ? loadEnv({ envFile: join(root, '.env') }).env.APP_PORT : undefined;
      return {
        // Relative, so that the web role decides where the application is: it writes the address of each file (UI-14).
        base: serving ? '/' : './',
        resolve: { dedupe: [...SINGLE_COPY] },
        build: {
          // A page with a policy of `script-src 'self'` runs no inline script, so the build inlines none (SEC-01).
          modulePreload: { polyfill: false },
          assetsInlineLimit: 0,
        },
        ...(port === undefined ? {} : { server: { proxy: { '/api': `http://127.0.0.1:${String(port)}` } } }),
      };
    },
    async buildStart() {
      const listed = await adminPartsOf(root);
      found = listed.parts;
      const problems: AdminProblem[] = [...listed.problems];
      const vitePath = createRequire(join(adminDir, 'package.json')).resolve('vite');
      const runner = await openRunner(vitePath, adminDir);
      const parts: AdminPart<unknown>[] = [];
      try {
        for (const item of found) {
          const resolved = await this.resolve(item.specifier, join(adminDir, 'index.html'));
          let value: unknown;
          try {
            if (resolved === null) throw new Error(`${item.specifier} cannot be found.`);
            value = Reflect.get(Object(await runner.import(resolved.id)), 'default');
            if (typeof value !== 'object' || value === null)
              throw new Error('It has no default export. Write: export default defineAdminPlugin({ ... }).');
          } catch (error) {
            this.error(
              failure('BK_ADMIN_PART_INVALID', [
                `${item.name}: its admin part cannot be read. ${error instanceof Error ? error.message : String(error)}`,
              ]),
            );
          }
          // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- the shape is what composeAdmin and messageProblems check
          const part = value as AdminPart<unknown>;
          if (part.name !== item.name)
            problems.push({
              plugin: item.name,
              code: 'wrong-name',
              message: `Its admin part says that it is "${part.name}". The name is the one of the package.`,
            });
          parts.push(part);
        }
        const { config } = await loadConfig(root);
        problems.push(
          ...composeAdmin(parts).problems.filter(
            (problem) => options.requireSignIn === true || problem.code !== 'no-sign-in',
          ),
          ...(await messageProblems(parts, config.locales.supported)),
        );
      } finally {
        await runner.close();
      }
      if (problems.length > 0) this.error(failure('BK_ADMIN_PART_INVALID', problems.map(line)));
    },
    resolveId(source, importer) {
      if (source === VIRTUAL) return RESOLVED;
      // The virtual module is in no folder, so what it imports is resolved as the entry of the admin would resolve it.
      if (importer === RESOLVED) return this.resolve(source, join(adminDir, 'index.html'), { skipSelf: true });
      return null;
    },
    load(id) {
      return id === RESOLVED ? virtualModuleOf(found) : null;
    },
    generateBundle(_options, bundle) {
      const ids = Object.values(bundle).flatMap((chunk) => (chunk.type === 'chunk' ? chunk.moduleIds : []));
      const twice = duplicatedPackages(ids);
      if (twice.length > 0)
        this.error(
          failure('BK_ADMIN_TWO_COPIES', [
            `The build holds two copies of ${twice.join(', ')}. Make every package that asks for one of them accept the version of ${ADMIN_APP}.`,
          ]),
        );
    },
    async transformIndexHtml(html) {
      return serving ? (await adminDevPage(root))(html) : html;
    },
  };
}
