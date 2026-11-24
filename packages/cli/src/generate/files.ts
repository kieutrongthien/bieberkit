/**
 * BieberKit
 *
 * @file        packages/cli/src/generate/files.ts
 * @description Makes the generated files of a project in memory, writes the ones that changed, and says which committed ones are stale (GEN-01 to GEN-03, section 5.4).
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
import { openApiDocument } from '@bieberkit/http';
import { generateRegistrySource } from '@bieberkit/data/schema';
import { toJsonSchema } from '@bieberkit/data/schema';
import type { App } from '../app.ts';
import { CLIENT_COMMAND, generateClient } from './client.ts';
import { generatedHeader } from './header.ts';

export interface GeneratedFile {
  /** Relative to the project root, with `/`. */
  readonly path: string;
  readonly content: string;
  /** Committed files are checked for staleness (GEN-01). The ones under `.bieberkit/` are not committed (section 5.4). */
  readonly committed: boolean;
}

const json = (value: unknown): string => `${JSON.stringify(value, null, 2)}\n`;

/** The OpenAPI document of the application, the same bytes for the same routes (GEN-03). */
export function openApiOf(app: App): Record<string, unknown> {
  return openApiDocument(app.routes, { title: app.project.config.name, version: app.version });
}

/** The name of a project without its scope, for the name of its client package. */
const bareName = (name: string): string => name.replace(/^@[^/]+\//, '');

/**
 * Every generated file of the application: the types and the schemas of the entities, the resolved plugin graph and the document of
 * the API under `.bieberkit/`, and the client under `packages/client/` (section 5.4).
 */
export function generateFiles(app: App): GeneratedFile[] {
  const { config } = app.project;
  const document = openApiOf(app);
  const files: GeneratedFile[] = [
    {
      path: '.bieberkit/types/entities.d.ts',
      content: generateRegistrySource(app.entities, {
        header: generatedHeader(
          config,
          '.bieberkit/types/entities.d.ts',
          'The row, create and update types of every entity.',
          'bieberkit generate',
        ),
      }),
      committed: false,
    },
    { path: '.bieberkit/openapi.json', content: json(document), committed: false },
    {
      path: '.bieberkit/vitest.config.ts',
      content: `${generatedHeader(config, '.bieberkit/vitest.config.ts', 'The Vitest preset of the project: the files it tests, the databases of its containers and the guard on the network.', 'bieberkit generate')}import { resolve } from 'node:path';
import { defineConfig } from 'vitest/config';

// The services come from the environment, the way CI gives them: the URLs of the test databases, and the hosts that a test may call
// besides this machine (TST-03).
export default defineConfig({
  root: resolve(import.meta.dirname, '..'),
  test: {
    include: ['apps/**/*.test.ts', 'packages/**/*.test.ts'],
    exclude: ['**/node_modules/**', '**/dist/**'],
    setupFiles: ['./.bieberkit/vitest.setup.ts'],
    provide: {
      dialectUrls: {
        postgres: process.env['DATABASE_URL_POSTGRES'] ?? '',
        mysql: process.env['DATABASE_URL_MYSQL'] ?? '',
        require: process.env['BK_REQUIRE_DIALECTS'] ?? '',
      },
      networkAllow: (process.env['TEST_NETWORK_ALLOW'] ?? '').split(',').map((host) => host.trim()).filter((host) => host !== ''),
    },
  },
});
`,
      committed: false,
    },
    {
      path: '.bieberkit/vitest.setup.ts',
      content: `${generatedHeader(config, '.bieberkit/vitest.setup.ts', 'Runs before every test file: a test that connects outside this machine fails.', 'bieberkit generate')}import { installNetworkGuard } from '@bieberkit/testing';
import { inject } from 'vitest';

declare module 'vitest' {
  export interface ProvidedContext {
    networkAllow: string[];
    dialectUrls: { postgres: string; mysql: string; require: string };
  }
}

installNetworkGuard({ allow: inject('networkAllow') });
`,
      committed: false,
    },
    {
      path: '.bieberkit/meta/plugins.json',
      content: json({
        core: app.project.coreVersion,
        plugins: app.project.plugins.map(({ def }) => ({
          name: def.name,
          version: def.version,
          requires: def.requires,
        })),
        modules: app.modules.map((module) => module.name),
        entities: app.entities.map((entity) => entity.name).toSorted(),
        routes: app.routes.length,
      }),
      committed: false,
    },
    ...app.entities
      .toSorted((a, b) => (a.name < b.name ? -1 : 1))
      .flatMap((entity) =>
        (['create', 'update', 'read'] as const).map((mode) => ({
          path: `.bieberkit/schemas/${entity.name}.${mode}.json`,
          content: json(toJsonSchema(entity, mode)),
          committed: false,
        })),
      ),
    {
      path: 'packages/client/package.json',
      content: json({
        name: `${bareName(config.name)}-client`,
        version: app.version,
        private: true,
        type: 'module',
        exports: { '.': './src/index.ts' },
      }),
      committed: true,
    },
    { path: 'packages/client/src/index.ts', content: generateClient(document, config), committed: true },
  ];
  return files.toSorted((a, b) => (a.path < b.path ? -1 : 1));
}

/** The generated files whose command is `client:generate`. */
export const clientFiles = (files: readonly GeneratedFile[]): GeneratedFile[] =>
  files.filter((file) => file.path.startsWith('packages/client/'));

export interface WriteResult {
  readonly written: readonly string[];
  readonly unchanged: readonly string[];
}

/** Writes the files that differ from what is on disk, so that a file that is right keeps its time and the diff shows only real changes. */
export function writeFiles(root: string, files: readonly GeneratedFile[]): WriteResult {
  const written: string[] = [];
  const unchanged: string[] = [];
  for (const file of files) {
    const path = join(root, file.path);
    if (existsSync(path) && readFileSync(path, 'utf8') === file.content) {
      unchanged.push(file.path);
      continue;
    }
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, file.content);
    written.push(file.path);
  }
  return { written, unchanged };
}

/** The files that are missing or differ from what the generators give. */
export function staleFiles(root: string, files: readonly GeneratedFile[]): string[] {
  return files
    .filter((file) => {
      const path = join(root, file.path);
      return !existsSync(path) || readFileSync(path, 'utf8') !== file.content;
    })
    .map((file) => file.path);
}

export { CLIENT_COMMAND };
