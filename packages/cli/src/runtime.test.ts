/**
 * BieberKit
 *
 * @file        packages/cli/src/runtime.test.ts
 * @description Tests of start, dev, db:seed, doctor and test: what they run and with which arguments, the exit codes, and a new project that really starts (section 5.2, section 6, section 7).
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

import { spawn as nodeSpawn } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';
import { createRunner } from 'create-bieberkit/kit';
import { checkCommand } from './commands/check.ts';
import { dbSeedCommand, devCommand, doctorCommand, startCommand, testCommand } from './commands/runtime.ts';
import type { RuntimeDeps } from './commands/runtime.ts';
import type { Child, Spawn } from './processes.ts';
import { runCli } from './run.ts';
import { CRM_MODULE, linkBasePlugins, makeProject } from './testing/project.ts';
import type { Fixture } from './testing/project.ts';

const fixtures: Fixture[] = [];
const folders: string[] = [];
afterEach(() => {
  for (const fixture of fixtures.splice(0)) fixture.cleanup();
  for (const folder of folders.splice(0)) rmSync(folder, { recursive: true, force: true });
});

const MODULE = 'apps/server/src/modules/crm/module.ts';
const project = (files: Record<string, string> = {}): Fixture => {
  const made = makeProject({ files: { [MODULE]: CRM_MODULE, ...files } });
  fixtures.push(made);
  return made;
};

interface Call {
  file: string;
  args: readonly string[];
  cwd: string;
  quiet: boolean;
}

/** A spawn that records what it was asked to run, and ends with the code that the test chose. */
function fake(codes: Record<string, number> = {}): { spawn: Spawn; calls: Call[] } {
  const calls: Call[] = [];
  const spawn: Spawn = (file, args, options) => {
    calls.push({ file, args, cwd: options.cwd, quiet: options.quiet === true });
    const child: Child = { exit: Promise.resolve(codes[file] ?? 0), kill: () => undefined };
    return child;
  };
  return { spawn, calls };
}

async function run(root: string, deps: RuntimeDeps, argv: string[], env?: Record<string, string>) {
  const runner = createRunner({
    name: 'bieberkit',
    version: '0.0.0',
    commands: [startCommand(deps), devCommand(deps), testCommand(deps), dbSeedCommand, doctorCommand, checkCommand],
  });
  const out: string[] = [];
  const err: string[] = [];
  const code = await runner(argv, {
    stdout: (text) => out.push(text),
    stderr: (text) => err.push(text),
    cwd: root,
    ...(env === undefined ? {} : { env }),
  });
  const parsed: unknown = argv.includes('--json') ? JSON.parse(out[0] ?? '{}') : undefined;
  const json = typeof parsed === 'object' && parsed !== null ? Object.fromEntries(Object.entries(parsed)) : {};
  return { code, out: out.join(''), err: err.join(''), data: Object(json['data']), error: Object(json['error']) };
}

describe('section 5.2 start', () => {
  it('5.2 runs main.ts of the project with the role, as the process of the role, and ends with its code', async () => {
    const { root } = project();
    const { spawn, calls } = fake();
    const { code, data } = await run(root, { spawn }, ['start', 'web', '--json']);
    expect(code).toBe(0);
    expect(calls).toEqual([
      { file: process.execPath, args: [join(root, 'apps/server/src/main.ts'), 'web'], cwd: root, quiet: false },
    ]);
    expect(data).toMatchObject({ role: 'web', exit: 0 });
  });

  it('5.2 prefers the built output when there is one', async () => {
    const { root } = project({ 'apps/server/dist/main.js': 'export {};\n' });
    const { spawn, calls } = fake();
    await run(root, { spawn }, ['start', 'worker']);
    expect(calls[0]?.args).toEqual([join(root, 'apps/server/dist/main.js'), 'worker']);
  });

  it('5.2 a role that does not exist is a usage error, and a process that fails is exit code 1', async () => {
    const { root } = project();
    const wrong = await run(root, fake().spawn === undefined ? {} : { spawn: fake().spawn }, [
      'start',
      'api',
      '--json',
    ]);
    expect([wrong.code, wrong.error.code]).toEqual([2, 'BK_USAGE_UNKNOWN_ROLE']);
    expect((await run(root, { spawn: fake({ [process.execPath]: 3 }).spawn }, ['start', 'web'])).code).toBe(1);
  });
});

describe('section 5.2 dev', () => {
  it('5.2 writes the generated files, starts the services of compose.yaml, and runs the server in watch mode with the three roles', async () => {
    const { root } = project({ 'compose.yaml': 'services: {}\n' });
    const { spawn, calls } = fake();
    const { code } = await run(root, { spawn, watch: () => () => undefined }, ['dev']);
    expect(code).toBe(0);
    expect(existsSync(join(root, 'packages/client/src/index.ts'))).toBe(true);
    expect(
      calls.map((call) => `${call.file === process.execPath ? 'node' : call.file} ${call.args.join(' ')}`),
    ).toEqual(['docker compose up -d', `node --watch ${join(root, 'apps/server/src/main.ts')} dev`]);
    expect(calls[0]?.quiet).toBe(true);
  });

  it('5.2 --no-services starts no service, and services that do not start are a message and not a failure', async () => {
    const { root } = project({ 'compose.yaml': 'services: {}\n' });
    const none = fake();
    await run(root, { spawn: none.spawn, watch: () => () => undefined }, ['dev', '--no-services']);
    expect(none.calls.map((call) => call.file)).toEqual([process.execPath]);
    const broken = fake({ docker: 1 });
    const { code, err } = await run(root, { spawn: broken.spawn, watch: () => () => undefined }, ['dev']);
    expect(code).toBe(0);
    expect(err).toContain('did not start');
  });

  it('GEN-02 regenerates the files a moment after the code changes, and stops watching when the server ends', async () => {
    const { root } = project();
    let change: (() => void) | undefined;
    let stopped = false;
    let end: (() => void) | undefined;
    const spawn: Spawn = (file) => ({
      exit: file === process.execPath ? new Promise<number>((resolve) => (end = () => resolve(0))) : Promise.resolve(0),
      kill: () => undefined,
    });
    const finished = run(
      root,
      { spawn, watch: (_folder, onChange) => ((change = onChange), () => void (stopped = true)) },
      ['dev'],
    );
    await new Promise((resolve) => setTimeout(resolve, 400));
    writeFileSync(join(root, 'packages/client/src/index.ts'), 'edited\n');
    change?.();
    await new Promise((resolve) => setTimeout(resolve, 900));
    expect(existsSync(join(root, 'packages/client/src/index.ts'))).toBe(true);
    expect(readFileSync(join(root, 'packages/client/src/index.ts'), 'utf8')).toContain('createClient');
    end?.();
    await finished;
    expect(stopped).toBe(true);
  });
});

describe('section 5.2 test', () => {
  it('5.2 writes the preset and runs vitest with it, with the filter and the flags', async () => {
    const { root } = project();
    const { spawn, calls } = fake();
    const { code } = await run(root, { spawn }, ['test', 'orders', '--coverage']);
    expect(code).toBe(0);
    expect(existsSync(join(root, '.bieberkit/vitest.config.ts'))).toBe(true);
    expect(calls).toEqual([
      {
        file: 'pnpm',
        args: ['exec', 'vitest', 'run', '--config', '.bieberkit/vitest.config.ts', '--coverage', 'orders'],
        cwd: root,
        quiet: false,
      },
    ]);
    expect((await run(root, { spawn: fake({ pnpm: 1 }).spawn }, ['test', '--watch'])).code).toBe(1);
  });

  it('TST-03 the preset installs the guard on the network and provides the urls of the test databases', async () => {
    const { root } = project();
    await run(root, { spawn: fake().spawn }, ['test']);
    const config = readFileSync(join(root, '.bieberkit/vitest.config.ts'), 'utf8');
    expect(config).toContain('DATABASE_URL_POSTGRES');
    expect(config).toContain('@generated');
    expect(readFileSync(join(root, '.bieberkit/vitest.setup.ts'), 'utf8')).toContain('installNetworkGuard');
  });
});

const env = (root: string): Record<string, string> => ({
  APP_ENV: 'development',
  APP_KEY: 'k'.repeat(44),
  AUTH_SECRET: 's'.repeat(40),
  DB_CONNECTION: 'sqlite',
  DATABASE_URL: join(root, 'test.db'),
  MAIL_DRIVER: 'log',
});

describe('section 5.2 db:seed and doctor through the CLI', () => {
  it('5.2 db:seed says that there is nothing to seed in a project with no seeders', async () => {
    const { root } = project();
    const { code, out } = await run(root, {}, ['db:seed'], env(root));
    expect([code, out.trim()]).toEqual([0, 'There is nothing to seed.']);
  });

  it('5.2 doctor prints each check, and an error is BK_DOCTOR_FAILED with the fix of each, exit code 1', async () => {
    const { root } = project();
    const good = await run(root, {}, ['doctor'], env(root));
    expect(good.code).toBe(0);
    expect(good.out).toMatch(/ok\s+database: /);
    const bad = await run(root, {}, ['doctor', '--json'], {
      ...env(root),
      DB_CONNECTION: 'postgres',
      DATABASE_URL: 'postgres://nobody:x@127.0.0.1:1/none',
    });
    expect([bad.code, bad.error.code]).toEqual([1, 'BK_DOCTOR_FAILED']);
    expect(bad.error.fix).toContain('DATABASE_URL');
  });
});

async function freePort(): Promise<number> {
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

describe('section 6 a project that was made starts', () => {
  it('6 create makes it, main.ts boots the web role against its own database, and SIGTERM stops it with 0', async () => {
    const cwd = mkdtempSync(join(tmpdir(), 'bk-run-'));
    folders.push(cwd);
    const made = await runCli(
      ['create', 'demo', '--yes', '--no-install', '--no-git', '--author', 'A B <a@b.co>', '--json'],
      { stdout: () => undefined, stderr: () => undefined, cwd },
    );
    expect(made).toBe(0);
    const root = join(cwd, 'demo');
    const packages = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
    mkdirSync(join(root, 'node_modules/@bieberkit'), { recursive: true });
    for (const name of ['core', 'data', 'http', 'queue', 'server', 'auth', 'log', 'cache', 'mail', 'storage'])
      symlinkSync(join(packages, name), join(root, 'node_modules/@bieberkit', name), 'dir');
    symlinkSync(join(packages, 'data', 'node_modules', 'zod'), join(root, 'node_modules/zod'), 'dir');
    linkBasePlugins(root);
    const port = await freePort();
    const metrics = await freePort();
    const child = nodeSpawn(process.execPath, [join(root, 'apps/server/src/main.ts'), 'web'], {
      cwd: root,
      env: {
        APP_PORT: String(port),
        METRICS_PORT: String(metrics),
        LOG_LEVEL: 'fatal',
      },
      stdio: ['ignore', 'ignore', 'pipe'],
    });
    let stderr = '';
    child.stderr.on('data', (chunk: Buffer) => (stderr += chunk.toString()));
    const exit = new Promise<number | null>((resolve) => child.once('exit', resolve));
    try {
      let ready = false;
      for (let waited = 0; !ready && waited < 20_000; waited += 100) {
        try {
          ready = (await fetch(`http://127.0.0.1:${String(port)}/health/ready`)).status === 200;
        } catch {
          await new Promise((resolve) => setTimeout(resolve, 100));
        }
      }
      if (!ready) throw new Error(`The server did not become ready: ${stderr}`);
      expect((await fetch(`http://127.0.0.1:${String(metrics)}/metrics`)).status).toBe(200);
      child.kill('SIGTERM');
      expect(await exit).toBe(0);
    } finally {
      child.kill('SIGKILL');
    }
  }, 40_000);
});
