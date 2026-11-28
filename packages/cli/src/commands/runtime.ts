/**
 * BieberKit
 *
 * @file        packages/cli/src/commands/runtime.ts
 * @description bieberkit start, dev, db:seed, doctor and test: run the roles, seed the data, check the services and run the tests of the project (section 5.2).
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

import { ADMIN_APP, ADMIN_DEV_PORT } from '../admin-app.ts';
import { existsSync, mkdirSync, watch, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { ROLES } from '@bieberkit/core';
import type { Role } from '@bieberkit/core';
import { diagnose, loadConfig, seed } from '@bieberkit/server';
import type { Command } from '../command.ts';
import { CliError, usageError } from '../errors.ts';
import { generateFiles, writeFiles } from '../generate/files.ts';
import { loadApp } from '../app.ts';
import { realSpawn, supervise } from '../processes.ts';
import type { Child } from '../processes.ts';
import type { Spawn } from '../processes.ts';

const isRole = (value: string): value is Role => ROLES.some((role) => role === value);

/** The entry point to run: the built one when there is one, and otherwise the source, which Node runs with its types stripped. */
function entryOf(root: string): string {
  const built = join(root, 'apps/server/dist/main.js');
  return existsSync(built) ? built : join(root, 'apps/server/src/main.ts');
}

export interface RuntimeDeps {
  readonly spawn?: Spawn;
  /** Calls `onChange` when a file under `folder` changes, and answers a function that stops watching. */
  readonly watch?: (folder: string, onChange: () => void) => () => void;
}

function realWatch(folder: string, onChange: () => void): () => void {
  const watcher = watch(folder, { recursive: true }, () => onChange());
  return () => watcher.close();
}

export function startCommand(deps: RuntimeDeps = {}): Command {
  const spawn = deps.spawn ?? realSpawn;
  return {
    name: 'start',
    summary: 'Start a role from the built output: web, worker, scheduler or migrate.',
    positionals: [{ name: 'role', required: true }],
    async run(context) {
      const role = context.args.positionals[0] ?? '';
      if (!isRole(role)) {
        throw usageError(
          'BK_USAGE_UNKNOWN_ROLE',
          `"${role}" is not a role.`,
          `Start one of ${ROLES.join(', ')}, for example: bieberkit start web`,
        );
      }
      const { root } = await loadConfig(context.cwd);
      const entry = entryOf(root);
      const code = await supervise(spawn(process.execPath, [entry, role], { cwd: root }));
      return { data: { role, entry, exit: code }, text: `${role} ended with ${code}.`, exit: code === 0 ? 0 : 1 };
    },
  };
}

export function devCommand(deps: RuntimeDeps = {}): Command {
  const spawn = deps.spawn ?? realSpawn;
  const watcher = deps.watch ?? realWatch;
  return {
    name: 'dev',
    summary: 'Start the services of compose.yaml, then web, worker and scheduler in one process, in watch mode.',
    flags: [
      {
        name: 'services',
        type: 'boolean',
        description: 'Start the services of compose.yaml (default). --no-services skips them.',
      },
      {
        name: 'admin-port',
        type: 'string',
        description: `Where Vite serves the admin. Defaults to ${ADMIN_DEV_PORT}.`,
      },
    ],
    async run(context) {
      const { root } = await loadConfig(context.cwd);
      const regenerate = async (): Promise<void> => {
        try {
          const app = await loadApp(root);
          writeFiles(root, generateFiles(app));
        } catch (error) {
          context.log(`generate: ${error instanceof Error ? error.message.split('\n')[0] : String(error)}`);
        }
      };
      await regenerate();
      if (context.args.flags['services'] !== false && existsSync(join(root, 'compose.yaml'))) {
        const services = await spawn('docker', ['compose', 'up', '-d'], { cwd: root, quiet: true }).exit;
        if (services !== 0)
          context.log(
            'The services of compose.yaml did not start. The development defaults (sqlite, sync queue, file cache) need none.',
          );
      }
      // Generated files follow the code, a moment after the last change (GEN-02).
      let timer: NodeJS.Timeout | undefined;
      const stopWatching = existsSync(join(root, 'apps/server/src'))
        ? watcher(join(root, 'apps/server/src'), () => {
            clearTimeout(timer);
            timer = setTimeout(() => void regenerate(), 300);
          })
        : () => undefined;
      // The admin is served by Vite from its source. The server is told its address as ADMIN_URL, so that the sign in trusts it,
      // and the links that are mailed lead to it. The file is read by Node.js: a value that the real environment has wins.
      let admin: Child | undefined;
      const options: string[] = [];
      if (existsSync(join(root, ADMIN_APP, 'package.json'))) {
        const port = String(context.args.flags['admin-port'] ?? ADMIN_DEV_PORT);
        const address = `http://localhost:${port}/`;
        const environment = join(root, '.bieberkit', 'dev.env');
        mkdirSync(join(root, '.bieberkit'), { recursive: true });
        writeFileSync(environment, `# Written by bieberkit dev: where Vite serves the admin.\nADMIN_URL=${address}\n`);
        options.push(`--env-file=${environment}`);
        admin = spawn('pnpm', ['exec', 'vite', '--port', port, '--strictPort'], { cwd: join(root, ADMIN_APP) });
        context.log(`The admin is at ${address}`);
      }
      try {
        const code = await supervise(
          spawn(process.execPath, [...options, '--watch', entryOf(root), 'dev'], { cwd: root }),
        );
        return { data: { exit: code }, text: `dev ended with ${code}.`, exit: code === 0 ? 0 : 1 };
      } finally {
        admin?.kill('SIGTERM');
        clearTimeout(timer);
        stopWatching();
      }
    },
  };
}

export const dbSeedCommand: Command = {
  name: 'db:seed',
  summary: 'Run the seeders: the plugins in boot order, then apps/server/src/seed.ts.',
  async run(context) {
    const done = await seed({ cwd: context.cwd, ...(context.env === undefined ? {} : { env: context.env }) });
    return {
      data: done,
      text:
        done.ran.length === 0
          ? 'There is nothing to seed.'
          : `Seeded:\n${done.ran.map((name) => `  ${name}`).join('\n')}`,
    };
  },
};

export const doctorCommand: Command = {
  name: 'doctor',
  summary: 'Check that the database, Valkey, the mail server and the storage answer.',
  async run(context) {
    const findings = await diagnose({ cwd: context.cwd, ...(context.env === undefined ? {} : { env: context.env }) });
    const failed = findings.filter((finding) => finding.level === 'error');
    const mark = { ok: 'ok     ', warning: 'warning', error: 'error  ' } as const;
    const lines = findings.flatMap((finding) => [
      `${mark[finding.level]}  ${finding.id}: ${finding.message}`,
      ...(finding.fix === undefined ? [] : [`         fix: ${finding.fix}`]),
    ]);
    if (failed.length > 0) {
      throw new CliError(
        `${failed.length} check${failed.length === 1 ? '' : 's'} failed:\n${failed.map((finding) => `${finding.id}: ${finding.message}`).join('\n')}`,
        {
          code: 'BK_DOCTOR_FAILED',
          fix: failed.map((finding) => finding.fix ?? 'See the message.').join('\n'),
        },
      );
    }
    return { data: { findings }, text: lines.join('\n') };
  },
};

export function testCommand(deps: RuntimeDeps = {}): Command {
  const spawn = deps.spawn ?? realSpawn;
  return {
    name: 'test',
    summary: 'Run the tests of the project with Vitest and the presets of the framework.',
    positionals: [{ name: 'filter' }],
    flags: [
      { name: 'watch', type: 'boolean', description: 'Run again when a file changes.' },
      { name: 'coverage', type: 'boolean', description: 'Report the coverage of the lines.' },
    ],
    async run(context) {
      const app = await loadApp(context.cwd);
      // The preset is generated with the rest, so that CI never depends on a developer's local state (GEN-02).
      writeFiles(
        app.project.root,
        generateFiles(app).filter((file) => file.path.startsWith('.bieberkit/vitest')),
      );
      const filter = context.args.positionals[0];
      const args = [
        'exec',
        'vitest',
        context.args.flags['watch'] === true ? 'watch' : 'run',
        '--config',
        '.bieberkit/vitest.config.ts',
        ...(context.args.flags['coverage'] === true ? ['--coverage'] : []),
        ...(filter === undefined ? [] : [filter]),
      ];
      const code = await supervise(spawn('pnpm', args, { cwd: app.project.root }));
      return {
        data: { exit: code, args },
        text: code === 0 ? 'The tests passed.' : `The tests failed (${code}).`,
        exit: code === 0 ? 0 : 1,
      };
    },
  };
}
