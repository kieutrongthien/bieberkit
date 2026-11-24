/**
 * BieberKit
 *
 * @file        packages/cli/src/commands/backup.ts
 * @description The command bieberkit backup:verify: it decrypts the newest dump, restores it into a throwaway database, checks that no migration and no step is left to run, and removes what it started (DEP-09).
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

import { createDecipheriv, pbkdf2Sync } from 'node:crypto';
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { migrationStatus } from '@bieberkit/server';
import type { Dialect } from '@bieberkit/core';
import type { Command } from '../command.ts';
import { CliError, usageError } from '../errors.ts';
import { realExec } from '../processes.ts';
import type { Exec } from '../processes.ts';
import { loadConfig } from '../project.ts';

export interface BackupDeps {
  readonly exec?: Exec;
  /** Waits for a container to answer. A test gives one that does not wait. */
  readonly wait?: (ms: number) => Promise<void>;
}

const SUFFIX = '.dump.enc';
const PASSWORD = 'verify';
const DATABASE = 'verify';

/** Reads what `openssl enc -aes-256-cbc -pbkdf2 -iter 600000 -salt` wrote, which is what the backup scripts write. */
function decrypt(file: Buffer, passphrase: string): Buffer {
  const magic = file.subarray(0, 8).toString('latin1');
  if (magic !== 'Salted__') {
    throw new CliError('The file is not an encrypted dump of this framework.', {
      code: 'BK_BACKUP_DECRYPT',
      fix: 'Pick a file that backup.sh or backup.mjs wrote (*.dump.enc).',
    });
  }
  const material = pbkdf2Sync(passphrase, file.subarray(8, 16), 600_000, 48, 'sha256');
  try {
    const cipher = createDecipheriv('aes-256-cbc', material.subarray(0, 32), material.subarray(32));
    return Buffer.concat([cipher.update(file.subarray(16)), cipher.final()]);
  } catch (error) {
    throw new CliError('The dump could not be decrypted: the passphrase is not the one that made it.', {
      code: 'BK_BACKUP_DECRYPT',
      fix: 'Use the BACKUP_PASSPHRASE of .env.production at the time of the dump.',
      cause: error,
    });
  }
}

const restoreFailed = (what: string, cause?: unknown): CliError =>
  new CliError(`The dump could not be restored: ${what}`, {
    code: 'BK_BACKUP_RESTORE',
    fix: 'Take another dump, and check the logs of the backup service. A dump that does not restore is no backup.',
    ...(cause === undefined ? {} : { cause }),
  });

async function sqliteCopy(plain: Buffer, directory: string): Promise<string> {
  const path = join(directory, 'restored.db');
  writeFileSync(path, plain);
  try {
    const database = new DatabaseSync(path, { readOnly: true });
    const row = database.prepare('pragma integrity_check').get();
    database.close();
    if (Object(row)['integrity_check'] !== 'ok') throw restoreFailed('the integrity check of the copy failed.');
  } catch (error) {
    if (error instanceof CliError) throw error;
    throw restoreFailed('the file is not a SQLite database.', error);
  }
  return path;
}

interface Throwaway {
  readonly url: string;
  stop(): Promise<void>;
}

/** A database in a container that is removed when `stop` runs, with the dump restored into it. */
async function container(
  dialect: 'postgres' | 'mysql',
  plain: Buffer,
  directory: string,
  exec: Exec,
  wait: (ms: number) => Promise<void>,
): Promise<Throwaway> {
  const image = dialect === 'postgres' ? 'postgres:15' : 'mysql:8.4';
  const inner = dialect === 'postgres' ? '5432' : '3306';
  const env =
    dialect === 'postgres'
      ? ['-e', `POSTGRES_PASSWORD=${PASSWORD}`, '-e', `POSTGRES_DB=${DATABASE}`]
      : ['-e', `MYSQL_ROOT_PASSWORD=${PASSWORD}`, '-e', `MYSQL_DATABASE=${DATABASE}`];
  const started = await exec('docker', ['run', '-d', '--rm', '-p', `127.0.0.1::${inner}`, ...env, image]);
  if (started.code !== 0) {
    throw new CliError(`Docker could not start ${image}: ${started.stderr.trim()}`, {
      code: 'BK_BACKUP_DOCKER',
      fix: 'Start Docker, and check that the image can be pulled. backup:verify needs it for a server database.',
    });
  }
  const id = started.stdout.trim();
  const stop = async (): Promise<void> => {
    await exec('docker', ['rm', '-f', id]);
  };
  try {
    const port = /:(\d+)\s*$/m.exec((await exec('docker', ['port', id, `${inner}/tcp`])).stdout)?.[1];
    if (port === undefined) throw restoreFailed('the container published no port.');
    const ping =
      dialect === 'postgres'
        ? ['pg_isready', '-U', 'postgres', '-d', DATABASE]
        : ['mysqladmin', 'ping', '-h', '127.0.0.1', `-p${PASSWORD}`];
    let ready = false;
    for (let attempt = 0; attempt < 90 && !ready; attempt += 1) {
      ready = (await exec('docker', ['exec', id, ...ping])).code === 0;
      if (!ready) await wait(1000);
    }
    if (!ready) throw restoreFailed('the throwaway database did not answer in time.');
    const file = join(directory, 'dump');
    writeFileSync(file, plain);
    await exec('docker', ['cp', file, `${id}:/tmp/dump`]);
    const restore =
      dialect === 'postgres'
        ? ['pg_restore', '--no-owner', '--no-privileges', '-U', 'postgres', '-d', DATABASE, '/tmp/dump']
        : ['sh', '-c', `mysql -uroot -p${PASSWORD} ${DATABASE} < /tmp/dump`];
    const restored = await exec('docker', ['exec', id, ...restore]);
    if (restored.code !== 0) throw restoreFailed(restored.stderr.trim() || 'the restore command failed.');
    const url =
      dialect === 'postgres'
        ? `postgres://postgres:${PASSWORD}@127.0.0.1:${port}/${DATABASE}`
        : `mysql://root:${PASSWORD}@127.0.0.1:${port}/${DATABASE}`;
    return { url, stop };
  } catch (error) {
    await stop();
    throw error;
  }
}

export function backupVerifyCommand(deps: BackupDeps = {}): Command {
  const exec = deps.exec ?? realExec;
  const wait = deps.wait ?? ((ms: number) => new Promise<void>((done) => setTimeout(done, ms)));
  return {
    name: 'backup:verify',
    summary: 'Restore the newest backup into a throwaway database and check that nothing is left to migrate.',
    flags: [
      { name: 'dir', type: 'string', description: 'The folder of the dumps (*.dump.enc). Defaults to ./backups.' },
      {
        name: 'passphrase-file',
        type: 'string',
        description: 'A file that holds the BACKUP_PASSPHRASE. Without it the passphrase is asked.',
      },
    ],
    async run(context) {
      const { root, config } = await loadConfig(context.cwd);
      const dialect: Dialect = config.database.dialect;
      const directory = resolve(context.cwd, String(context.args.flags['dir'] ?? 'backups'));
      let files: string[] = [];
      try {
        files = readdirSync(directory)
          .filter((name) => name.endsWith(SUFFIX))
          .toSorted()
          .toReversed();
      } catch {
        files = [];
      }
      const newest = files[0];
      if (newest === undefined) {
        throw new CliError(`There is no dump (*${SUFFIX}) in ${directory}.`, {
          code: 'BK_BACKUP_NONE',
          fix: 'Copy the dumps of the backup volume or of the bucket there, or pass --dir.',
        });
      }
      const passphraseFile = context.args.flags['passphrase-file'];
      const passphrase =
        typeof passphraseFile === 'string'
          ? readFileSync(resolve(context.cwd, passphraseFile), 'utf8').trim()
          : await context.ask?.('Passphrase of the backup');
      if (passphrase === undefined || passphrase === '') {
        throw usageError(
          'BK_USAGE_PASSPHRASE',
          'The passphrase of the backup is needed.',
          'Pass --passphrase-file <file>, or run it where a person can type it.',
        );
      }
      const plain = decrypt(readFileSync(join(directory, newest)), passphrase);
      mkdirSync(tmpdir(), { recursive: true });
      const scratch = mkdtempSync(join(tmpdir(), 'bk-verify-'));
      let throwaway: Throwaway | undefined;
      try {
        let url: string;
        if (dialect === 'sqlite') {
          url = await sqliteCopy(plain, scratch);
        } else {
          throwaway = await container(dialect, plain, scratch, exec, wait);
          ({ url } = throwaway);
        }
        context.log(`restored ${newest}, looking for what is left to run`);
        const status = await migrationStatus({
          cwd: root,
          env: { ...context.env, DB_CONNECTION: dialect, DATABASE_URL: url, MIGRATE_DATABASE_URL: url },
        });
        if (status.pending.length > 0 || status.steps.pending.length > 0) {
          throw new CliError(
            `The restored database is not up to date: ${[...status.pending, ...status.steps.pending].join(', ')} would run.`,
            {
              code: 'BK_BACKUP_PENDING',
              fix: 'The dump is older than the code, or the database was never migrated. Run bieberkit migrate on a copy before you rely on it.',
            },
          );
        }
        return {
          data: {
            file: newest,
            dialect,
            pending: status.pending,
            stepsPending: status.steps.pending,
            executed: status.executed.length,
          },
          text: `${newest} restores, and ${String(status.executed.length)} migrations and ${String(status.steps.applied.length)} steps are in place. Nothing is left to run.`,
        };
      } finally {
        rmSync(scratch, { recursive: true, force: true });
        await throwaway?.stop();
      }
    },
  };
}
