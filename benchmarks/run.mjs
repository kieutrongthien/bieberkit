/**
 * BieberKit
 *
 * @file        benchmarks/run.mjs
 * @description Measures the reference endpoints of section 18.1 on this machine: a blank project on PostgreSQL in a container, the cold start, the memory at rest, the size of the admin, and k6 for the latency of a list and of a get (PERF-08).
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
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gzipSync } from 'node:zlib';

const REPOSITORY = join(dirname(fileURLToPath(import.meta.url)), '..');
const CLI = join(REPOSITORY, 'packages', 'cli', 'dist', 'bin.js');
const PLUGINS = ['users', 'roles', 'settings', 'audit-log', 'notifications', 'media'];
const PACKAGES = ['core', 'data', 'http', 'queue', 'server', 'auth', 'log', 'cache', 'mail', 'storage', 'admin-antd'];
const PORT = 4320;
const DB_PORT = 55460;
const EMAIL = 'admin@example.com';
const PASSWORD = 'Benchmark-Admin-Passw0rd!';
const VUS = process.env.VUS ?? '10';
const DURATION = process.env.DURATION ?? '20s';

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function sh(file, args, options = {}) {
  const result = spawnSync(file, args, { encoding: 'utf8', ...options });
  if (result.status !== 0) {
    process.stderr.write(`${file} ${args.join(' ')} failed:\n${result.stdout}${result.stderr}\n`);
    process.exit(1);
  }
  return result.stdout;
}

if (!existsSync(CLI)) {
  process.stderr.write('Run `pnpm build` first.\n');
  process.exit(1);
}

const parent = mkdtempSync(join(tmpdir(), 'bk-bench-'));
const root = join(parent, 'demo');
const container = `bk-bench-${String(process.pid)}`;
let server;
const cleanup = () => {
  server?.kill('SIGTERM');
  spawnSync('docker', ['rm', '-f', container], { stdio: 'ignore' });
  rmSync(parent, { recursive: true, force: true });
};
process.on('SIGINT', () => {
  cleanup();
  process.exit(130);
});

try {
  sh('docker', [
    'run',
    '-d',
    '--rm',
    '--name',
    container,
    '-p',
    `127.0.0.1:${DB_PORT}:5432`,
    '-e',
    'POSTGRES_PASSWORD=bench',
    '-e',
    'POSTGRES_USER=bench',
    '-e',
    'POSTGRES_DB=bench',
    'postgres:15',
    '-c',
    'fsync=off',
  ]);
  const env = {
    ...process.env,
    APP_ENV: 'development',
    APP_URL: `http://127.0.0.1:${PORT}`,
    APP_PORT: String(PORT),
    METRICS_PORT: String(PORT + 1),
    LOG_LEVEL: 'warn',
    DB_CONNECTION: 'postgres',
    DATABASE_URL: `postgres://bench:bench@127.0.0.1:${DB_PORT}/bench`,
    MIGRATE_DATABASE_URL: `postgres://bench:bench@127.0.0.1:${DB_PORT}/bench`,
    USERS_ADMIN_EMAIL: EMAIL,
    USERS_ADMIN_PASSWORD: PASSWORD,
  };
  sh(
    process.execPath,
    [
      CLI,
      'create',
      'demo',
      '--yes',
      '--db',
      'postgres',
      '--no-install',
      '--no-git',
      '--author',
      'Test <test@example.com>',
    ],
    { cwd: parent, env },
  );
  mkdirSync(join(root, 'node_modules', '@bieberkit'), { recursive: true });
  for (const name of PACKAGES)
    symlinkSync(join(REPOSITORY, 'packages', name), join(root, 'node_modules', '@bieberkit', name), 'dir');
  for (const name of PLUGINS)
    symlinkSync(join(REPOSITORY, 'plugins', name), join(root, 'node_modules', '@bieberkit', `plugin-${name}`), 'dir');
  symlinkSync(join(REPOSITORY, 'packages', 'data', 'node_modules', 'zod'), join(root, 'node_modules', 'zod'), 'dir');
  for (let attempt = 0; attempt < 60; attempt += 1) {
    if (spawnSync('docker', ['exec', container, 'pg_isready', '-U', 'bench']).status === 0) break;
    await sleep(500);
  }
  for (const args of [['migrate:make'], ['migrate'], ['db:seed']])
    sh(process.execPath, [CLI, ...args], { cwd: root, env });

  // The cold start: from the start of the process to the first ready answer (section 18.1: under 2 s).
  const started = performance.now();
  server = spawn(process.execPath, [join(root, 'apps', 'server', 'src', 'main.ts'), 'web'], {
    cwd: root,
    env,
    stdio: 'ignore',
  });
  let ready = false;
  while (!ready && performance.now() - started < 30_000) {
    ready = await fetch(`http://127.0.0.1:${PORT}/health/ready`).then(
      (r) => r.ok,
      () => false,
    );
    if (!ready) await sleep(25);
  }
  const coldStartMs = Math.round(performance.now() - started);
  await sleep(3000);
  const rssKb = Number(/VmRSS:\s+(\d+) kB/.exec(readFileSync(`/proc/${String(server.pid)}/status`, 'utf8'))?.[1]);

  const assets = join(REPOSITORY, 'packages', 'admin-antd', 'dist', 'app', 'assets');
  const adminBytes = readdirSync(assets)
    .filter((name) => name.endsWith('.js'))
    .reduce((sum, name) => sum + gzipSync(readFileSync(join(assets, name))).length, 0);

  const scripts = join(REPOSITORY, 'benchmarks');
  const summary = join(parent, 'summary.json');
  spawnSync(
    'docker',
    [
      'run',
      '--rm',
      '--user',
      String(process.getuid?.() ?? 1000),
      '--network',
      'host',
      '-v',
      `${scripts}:/scripts:ro`,
      '-v',
      `${parent}:/out`,
      '-e',
      `BASE=http://127.0.0.1:${PORT}`,
      '-e',
      `EMAIL=${EMAIL}`,
      '-e',
      `PASSWORD=${PASSWORD}`,
      '-e',
      `VUS=${VUS}`,
      '-e',
      `DURATION=${DURATION}`,
      'grafana/k6:latest',
      'run',
      '--summary-export',
      '/out/summary.json',
      '--quiet',
      '/scripts/entity.k6.js',
    ],
    { stdio: ['ignore', 'ignore', 'inherit'] },
  );
  const metrics = JSON.parse(readFileSync(summary, 'utf8')).metrics;
  const row = (name) => metrics[name];
  const result = {
    machine: `${process.platform} ${spawnSync('nproc', { encoding: 'utf8' }).stdout.trim()} cores, node ${process.version}`,
    vus: Number(VUS),
    duration: DURATION,
    listP95Ms: row('http_req_duration{scenario:list}')?.['p(95)'],
    rps: row('http_reqs')?.rate,
    getP95Ms: row('http_req_duration{scenario:get}')?.['p(95)'],
    liveP95Ms: row('http_req_duration{scenario:live}')?.['p(95)'],
    failedRate: row('http_req_failed')?.value,
    coldStartMs,
    idleRssMb: Math.round(rssKb / 1024),
    adminGzipKb: Math.round(adminBytes / 1024),
  };
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
} finally {
  cleanup();
}
