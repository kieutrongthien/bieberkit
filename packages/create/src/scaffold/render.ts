/**
 * BieberKit
 *
 * @file        packages/create/src/scaffold/render.ts
 * @description The files of a new project: the config, the env files with fresh secrets, the compose file, the workspace and the app, each with the header of section 23.7.
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

import { coreEnv, describeEnv } from '@bieberkit/core';
import type { Dialect } from '@bieberkit/core';
import type { Choices } from './choices.ts';
import { renderEnvExample } from './env-example.ts';
import { LICENSES } from './licenses.ts';

export interface ProjectFile {
  /** Relative to the project folder, with `/`. */
  readonly path: string;
  readonly content: string;
}

/** What the plan decided and the render needs. */
export interface Plan {
  /** The plugins in boot order, with the version that the index has. */
  readonly plugins: readonly { readonly name: string; readonly version: string; readonly env: readonly string[] }[];
  readonly year: number;
  /** The version of the framework packages: they share one (section 24.2). */
  readonly framework: string;
  /** Where secrets come from. A test gives a fixed one. */
  readonly random: () => string;
}

const PNPM = '12.21.0';

type Style = 'block' | 'hash' | 'html';

/** The header of section 23.7 for a file of this style: the project, the path, what the file is, the author and the license. */
function header(style: Style, choices: Choices, plan: Plan, path: string, description: string): string {
  const holder = choices.author.replace(/\s*<[^>]*>\s*$/, '');
  const lines = [
    choices.project.name,
    '',
    `@file        ${path}`,
    `@description ${description}`,
    `@author      ${choices.author}`,
    `@copyright   Copyright (c) ${plan.year} ${holder}`,
    `@license     ${choices.license}`,
  ];
  if (style === 'block') return `/**\n${lines.map((line) => (line === '' ? ' *' : ` * ${line}`)).join('\n')}\n */\n\n`;
  if (style === 'hash') return `${lines.map((line) => (line === '' ? '#' : `# ${line}`)).join('\n')}\n\n`;
  return `<!--\n${lines.map((line) => (line === '' ? '' : `  ${line}`)).join('\n')}\n-->\n\n`;
}

const json = (value: unknown): string => `${JSON.stringify(value, null, 2)}\n`;
const identifier = (folder: string): string => folder.replaceAll(/[^a-z0-9_]/g, '_');

export function databaseUrl(dialect: Dialect, folder: string): string {
  const name = identifier(folder);
  if (dialect === 'sqlite') return './data/app.db';
  return dialect === 'postgres'
    ? `postgres://${name}:${name}@localhost:5432/${name}`
    : `mysql://${name}:${name}@localhost:3306/${name}`;
}

/** The text of `.env`: development defaults and fresh secrets (section 6, step 7). It is not committed. */
export function renderDotenv(choices: Choices, plan: Plan): string {
  const name = identifier(choices.project.folder);
  const values: [string, string][] = [
    ['APP_NAME', choices.project.folder],
    ['APP_ENV', 'development'],
    ['APP_URL', 'http://localhost:3000'],
    ['APP_KEY', plan.random()],
    ['AUTH_SECRET', plan.random()],
    ['DB_CONNECTION', choices.dialect],
    ['DATABASE_URL', databaseUrl(choices.dialect, choices.project.folder)],
    ['REDIS_URL', 'redis://localhost:6379'],
    ['CACHE_REDIS_URL', 'redis://localhost:6380'],
    ['QUEUE_DRIVER', 'sync'],
    ['CACHE_DRIVER', 'file'],
    ['STORAGE_DISK', 'local'],
    ['MAIL_DRIVER', 'log'],
  ];
  if (choices.site)
    values.push(
      ['SITE_URL', 'http://localhost:3001'],
      ['SITE_API_URL', 'http://localhost:3000'],
      ['SITE_SERVICE_TOKEN', plan.random()],
      ['SITE_REVALIDATE_SECRET', plan.random()],
    );
  const plugins = plan.plugins.flatMap((plugin) => plugin.env.map((key) => `${key}=`));
  void name;
  return [
    '# Development settings and the secrets made when the project was created. This file is not committed.',
    ...values.map(([key, value]) => `${key}=${value}`),
    ...(plugins.length === 0 ? [] : ['', '# Keys of the plugins that need a value.', ...plugins]),
    '',
  ].join('\n');
}

function renderConfig(choices: Choices, plan: Plan): string {
  const template = choices.template;
  const locales = template.locales ?? { default: 'en', supported: ['en'] };
  const plugins = plan.plugins.map((plugin) => `    '${plugin.name}',`).join('\n');
  return `${header('block', choices, plan, 'bieberkit.config.ts', 'The configuration of the project: its plugins, its database and its languages.')}import { defineConfig } from '@bieberkit/core';

export default defineConfig({
  name: '${choices.project.name}',
  author: '${choices.author}',
  license: '${choices.license}',
  database: { dialect: '${choices.dialect}' },
  tenancy: { mode: '${template.tenancy ?? 'single'}' },
  locales: { default: '${locales.default}', supported: [${locales.supported.map((tag) => `'${tag}'`).join(', ')}] },
  plugins: [${plugins === '' ? '' : `\n${plugins}\n  `}],
});
`;
}

function renderCompose(choices: Choices, plan: Plan): string {
  const name = identifier(choices.project.folder);
  const database =
    choices.dialect === 'postgres'
      ? `  db:
    image: postgres:15
    environment:
      POSTGRES_USER: ${name}
      POSTGRES_PASSWORD: ${name}
      POSTGRES_DB: ${name}
    ports:
      - '5432:5432'
    volumes:
      - db-data:/var/lib/postgresql/data
    healthcheck:
      test: ['CMD-SHELL', 'pg_isready -U ${name}']
      interval: 5s
      retries: 10
`
      : choices.dialect === 'mysql'
        ? `  db:
    image: mysql:8.4
    environment:
      MYSQL_USER: ${name}
      MYSQL_PASSWORD: ${name}
      MYSQL_DATABASE: ${name}
      MYSQL_ROOT_PASSWORD: ${name}
    ports:
      - '3306:3306'
    volumes:
      - db-data:/var/lib/mysql
    healthcheck:
      test: ['CMD', 'mysqladmin', 'ping', '-h', 'localhost']
      interval: 5s
      retries: 10
`
        : '';
  return `${header('hash', choices, plan, 'compose.yaml', 'The services that bieberkit dev starts: the database and Valkey for development.')}services:
${database}  valkey:
    image: valkey/valkey:8
    command: ['valkey-server', '--maxmemory-policy', 'noeviction']
    ports:
      - '6379:6379'
  valkey-cache:
    image: valkey/valkey:8
    command: ['valkey-server', '--maxmemory', '128mb', '--maxmemory-policy', 'allkeys-lru']
    ports:
      - '6380:6379'
${choices.dialect === 'sqlite' ? '' : '\nvolumes:\n  db-data:\n'}`;
}

function renderWorkspace(choices: Choices, plan: Plan): string {
  const builds = choices.dialect === 'sqlite' ? '  better-sqlite3: true\n' : '';
  return `${header('hash', choices, plan, 'pnpm-workspace.yaml', 'The workspace and the supply chain settings of the project (SEC-11).')}packages:
  - 'apps/*'
  - 'packages/*'

# New versions become installable 7 days after publication. Do not relax these to make an install pass: report the failure.
minimumReleaseAge: 10080
trustPolicy: no-downgrade
blockExoticSubdeps: true
strictDepBuilds: true
allowBuilds:
${builds}  msgpackr-extract: false
saveExact: true
`;
}

function renderMain(choices: Choices, plan: Plan): string {
  return `${header('block', choices, plan, 'apps/server/src/main.ts', 'The entry point of every process: it reads the role from the arguments (web, worker, scheduler, migrate or dev) and starts it.')}import { main } from '@bieberkit/server';

process.exitCode = await main();
`;
}

function renderAgents(choices: Choices, plan: Plan): string {
  return `${header('html', choices, plan, 'AGENTS.md', 'Instructions for the people and the agents that work on this project.')}# ${choices.project.name}

Built on BieberKit. The commands run from the root of the project:

- \`pnpm dev\` starts the services of \`compose.yaml\` and the server in watch mode.
- \`pnpm check\` runs the rules of the framework (\`bieberkit check\`): headers, env access, boundaries, SQL, transactions, migrations.
- \`bieberkit routes\`, \`bieberkit openapi\` and \`bieberkit client:generate\` show and generate the API.
- \`bieberkit make:module\`, \`make:entity\` and \`make:job\` start new code from the official recipes.

Rules:

- Every file starts with the header of its project: \`bieberkit check headers\`.
- Read the environment only through the validated config of \`@bieberkit/core\`, never the global environment object.
- Files marked \`@generated\` are never edited by hand: change their source and run \`bieberkit generate\`.
- Plugins are dependencies, never copied into the project.
`;
}

/** Every file of the new project, in the order of their paths. Nothing has been written yet (section 6: a failed check leaves the folder alone). */
export function renderProject(choices: Choices, plan: Plan): ProjectFile[] {
  const folder = choices.project.folder;
  const pins = (names: readonly string[]): Record<string, string> =>
    Object.fromEntries(names.map((name) => [name, plan.framework]));
  const pluginPins = Object.fromEntries(plan.plugins.map((plugin) => [plugin.name, plugin.version]));
  const rows = describeEnv(coreEnv);
  const example = renderEnvExample([
    ...rows,
    ...plan.plugins.flatMap((plugin) =>
      plugin.env.map((key) => ({
        key,
        type: 'string' as const,
        required: true,
        secret: false,
        description: `Setting of ${plugin.name}`,
      })),
    ),
  ]);
  const files: ProjectFile[] = [
    {
      path: 'package.json',
      content: json({
        name: choices.project.name,
        version: '0.0.0',
        private: true,
        type: 'module',
        license: choices.license,
        author: choices.author,
        packageManager: `pnpm@${PNPM}`,
        scripts: {
          dev: 'bieberkit dev',
          build: 'bieberkit build',
          start: 'bieberkit start',
          check: 'bieberkit check',
          test: 'bieberkit test',
        },
        devDependencies: { ...pins(['bieberkit', '@bieberkit/testing']), typescript: '7.0.2', vitest: '4.1.12' },
        engines: { node: '>=24.12' },
      }),
    },
    { path: 'pnpm-workspace.yaml', content: renderWorkspace(choices, plan) },
    {
      path: 'apps/server/package.json',
      content: json({
        name: `${folder}-server`,
        version: '0.0.0',
        private: true,
        type: 'module',
        dependencies: {
          ...pins(['@bieberkit/core', '@bieberkit/data', '@bieberkit/http', '@bieberkit/queue', '@bieberkit/server']),
          ...pluginPins,
          zod: '4.6.7',
        },
      }),
    },
    { path: 'apps/server/src/main.ts', content: renderMain(choices, plan) },
    {
      path: 'tsconfig.json',
      content: json({
        compilerOptions: {
          target: 'esnext',
          module: 'esnext',
          moduleResolution: 'bundler',
          lib: ['esnext'],
          strict: true,
          noUncheckedIndexedAccess: true,
          exactOptionalPropertyTypes: true,
          verbatimModuleSyntax: true,
          allowImportingTsExtensions: true,
          erasableSyntaxOnly: true,
          isolatedDeclarations: true,
          declaration: true,
          noEmit: true,
          skipLibCheck: true,
        },
        include: ['bieberkit.config.ts', 'apps/**/*.ts', 'packages/**/*.ts', '.bieberkit/types/*.d.ts'],
      }),
    },
    { path: 'bieberkit.config.ts', content: renderConfig(choices, plan) },
    { path: '.env', content: renderDotenv(choices, plan) },
    { path: '.env.example', content: example },
    { path: 'compose.yaml', content: renderCompose(choices, plan) },
    { path: 'AGENTS.md', content: renderAgents(choices, plan) },
    {
      path: 'CLAUDE.md',
      content: `${header('html', choices, plan, 'CLAUDE.md', 'Points Claude Code at AGENTS.md.')}@AGENTS.md\n`,
    },
    {
      path: '.gitignore',
      content: `${header('hash', choices, plan, '.gitignore', 'What git leaves out: installed packages, builds, the environment, and what is generated and not committed.')}node_modules\ndist\ncoverage\n.env\n.bieberkit\nstorage\ndata/*.db\n.turbo\n`,
    },
  ];
  if (choices.dialect === 'sqlite') files.push({ path: 'data/.gitkeep', content: '' });
  const text = LICENSES[choices.license];
  if (text !== undefined) {
    files.push({ path: 'LICENSE', content: text.render(plan.year, choices.author.replace(/\s*<[^>]*>\s*$/, '')) });
  }
  return files.toSorted((a, b) => (a.path < b.path ? -1 : 1));
}
