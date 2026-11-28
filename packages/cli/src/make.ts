/**
 * BieberKit
 *
 * @file        packages/cli/src/make.ts
 * @description The recipes of make:module, make:entity and make:job: the files that a new module, entity or job starts from, and the edit of the module that registers them (section 5.2, section 7.4).
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

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import type { ProjectConfigInput } from '@bieberkit/core';
import { MODULES_DIR } from './app.ts';
import { CliError, usageError } from './errors.ts';

export interface MadeFile {
  /** Relative to the project root. */
  readonly path: string;
  readonly content: string;
}

const MODULE_NAME = /^[a-z][a-z0-9-]*$/;
const ENTITY_NAME = /^[A-Z][A-Za-z0-9]*$/;
const JOB_NAME = /^[a-z][a-z0-9-]*$/;

/** The header of a file that a person will write in (section 23.7): the project, the author, the license, and the year it was made. */
export function projectHeader(
  config: Pick<ProjectConfigInput, 'name' | 'author' | 'license'>,
  file: string,
  description: string,
  year: number,
): string {
  const name = config.author.replace(/\s*<[^>]*>\s*$/, '');
  return [
    '/**',
    ` * ${config.name}`,
    ' *',
    ` * @file        ${file}`,
    ` * @description ${description}`,
    ` * @author      ${config.author}`,
    ` * @copyright   Copyright (c) ${year} ${name}`,
    ` * @license     ${config.license}`,
    ' */',
    '',
    '',
  ].join('\n');
}

const kebab = (pascal: string): string => pascal.replaceAll(/([a-z0-9])([A-Z])/g, '$1-$2').toLowerCase();
const snake = (pascal: string): string => kebab(pascal).replaceAll('-', '_');

function plural(word: string): string {
  if (/[^aeiou]y$/.test(word)) return `${word.slice(0, -1)}ies`;
  return /(?:s|x|z|ch|sh)$/.test(word) ? `${word}es` : `${word}s`;
}

const IMPORTS = '// bieberkit:imports';
const ENTITIES = '// bieberkit:entities';
const JOBS = '// bieberkit:jobs';

export function moduleFile(config: ProjectConfigInput, name: string, year: number): MadeFile {
  const path = `${MODULES_DIR}/${name}/module.ts`;
  return {
    path,
    content: `${projectHeader(config, path, `The ${name} module: what it publishes to the rest of the application.`, year)}import { defineModule } from '@bieberkit/core';
import type { ModuleDef } from '@bieberkit/core';
${IMPORTS}

// Entities go in entities/, business logic in services/, custom routes in routes/, jobs in jobs/ and subscriptions in events/.
const definition: ModuleDef = defineModule({
  name: '${name}',
  entities: [
    ${ENTITIES}
  ],
  jobs: [
    ${JOBS}
  ],
});

export default definition;
`,
  };
}

export function entityFile(
  config: ProjectConfigInput,
  module: string,
  name: string,
  tenant: boolean,
  year: number,
): MadeFile {
  const path = `${MODULES_DIR}/${module}/entities/${kebab(name)}.ts`;
  return {
    path,
    content: `${projectHeader(config, path, `The ${name} entity of the ${module} module.`, year)}import { defineEntity, f } from '@bieberkit/data';
import type { EntityDef } from '@bieberkit/data';

export const ${name}: EntityDef<'${module}.${name}'> = defineEntity({
  name: '${module}.${name}',
  table: '${module}_${plural(snake(name))}',${tenant ? '\n  tenant: true,' : ''}
  fields: {
    id: f.id(),
    name: f.string({ min: 1, max: 200 }).index(),
  },
  api: { list: true, get: true, create: true, update: true, delete: true },
});
`,
  };
}

export function jobFile(config: ProjectConfigInput, module: string, name: string, year: number): MadeFile {
  const path = `${MODULES_DIR}/${module}/jobs/${name}.ts`;
  const constant = name.replaceAll(/-(\w)/g, (_match, letter: string) => letter.toUpperCase());
  return {
    path,
    content: `${projectHeader(config, path, `The ${module}.${name} job: its input and what it does.`, year)}import * as z from 'zod/mini';
import { defineJob } from '@bieberkit/queue';
import type { JobDef } from '@bieberkit/queue';

const input = z.object({ id: z.string() });

/** Delivery is at least once, so the handler must give the same result when it runs twice (Q-01). */
export const ${constant}: JobDef<{ id: string }> = defineJob({
  name: '${module}.${name}',
  input,
  handler: async (data: { id: string }, context) => {
    context.log.info('${module}.${name} ran', { id: data.id });
  },
});
`,
  };
}

const COMMUNITY_PLUGIN = /^(?:@[a-z0-9][a-z0-9._-]*\/)?bieberkit-plugin-([a-z][a-z0-9-]*)$/;
const FIRST_PARTY_PLUGIN = /^@bieberkit\/plugin-([a-z][a-z0-9-]*)$/;

const fail = (message: string, fix: string): never => {
  throw usageError('BK_MAKE_NAME_INVALID', message, fix);
};

export function checkNames(kind: 'module' | 'entity' | 'job', value: string): { module: string; name: string } {
  const [module = '', name = '', ...extra] = value.split('.');
  if (kind === 'module') {
    if (!MODULE_NAME.test(value))
      fail(
        `"${value}" is not a module name.`,
        'Use lower case letters, digits and dashes, starting with a letter: crm, purchase-orders.',
      );
    return { module: value, name: value };
  }
  if (extra.length > 0 || !MODULE_NAME.test(module) || name === '')
    fail(
      `"${value}" is not <module>.<name>.`,
      kind === 'entity' ? 'Write it as crm.Deal.' : 'Write it as crm.send-welcome.',
    );
  if (kind === 'entity' && !ENTITY_NAME.test(name))
    fail(`"${name}" is not the name of an entity.`, 'Start with a capital letter: Deal, SalesOrder.');
  if (kind === 'job' && !JOB_NAME.test(name))
    fail(`"${name}" is not the name of a job.`, 'Use lower case letters, digits and dashes: send-welcome.');
  return { module, name };
}

/**
 * The short name of a plugin from its package name (PLG-05): `bieberkit-plugin-notes` and `@acme/bieberkit-plugin-notes` give `notes`.
 * `@bieberkit/plugin-notes` is for the plugins of this project's own framework, and only `--first-party` makes one.
 */
export function checkPluginName(name: string, firstParty: boolean): string {
  const community = COMMUNITY_PLUGIN.exec(name)?.[1];
  if (community !== undefined) return community;
  const first = FIRST_PARTY_PLUGIN.exec(name)?.[1];
  if (first !== undefined && firstParty) return first;
  return fail(
    `"${name}" is not the name of a plugin.`,
    first === undefined
      ? 'Name it bieberkit-plugin-<name>, or @scope/bieberkit-plugin-<name>: lower case letters, digits and dashes (PLG-05).'
      : 'A name under @bieberkit is for the first-party plugins: add --first-party if this is one.',
  );
}

export interface NewPlugin {
  /** The package name. */
  readonly name: string;
  readonly short: string;
  /** The folder of the package, relative to the root of what is written. */
  readonly dir: string;
  readonly author: string;
  readonly license: string;
  readonly year: number;
  /** Whether the plugin gets screens: a project without an admin gets none. */
  readonly admin: boolean;
  /** The exact version of every package that it asks for. */
  readonly versions: Readonly<Record<string, string>>;
}

/** What a plugin needs beside the backend, and what its screens need on top. Each is a development dependency at one version. */
const BACKEND = ['@bieberkit/core', '@bieberkit/data'];
const SCREENS = ['@bieberkit/admin-antd', '@bieberkit/admin-core', '@tanstack/react-query', 'antd', 'react'];
const BUILDERS = ['bieberkit', 'tsdown', 'typescript', 'vitest'];

const sorted = <T>(entries: readonly (readonly [string, T])[]): Record<string, T> =>
  Object.fromEntries(entries.toSorted(([a], [b]) => a.localeCompare(b)));

const entryOf = (source: string): Record<string, string> => ({
  types: `./dist/${source}.d.ts`,
  default: `./dist/${source}.js`,
});

function manifestOf(plugin: NewPlugin): string {
  const { admin } = plugin;
  const versionOf = (name: string): string => {
    const version = plugin.versions[name];
    if (version === undefined) throw new Error(`No version of ${name} is known.`);
    return version;
  };
  const peers = admin ? [...BACKEND, ...SCREENS] : BACKEND;
  // React and Ant Design need these beside them: the DOM, and its types.
  const developed = [...peers, ...BUILDERS, ...(admin ? ['@types/react', 'react-dom'] : [])];
  return `${JSON.stringify(
    {
      name: plugin.name,
      version: '0.1.0',
      description: `The ${plugin.short} plugin for BieberKit.`,
      keywords: ['bieberkit', 'bieberkit-plugin'],
      license: plugin.license,
      author: plugin.author,
      type: 'module',
      sideEffects: false,
      files: ['dist'],
      // In the project the source is what runs and what the admin is built from. The published package has its build.
      exports: {
        '.': './src/index.ts',
        ...(admin ? { './admin': './src/admin/index.ts' } : {}),
        './package.json': './package.json',
      },
      publishConfig: {
        exports: {
          '.': entryOf('index'),
          ...(admin ? { './admin': entryOf('admin/index') } : {}),
          './package.json': './package.json',
        },
        access: 'public',
      },
      scripts: {
        build: `tsdown && ${admin ? 'tsdown -c tsdown.admin.config.ts && ' : ''}bieberkit build`,
        typecheck: `tsc --noEmit -p tsconfig.json${admin ? ' && tsc --noEmit -p src/admin/tsconfig.json' : ''}`,
        test: 'vitest run',
      },
      peerDependencies: sorted(peers.map((name) => [name, `^${versionOf(name)}`])),
      // A server installs the plugin without the packages of its screens.
      ...(admin ? { peerDependenciesMeta: sorted(SCREENS.map((name) => [name, { optional: true }])) } : {}),
      devDependencies: sorted(developed.map((name) => [name, versionOf(name)])),
      bieberkit: pluginManifest(plugin),
    },
    null,
    2,
  )}\n`;
}

const pascal = (kebabCase: string): string =>
  kebabCase.replaceAll(/(?:^|-)(\w)/g, (_m, letter: string) => letter.toUpperCase());

/** The manifest of the plugin that `pluginFiles` writes: the same that `bieberkit build` derives from it, so `build --check` passes at once (PLG-07). */
function pluginManifest(plugin: NewPlugin): Record<string, unknown> {
  return {
    core: '*',
    dialects: ['mysql', 'postgres', 'sqlite'],
    requires: {},
    conflicts: [],
    env: [],
    tables: [`${snake(plugin.short)}_items`],
    routes: [],
    permissions: [`${plugin.short}.manage`, `${plugin.short}.read`],
    admin: [],
  };
}

/** A plugin package that builds, resolves and passes `bieberkit check` as it is: one entity, its permissions and a test. */
export function pluginFiles(plugin: NewPlugin): MadeFile[] {
  const { name, short, dir, year } = plugin;
  const header = (file: string, description: string): string =>
    projectHeader({ author: plugin.author, license: plugin.license, name }, `${dir}/${file}`, description, year);
  const table = `${snake(short)}_items`;
  const entity = `${short}.Item`;
  return [
    { path: `${dir}/package.json`, content: manifestOf(plugin) },
    {
      path: `${dir}/tsconfig.json`,
      content: `${JSON.stringify(
        {
          compilerOptions: {
            target: 'ES2023',
            module: 'NodeNext',
            moduleResolution: 'NodeNext',
            strict: true,
            noEmit: true,
            allowImportingTsExtensions: true,
            verbatimModuleSyntax: true,
            resolveJsonModule: true,
            skipLibCheck: true,
          },
          include: ['src'],
          // The screens need the DOM and JSX, which the server must not see: they have a tsconfig of their own.
          ...(plugin.admin ? { exclude: ['src/admin'] } : {}),
        },
        null,
        2,
      )}\n`,
    },
    {
      path: `${dir}/tsdown.config.ts`,
      content: `${header('tsdown.config.ts', `The build of ${name}.`)}import { defineConfig } from 'tsdown';

export default defineConfig({
  entry: ['src/index.ts'],
  format: 'esm',
  platform: 'node',
  dts: true,
  fixedExtension: false,
  clean: true,
});
`,
    },
    {
      path: `${dir}/src/entities/item.ts`,
      content: `${header('src/entities/item.ts', `The ${pascal(short)} item of the ${short} plugin, with the routes that its settings generate.`)}import { defineEntity, f } from '@bieberkit/data';
import type { EntityDef } from '@bieberkit/data';

export const Item: EntityDef<'${entity}'> = defineEntity({
  name: '${entity}',
  table: '${table}',
  fields: {
    id: f.id(),
    title: f.string({ min: 1, max: 200 }).index(),
    createdAt: f.createdAt(),
    updatedAt: f.updatedAt(),
  },
  permissions: { read: '${short}.read', create: '${short}.manage', update: '${short}.manage', delete: '${short}.manage' },
  label: { en: 'Item' },
  api: { list: true, get: true, create: true, update: true, delete: true },
});
`,
    },
    {
      path: `${dir}/src/index.ts`,
      content: `${header('src/index.ts', `The ${short} plugin: what it declares to the application (PLG-07).`)}import { definePlugin } from '@bieberkit/core';
import type { PluginDef } from '@bieberkit/core';
import pkg from '../package.json' with { type: 'json' };
import { Item } from './entities/item.ts';

export { Item } from './entities/item.ts';

const plugin: PluginDef = definePlugin({
  name: '${name}',
  version: pkg.version,
  core: '*',
  dialects: ['postgres', 'mysql', 'sqlite'],
  permissions: ['${short}.read', '${short}.manage'],
  entities: [Item],
});

export default plugin;
`,
    },
    {
      path: `${dir}/src/index.test.ts`,
      content: `${header('src/index.test.ts', `Tests of the ${short} plugin.`)}import { describe, expect, it } from 'vitest';
import plugin, { Item } from './index.ts';

describe('${name}', () => {
  it('declares its permissions and the table of its entity', () => {
    expect(plugin.name).toBe('${name}');
    expect(plugin.permissions).toEqual(['${short}.read', '${short}.manage']);
    expect(Item.table).toBe('${table}');
  });
});
`,
    },
    {
      path: `${dir}/README.md`,
      content: `# ${name}

The ${short} plugin for BieberKit.

- \`pnpm build\` builds it and writes its static manifest into \`package.json\` (PLG-07). \`bieberkit build --check\` verifies the manifest without writing.
- Add it to another project with \`bieberkit add ${name}\`, and take it out with \`bieberkit remove ${name}\`.
- It owns the table \`${table}\`. Other plugins reach it through what this package exports, and never through its tables (PLG-01, PLG-02).
- Its files are in the folder of their kind: \`entities/\`, \`services/\`, \`routes/\`, \`jobs/\`, \`events/\`, and in \`admin/\` the folders \`pages/\`, \`tabs/\`, \`fields/\`, \`components/\`, \`lib/\` and \`messages/\`. \`bieberkit check layout\` says when a file is out of place.
`,
    },
    ...(plugin.admin ? adminFiles(plugin, header) : []),
  ];
}

/** The admin part of a made plugin: one page that lists its items, with its menu entry and its texts (UI-34, UI-35). */
function adminFiles(plugin: NewPlugin, header: (file: string, description: string) => string): MadeFile[] {
  const { name, short, dir } = plugin;
  const title = pascal(short);
  const page = `${title}Page`;
  const entity = `${short}.Item`;
  const texts: Readonly<Record<'en' | 'vi' | 'zh', readonly [string, Readonly<Record<string, string>>]>> = {
    en: ['English', { title, all: 'All items', name: 'Title', empty: 'No items yet' }],
    vi: ['Vietnamese', { title, all: 'Tất cả mục', name: 'Tiêu đề', empty: 'Chưa có mục nào' }],
    zh: ['Chinese', { title, all: '全部条目', name: '标题', empty: '暂无条目' }],
  };
  return [
    {
      path: `${dir}/src/admin/index.ts`,
      content: `${header('src/admin/index.ts', `The admin part of the ${short} plugin: what it adds to the admin of a project (UI-34).`)}import { defineAdminPlugin } from '@bieberkit/admin-core';
import type { AdminPart, AdminView } from '@bieberkit/admin-core';

// The slots are a closed list: menu, pages, headerActions, notices, recordTabs, fields, homeBlocks, accountTabs, publicPages,
// signIn, gates and screens. Whole screens go in pages/, tabs in tabs/, controls of fields in fields/, smaller pieces in components/. This module is read when the admin is built, so it imports no screen: each is loaded when it is drawn.
const part: AdminPart<AdminView> = defineAdminPlugin({
  name: '${name}',
  menu: [{ page: '/${short}' }],
  pages: [
    { path: '/${short}', title: '${short}.title', permission: '${short}.read', load: () => import('./pages/${page}.tsx') },
  ],
  messages: {
    en: () => import('./messages/en.ts'),
    vi: () => import('./messages/vi.ts'),
    zh: () => import('./messages/zh.ts'),
  },
});

export default part;
`,
    },
    {
      path: `${dir}/src/admin/pages/${page}.tsx`,
      content: `${header(`src/admin/pages/${page}.tsx`, `The page of the ${short} plugin: its items, read with the client of the admin.`)}import { AdminLink, useAdminClient, useMeta, useText } from '@bieberkit/admin-antd';
import { useQuery } from '@tanstack/react-query';
import { Alert, Skeleton, Table } from 'antd';
import type { JSX } from 'react';

export default function ${page}(): JSX.Element {
  const text = useText();
  const client = useAdminClient();
  const entity = useMeta()?.entities.find((candidate) => candidate.name === '${entity}');
  const items = useQuery({
    queryKey: ['${short}', 'items'],
    queryFn: async () => (entity === undefined ? null : client.list(entity, { pageSize: 10, sort: 'title' })),
    enabled: entity !== undefined,
  });
  if (items.isError) return <Alert type="error" showIcon title={items.error.message} />;
  if (items.data === undefined || items.data === null) return <Skeleton active />;
  return (
    <>
      <p>
        <AdminLink to="/${short}/items">{text('${short}.all')}</AdminLink>
      </p>
      <Table
        rowKey={(row) => String(row['id'])}
        columns={[{ title: text('${short}.name'), dataIndex: 'title', key: 'title' }]}
        dataSource={items.data.rows.map((row) => ({ ...row }))}
        locale={{ emptyText: text('${short}.empty') }}
        pagination={false}
      />
    </>
  );
}
`,
    },
    ...Object.entries(texts).map(([language, [called, words]]) => ({
      path: `${dir}/src/admin/messages/${language}.ts`,
      content: `${header(`src/admin/messages/${language}.ts`, `The ${called} texts of the ${short} plugin. Each key begins with "${short}.".`)}const texts: Readonly<Record<string, string>> = {
${Object.entries(words)
  .map(([key, word]) => `  '${short}.${key}': '${word}',`)
  .join('\n')}
};

export default texts;
`,
    })),
    {
      path: `${dir}/src/admin/tsconfig.json`,
      content: `${JSON.stringify(
        {
          compilerOptions: {
            target: 'esnext',
            module: 'esnext',
            moduleResolution: 'bundler',
            lib: ['esnext', 'dom', 'dom.iterable'],
            types: [],
            jsx: 'react-jsx',
            strict: true,
            noUncheckedIndexedAccess: true,
            exactOptionalPropertyTypes: true,
            verbatimModuleSyntax: true,
            allowImportingTsExtensions: true,
            noEmit: true,
            skipLibCheck: true,
          },
          include: ['.'],
        },
        null,
        2,
      )}\n`,
    },
    {
      path: `${dir}/tsdown.admin.config.ts`,
      content: `${header('tsdown.admin.config.ts', `The build of the admin part of ${name}: one file out for each file in, for the build of a project.`)}import { defineConfig } from 'tsdown';

export default defineConfig({
  entry: ['src/admin/index.ts'],
  outDir: 'dist/admin',
  unbundle: true,
  format: 'esm',
  platform: 'neutral',
  dts: true,
  tsconfig: 'src/admin/tsconfig.json',
  fixedExtension: false,
  clean: true,
});
`,
    },
  ];
}

/** Writes the files that a recipe makes, refusing to replace one that exists. */
export function writeNew(root: string, files: readonly MadeFile[]): void {
  for (const file of files) {
    const path = join(root, file.path);
    if (existsSync(path)) {
      throw new CliError(`${file.path} exists already.`, {
        code: 'BK_MAKE_EXISTS',
        fix: 'Choose another name, or delete the file if it is a mistake.',
      });
    }
  }
  for (const file of files) {
    const path = join(root, file.path);
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, file.content);
  }
}

/**
 * Registers a file in its module: the import goes above the `bieberkit:imports` marker and the name above the marker of its list. A
 * module that was edited so that a marker is gone gets a message with the two lines to add by hand.
 */
export function register(root: string, module: string, list: 'entities' | 'jobs', name: string, from: string): string {
  const path = `${MODULES_DIR}/${module}/module.ts`;
  const marker = list === 'entities' ? ENTITIES : JOBS;
  const file = join(root, path);
  const text = readFileSync(file, 'utf8');
  const manual = `import { ${name} } from '${from}';  and add ${name} to ${list}`;
  if (!text.includes(IMPORTS) || !text.includes(marker)) {
    throw new CliError(
      `${path} has no ${text.includes(IMPORTS) ? marker : IMPORTS} marker, so ${name} was not registered.`,
      {
        code: 'BK_MAKE_UNREGISTERED',
        fix: `The file was made. Add it by hand: ${manual}.`,
      },
    );
  }
  const indent = /^([ \t]*)\/\/ bieberkit:/m.exec(text.slice(text.indexOf(marker) - 40))?.[1] ?? '    ';
  const next = text
    .replace(IMPORTS, `import { ${name} } from '${from}';\n${IMPORTS}`)
    .replace(marker, `${name},\n${indent}${marker}`);
  writeFileSync(file, next);
  return path;
}
