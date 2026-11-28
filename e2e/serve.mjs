/**
 * BieberKit
 *
 * @file        e2e/serve.mjs
 * @description Starts the project that the browser test signs in to: it makes a blank project, links the packages of this repository, migrates, seeds the administrator, and runs the web role in the foreground (spec section 21).
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

import { spawn, spawnSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

// Two servers run in one test: the admin at /admin of the application, and the admin at the root of a host of its own.
const PORT = Number(process.env.E2E_PORT ?? 4310);
const ADMIN_EMAIL = 'admin@example.com';
const ADMIN_PASSWORD = 'Playwright-Admin-Passw0rd!';

const REPOSITORY = join(dirname(fileURLToPath(import.meta.url)), '..');
const CLI = join(REPOSITORY, 'packages', 'cli', 'dist', 'bin.js');
const PLUGINS = ['users', 'roles', 'settings', 'audit-log', 'notifications', 'media'];
const PACKAGES = [
  'core',
  'data',
  'http',
  'queue',
  'server',
  'auth',
  'log',
  'cache',
  'mail',
  'storage',
  'admin-core',
  'admin-antd',
];
// What the admin of the project is built with, linked from where the library of the admin has it, so that there is one copy.
const ADMIN_TOOLS = ['vite', '@vitejs/plugin-react', 'react', 'react-dom', 'antd'];

// The tests of the account read the mailed links from the outbox, so the database is where they can find it.
const DATABASE = join(tmpdir(), `bk-e2e-${PORT}.db`);
for (const suffix of ['', '-wal', '-shm']) rmSync(`${DATABASE}${suffix}`, { force: true });

const env = {
  ...process.env,
  APP_ENV: 'development',
  DATABASE_URL: DATABASE,
  MAIL_FROM: 'BieberKit e2e <e2e@example.com>',
  // Each test of the account signs in from an address of its own, so that the limit of sign ins for an address is not shared.
  TRUST_PROXY: 'true',
  APP_URL: `http://127.0.0.1:${PORT}`,
  ...(process.env.E2E_ADMIN_URL === undefined ? {} : { ADMIN_URL: process.env.E2E_ADMIN_URL }),
  APP_PORT: String(PORT),
  METRICS_PORT: String(PORT + 1),
  LOG_LEVEL: 'warn',
  USERS_ADMIN_EMAIL: ADMIN_EMAIL,
  USERS_ADMIN_PASSWORD: ADMIN_PASSWORD,
};

function run(cwd, args) {
  const result = spawnSync(process.execPath, [CLI, ...args], { cwd, env, encoding: 'utf8' });
  if (result.status !== 0) {
    process.stderr.write(`bieberkit ${args.join(' ')} failed:\n${result.stdout}${result.stderr}\n`);
    process.exit(1);
  }
}

if (!existsSync(CLI) || !existsSync(join(REPOSITORY, 'packages', 'admin-antd', 'dist', 'lib', 'index.js'))) {
  process.stderr.write('Run `pnpm build` first: the browser test uses the built packages and the built admin.\n');
  process.exit(1);
}

const parent = mkdtempSync(join(tmpdir(), 'bk-e2e-'));
const root = join(parent, 'demo');
run(parent, ['create', 'demo', '--yes', '--no-install', '--no-git', '--author', 'Test <test@example.com>']);
// What `pnpm install` leaves in a project, from the packages of this repository.
mkdirSync(join(root, 'node_modules', '@bieberkit'), { recursive: true });
for (const name of PACKAGES)
  symlinkSync(join(REPOSITORY, 'packages', name), join(root, 'node_modules', '@bieberkit', name), 'dir');
for (const name of PLUGINS)
  symlinkSync(join(REPOSITORY, 'plugins', name), join(root, 'node_modules', '@bieberkit', `plugin-${name}`), 'dir');
symlinkSync(join(REPOSITORY, 'packages', 'data', 'node_modules', 'zod'), join(root, 'node_modules', 'zod'), 'dir');
symlinkSync(join(REPOSITORY, 'packages', 'cli'), join(root, 'node_modules', 'bieberkit'), 'dir');
mkdirSync(join(root, 'node_modules', '@vitejs'), { recursive: true });
for (const name of ADMIN_TOOLS)
  symlinkSync(
    join(REPOSITORY, 'packages', 'admin-antd', 'node_modules', name),
    join(root, 'node_modules', name),
    'dir',
  );
// The admin depends on every plugin of the project, as `create` and `bieberkit add` write it.
mkdirSync(join(root, 'apps', 'admin', 'node_modules', '@bieberkit'), { recursive: true });
for (const name of PLUGINS)
  symlinkSync(
    join(REPOSITORY, 'plugins', name),
    join(root, 'apps', 'admin', 'node_modules', '@bieberkit', `plugin-${name}`),
    'dir',
  );
mkdirSync(join(root, 'data'), { recursive: true });
writeFileSync(join(root, 'apps', 'server', 'src', 'seed.ts'), 'export default async function seed() {}\n');

// A plugin with accounts and tickets, because the base plugins have no entity that the screens can create and change.
cpSync(join(REPOSITORY, 'e2e', 'fixtures', 'crm'), join(root, 'node_modules', '@bieberkit', 'plugin-crm'), {
  recursive: true,
});
const configPath = join(root, 'bieberkit.config.ts');
// The server of the host of its own has a brand of its own, so that the test sees it travel from the config to the page (UI-33).
const brand =
  process.env.E2E_ADMIN_URL === undefined
    ? ''
    : "admin: { brand: { name: 'Acme Works', tagline: 'Acme at work.' } },\n  ";
writeFileSync(
  configPath,
  readFileSync(configPath, 'utf8').replace('plugins: [', `${brand}plugins: [\n    '@bieberkit/plugin-crm',`),
);

symlinkSync(
  join(root, 'node_modules', '@bieberkit', 'plugin-crm'),
  join(root, 'apps', 'admin', 'node_modules', '@bieberkit', 'plugin-crm'),
  'dir',
);

/** A program that has to succeed before the server starts. */
function node(cwd, args) {
  const result = spawnSync(process.execPath, args, { cwd, env, encoding: 'utf8' });
  if (result.status !== 0) {
    process.stderr.write(`node ${args.join(' ')} failed:\n${result.stdout}${result.stderr}\n`);
    process.exit(1);
  }
}

// The admin of the project, built from its plugins as `bieberkit build` builds it, and held to the budget of section 18.1.
const admin = join(root, 'apps', 'admin');
node(admin, [join(root, 'node_modules', 'vite', 'bin', 'vite.js'), 'build']);
node(REPOSITORY, [join(REPOSITORY, 'tools', 'check-admin-size.ts'), join(admin, 'dist')]);

run(root, ['migrate:make']);
run(root, ['migrate']);
run(root, ['db:seed']);

const server = spawn(process.execPath, [join(root, 'apps', 'server', 'src', 'main.ts'), 'web'], {
  cwd: root,
  env,
  stdio: 'inherit',
});
const stop = () => {
  server.kill('SIGTERM');
  rmSync(parent, { recursive: true, force: true });
};
process.on('SIGTERM', stop);
process.on('SIGINT', stop);
server.on('exit', (code) => process.exit(code ?? 1));
