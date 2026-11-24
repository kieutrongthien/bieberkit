/**
 * BieberKit
 *
 * @file        packages/cli/src/backup.test.ts
 * @description Tests of bieberkit backup:verify: it decrypts the newest dump, restores it into a throwaway database, checks that nothing is left to migrate, and removes what it started, whatever happens (DEP-09).
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

import { createCipheriv, pbkdf2Sync, randomBytes } from 'node:crypto';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { afterEach, describe, expect, it } from 'vitest';
import { createRunner } from 'create-bieberkit/kit';
import { backupVerifyCommand } from './commands/backup.ts';
import type { BackupDeps } from './commands/backup.ts';
import type { Exec } from './processes.ts';
import { CRM_MODULE, makeProject } from './testing/project.ts';
import type { Fixture } from './testing/project.ts';

const fixtures: Fixture[] = [];
const folders: string[] = [];
afterEach(() => {
  for (const fixture of fixtures.splice(0)) fixture.cleanup();
  for (const folder of folders.splice(0)) rmSync(folder, { recursive: true, force: true });
});

const PASSPHRASE = 'correct horse battery staple';

/** The format that `openssl enc -aes-256-cbc -pbkdf2 -iter 600000 -salt` writes, which is what the backup scripts write. */
function encrypt(bytes: Uint8Array, passphrase = PASSPHRASE): Buffer {
  const salt = randomBytes(8);
  const material = pbkdf2Sync(passphrase, salt, 600_000, 48, 'sha256');
  const cipher = createCipheriv('aes-256-cbc', material.subarray(0, 32), material.subarray(32));
  return Buffer.concat([Buffer.from('Salted__'), salt, cipher.update(bytes), cipher.final()]);
}

function world(dialect: 'sqlite' | 'postgres' = 'sqlite') {
  const fixture = makeProject({ dialect, files: { 'apps/server/src/modules/crm/module.ts': CRM_MODULE } });
  fixtures.push(fixture);
  const backups = mkdtempSync(join(tmpdir(), 'bk-dumps-'));
  folders.push(backups);
  writeFileSync(join(fixture.root, 'passphrase'), PASSPHRASE);
  return { root: fixture.root, backups };
}

async function run(root: string, deps: BackupDeps, argv: string[]) {
  const runner = createRunner({ name: 'bieberkit', version: '0.0.0', commands: [backupVerifyCommand(deps)] });
  const out: string[] = [];
  const err: string[] = [];
  const code = await runner(argv, {
    stdout: (t) => out.push(t),
    stderr: (t) => err.push(t),
    cwd: root,
    env: { LOG_LEVEL: 'fatal' },
  });
  const parsed: unknown = argv.includes('--json') ? JSON.parse(out[0] ?? '{}') : {};
  return {
    code,
    out: out.join(''),
    err: err.join(''),
    data: Object(Reflect.get(Object(parsed), 'data')),
    error: Object(Reflect.get(Object(parsed), 'error')),
  };
}

describe('DEP-09 backup:verify on SQLite, with no container', () => {
  it('restores the newest dump of a database that has been migrated, and says that nothing is left to migrate', async () => {
    const { root, backups } = world();
    const { runMigrations, makeMigration } = await import('@bieberkit/server');
    const live = join(root, 'live.db');
    const env = { DB_CONNECTION: 'sqlite', DATABASE_URL: live, LOG_LEVEL: 'fatal' };
    await makeMigration({ cwd: root, env });
    await runMigrations({ cwd: root, env });
    const { readFileSync } = await import('node:fs');
    // An older dump that must not be the one that is checked, and the newest one.
    writeFileSync(join(backups, 'sqlite-2026-01-01.dump.enc'), encrypt(Buffer.from('not a database')));
    writeFileSync(join(backups, 'sqlite-2026-01-02.dump.enc'), encrypt(readFileSync(live)));
    const { code, data } = await run(root, {}, [
      'backup:verify',
      '--dir',
      backups,
      '--passphrase-file',
      join(root, 'passphrase'),
      '--json',
    ]);
    expect(code).toBe(0);
    expect(data).toMatchObject({
      file: 'sqlite-2026-01-02.dump.enc',
      dialect: 'sqlite',
      pending: [],
      stepsPending: [],
    });
  });

  it('refuses a wrong passphrase with its own code, and a dump that is not a database', async () => {
    const { root, backups } = world();
    writeFileSync(join(backups, 'sqlite-2026-01-02.dump.enc'), encrypt(Buffer.from('x'), 'another passphrase'));
    const wrong = await run(root, {}, [
      'backup:verify',
      '--dir',
      backups,
      '--passphrase-file',
      join(root, 'passphrase'),
      '--json',
    ]);
    expect([wrong.code, wrong.error['code']]).toEqual([1, 'BK_BACKUP_DECRYPT']);
    writeFileSync(join(backups, 'sqlite-2026-01-03.dump.enc'), encrypt(Buffer.from('not a database')));
    const broken = await run(root, {}, [
      'backup:verify',
      '--dir',
      backups,
      '--passphrase-file',
      join(root, 'passphrase'),
      '--json',
    ]);
    expect(broken.error['code']).toBe('BK_BACKUP_RESTORE');
  });

  it('says so when the folder has no dump, and when the passphrase is not given and nobody can be asked', async () => {
    const { root, backups } = world();
    const none = await run(root, {}, [
      'backup:verify',
      '--dir',
      backups,
      '--passphrase-file',
      join(root, 'passphrase'),
      '--json',
    ]);
    expect(none.error['code']).toBe('BK_BACKUP_NONE');
    writeFileSync(join(backups, 'sqlite-2026-01-02.dump.enc'), encrypt(Buffer.from('x')));
    const asked = await run(root, {}, ['backup:verify', '--dir', backups, '--json']);
    expect([asked.code, asked.error['code']]).toEqual([2, 'BK_USAGE_PASSPHRASE']);
  });

  it('is not fooled by a database whose migrations ran only in part: what is pending is named and the command fails', async () => {
    const { root, backups } = world();
    const live = join(root, 'half.db');
    const database = new DatabaseSync(live);
    database.exec('create table t (a integer)');
    database.close();
    const { readFileSync } = await import('node:fs');
    writeFileSync(join(backups, 'sqlite-2026-01-02.dump.enc'), encrypt(readFileSync(live)));
    mkdirSync(join(root, 'migrations'), { recursive: true });
    const result = await run(root, {}, [
      'backup:verify',
      '--dir',
      backups,
      '--passphrase-file',
      join(root, 'passphrase'),
      '--json',
    ]);
    expect([result.code, result.error['code']]).toEqual([1, 'BK_BACKUP_PENDING']);
  });
});

function docker(options: { failOn?: string } = {}): { exec: Exec; calls: string[][] } {
  const calls: string[][] = [];
  const exec: Exec = async (file, args) => {
    calls.push([file, ...args]);
    if (options.failOn !== undefined && args.includes(options.failOn)) return { code: 1, stdout: '', stderr: 'boom' };
    if (args[0] === 'port') return { code: 0, stdout: '127.0.0.1:55432\n', stderr: '' };
    if (args[0] === 'run') return { code: 0, stdout: 'container-id\n', stderr: '' };
    return { code: 0, stdout: '', stderr: '' };
  };
  return { exec, calls };
}

describe('DEP-09 backup:verify on PostgreSQL, over a throwaway container', () => {
  it('starts a container that is thrown away, restores into it, and always removes it, even when the restore fails', async () => {
    const { root, backups } = world('postgres');
    writeFileSync(join(backups, 'postgres-2026-01-02.dump.enc'), encrypt(Buffer.from('dump')));
    const fake = docker({ failOn: 'pg_restore' });
    const result = await run(root, { exec: fake.exec, wait: async () => undefined }, [
      'backup:verify',
      '--dir',
      backups,
      '--passphrase-file',
      join(root, 'passphrase'),
      '--json',
    ]);
    expect(result.error['code']).toBe('BK_BACKUP_RESTORE');
    const verbs = fake.calls.map((call) => call.slice(0, 2).join(' '));
    expect(verbs[0]).toBe('docker run');
    expect(verbs.at(-1)).toBe('docker rm');
    expect(fake.calls[0]).toContain('postgres:15');
    expect(fake.calls[0]?.join(' ')).toContain('127.0.0.1::5432');
  });
});
