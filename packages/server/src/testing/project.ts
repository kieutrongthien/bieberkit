/**
 * BieberKit
 *
 * @file        packages/server/src/testing/project.ts
 * @description Makes a throwaway project on disk for the tests of the boot: a config, a module with an entity and a route, and the packages of this repository linked in.
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

import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const PACKAGES = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');

export interface Fixture {
  readonly root: string;
  cleanup(): void;
}

const CONFIG = `import { defineConfig } from '@bieberkit/core';

export default defineConfig({
  name: 'demo',
  author: 'Test <test@example.com>',
  license: 'UNLICENSED',
  database: { dialect: 'sqlite' },
  tenancy: { mode: 'single' },
  locales: { default: 'en', supported: ['en'] },
  plugins: [],
});
`;

const MODULE = `import { defineModule } from '@bieberkit/core';
import { defineEntity, f } from '@bieberkit/data';

const Person = defineEntity({
  name: 'crm.Person',
  table: 'crm_people',
  fields: { id: f.id(), name: f.string({ min: 1, max: 50 }).index(), secretNote: f.string({ max: 50 }).optional().pii() },
  permissions: { read: 'crm.person.read', create: 'crm.person.create' },
  api: { list: true, get: true, create: true },
});

const ping = {
  method: 'GET',
  url: '/api/v1/crm/ping',
  public: true,
  schema: { response: { 200: { type: 'object', properties: { pong: { type: 'boolean' } }, required: ['pong'] } } },
  handler: () => ({ pong: true }),
};

export default defineModule({ name: 'crm', entities: [Person], routes: [ping] });
`;

/** A free TCP port: the schemas of the ports refuse 0, so a test asks the system for one and gives it back. */
export async function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const probe = createServer();
    probe.once('error', reject);
    probe.listen(0, '127.0.0.1', () => {
      const address = probe.address();
      const port = address !== null && typeof address === 'object' ? address.port : 0;
      probe.close(() => resolve(port));
    });
  });
}

export function makeProject(files: Readonly<Record<string, string>> = {}): Fixture {
  const root = mkdtempSync(join(tmpdir(), 'bk-server-'));
  mkdirSync(join(root, 'node_modules/@bieberkit'), { recursive: true });
  for (const name of ['core', 'data', 'http', 'queue'])
    symlinkSync(join(PACKAGES, name), join(root, 'node_modules/@bieberkit', name), 'dir');
  symlinkSync(join(PACKAGES, 'data', 'node_modules', 'zod'), join(root, 'node_modules/zod'), 'dir');
  writeFileSync(join(root, 'bieberkit.config.ts'), CONFIG);
  const all: Record<string, string> = { 'apps/server/src/modules/crm/module.ts': MODULE, ...files };
  for (const [path, text] of Object.entries(all)) {
    mkdirSync(dirname(join(root, path)), { recursive: true });
    writeFileSync(join(root, path), text);
  }
  return { root, cleanup: () => rmSync(root, { recursive: true, force: true }) };
}

/** The environment of a booted test process: SQLite in a file of the project, and ports that are free. */
export async function testEnv(root: string, extra: Record<string, string> = {}): Promise<Record<string, string>> {
  return {
    APP_ENV: 'development',
    APP_KEY: 'k'.repeat(44),
    AUTH_SECRET: 's'.repeat(40),
    DB_CONNECTION: 'sqlite',
    DATABASE_URL: join(root, 'test.db'),
    APP_PORT: String(await freePort()),
    METRICS_PORT: String(await freePort()),
    LOG_LEVEL: 'fatal',
    QUEUE_DRIVER: 'sync',
    CACHE_DRIVER: 'memory',
    ...extra,
  };
}
