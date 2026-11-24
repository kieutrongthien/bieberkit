/**
 * BieberKit
 *
 * @file        packages/create/src/deploy.test.ts
 * @description Tests of the deployment files of a new project: the image, the roles and the limits of the compose file, the proxy, and the retention of the backup, which runs for real (spec section 19, DEP-01 to DEP-07, PERF-03).
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

import { execFileSync } from 'node:child_process';
import { createDecipheriv, pbkdf2Sync } from 'node:crypto';
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { afterEach, describe, expect, it } from 'vitest';
import type { Dialect } from '@bieberkit/core';
import {
  HEAP_MB,
  MEMORY_MB,
  renderBackupScript,
  renderCaddyfile,
  renderComposeProduction,
  renderDockerfile,
  renderDockerignore,
  renderProductionEnv,
  renderSqliteBackupScript,
  renderUploadScript,
} from './scaffold/deploy.ts';

const head = (path: string): string => `# ${path}\n\n`;
const blockHead = (path: string): string => `/** ${path} */\n\n`;
const folders: string[] = [];
afterEach(() => {
  for (const folder of folders.splice(0)) rmSync(folder, { recursive: true, force: true });
});

describe('DEP-01 the image', () => {
  const dockerfile = renderDockerfile('shop', head);

  it('DEP-04 pins every base image by digest', () => {
    const from = dockerfile.split('\n').filter((line) => line.startsWith('FROM '));
    expect(from).toHaveLength(2);
    for (const line of from) expect(line).toMatch(/@sha256:[0-9a-f]{64}/);
  });

  it('DEP-01 fetches the lockfile before the source, and DEP-02 deploys the server without development dependencies', () => {
    expect(dockerfile.indexOf('pnpm fetch')).toBeLessThan(dockerfile.indexOf('COPY . .'));
    expect(dockerfile).toContain('pnpm deploy --filter=shop-server --prod /out/apps/server');
  });

  it('DEP-03 runs node and not a package manager, as a user that is not root, and the role is the command (DEP-05)', () => {
    expect(dockerfile).toContain('ENTRYPOINT ["node", "apps/server/src/main.ts"]');
    expect(dockerfile).toContain('USER node');
    expect(dockerfile.split('USER node')[0]).not.toMatch(/ENTRYPOINT/);
    expect(dockerfile).toContain('CMD ["web"]');
    expect(dockerfile).not.toMatch(/ENTRYPOINT \[.*pnpm|npm start/);
  });

  it('keeps the environment, the data and git out of the image', () => {
    const ignore = renderDockerignore(head);
    for (const line of ['.env', 'node_modules', 'data', '.git', 'storage']) expect(ignore.split('\n')).toContain(line);
    expect(ignore.split('\n')).toContain('!.env.production.example');
  });
});

describe.each(['postgres', 'mysql', 'sqlite'] as const)(
  'spec 19.2 the production compose file on %s',
  (dialect: Dialect) => {
    const compose = renderComposeProduction(dialect, 'shop', head);

    it('DEP-05 has a service for each role with the role as its command, and the migrate job does not restart', () => {
      for (const role of ['migrate', 'web', 'worker', 'scheduler'])
        expect(compose).toContain(`  ${role}:\n    <<: *app\n    command: ['${role}']`);
      expect(compose).toMatch(/migrate:\n {4}<<: \*app\n {4}command: \['migrate'\]\n {4}restart: 'no'/);
    });

    it('19.5 starts web, worker and scheduler only after migrate ended well, and stops the old scheduler first', () => {
      expect(compose.match(/migrate: \{ condition: service_completed_successfully \}/g)).toHaveLength(3);
      // Compose replaces a container by stopping it first, and `deploy.update_config` is Swarm only, so the file says nothing of it.
      expect(compose).not.toContain('update_config');
      expect(compose).toContain('compose stops the old container before it starts the new one');
    });

    it('PERF-03 gives Node 75 percent of the memory of the container', () => {
      expect(HEAP_MB).toBe(Math.floor(MEMORY_MB * 0.75));
      expect(compose).toContain(`--max-old-space-size=\${APP_HEAP_MB:-${String(HEAP_MB)}}`);
      expect(compose).toContain(`mem_limit: \${APP_MEMORY:-${String(MEMORY_MB)}m}`);
    });

    it('19.4 gives a container longer to stop than the drain and the shutdown together', () => {
      const grace = Number(/stop_grace_period: (\d+)s/.exec(compose)?.[1]);
      expect(grace).toBeGreaterThan(5 + 20);
    });

    it('SEC-18 runs the roles with a read only filesystem, no capability, and no new privilege', () => {
      expect(compose).toContain('read_only: true');
      expect(compose).toContain('cap_drop: [ALL]');
      expect(compose).toContain('no-new-privileges:true');
    });

    it('Q-08 keeps the queue Valkey from evicting, and lets the cache one evict', () => {
      expect(compose).toContain("'--appendonly', 'yes', '--maxmemory-policy', 'noeviction'");
      expect(compose).toContain("'--maxmemory-policy', 'allkeys-lru'");
    });

    it('DEP-07 has a backup that writes to a volume and an upload that reads it and cannot write to it', () => {
      expect(compose).toContain('  backup:');
      expect(compose).toContain('  backup-upload:');
      expect(compose).toContain('- backups:/backups:ro');
    });

    it('has a database service only for a server database, and no port of the database is published', () => {
      expect(compose.includes('  db:')).toBe(dialect !== 'sqlite');
      expect(compose).not.toMatch(/ports: \['(5432|3306|6379)/);
    });
  },
);

describe('OBS-04 the proxy', () => {
  it('sends everything to the web role and has no route for the metrics port', () => {
    const caddy = renderCaddyfile(head);
    expect(caddy).toContain('reverse_proxy web:3000');
    expect(caddy).not.toContain('9464');
    expect(caddy).not.toContain('metrics');
  });
});

describe('the production environment', () => {
  it('says what is to be chosen, uses the Valkeys of the compose file, and the heap that the compose file reads', () => {
    const env = renderProductionEnv('postgres', 'shop', head);
    expect(env).toContain('APP_ENV=production');
    expect(env).toContain('REDIS_URL=redis://valkey:6379');
    expect(env).toContain('QUEUE_DRIVER=redis');
    expect(env).toContain(`APP_HEAP_MB=${String(HEAP_MB)}`);
    expect(env).toContain('MIGRATE_DATABASE_URL=postgres://shop_owner:change-me@db:5432/shop');
  });

  it('CFG-07 asks for a single node on SQLite, which production refuses to guess', () => {
    expect(renderProductionEnv('sqlite', 'shop', head)).toContain('APP_SINGLE_NODE=true');
  });
});

/** Runs the function `prune` of the script on a folder of empty dumps, one for each day, and lists what is left. */
function left(days: number, start = '2026-01-01'): string[] {
  const folder = mkdtempSync(join(tmpdir(), 'bk-backup-'));
  folders.push(folder);
  mkdirSync(folder, { recursive: true });
  for (let index = 0; index < days; index += 1) {
    const day = new Date(Date.parse(`${start}T00:00:00Z`) + index * 86_400_000).toISOString().slice(0, 10);
    writeFileSync(join(folder, `postgres-${day}.dump.enc`), '');
  }
  const script = renderBackupScript('postgres', head);
  const prune = script.slice(script.indexOf('prune() {'), script.indexOf('while true'));
  execFileSync('bash', ['-c', `${prune.replace('cd /backups', `cd ${folder}`)}\nprune`], { stdio: 'pipe' });
  return readdirSync(folder).toSorted();
}

describe('DEP-07 the retention of the backup', () => {
  it('keeps every dump of the last 7 days, and removes the rest that is not a week or a month', () => {
    const kept = left(40);
    // The newest 7 days.
    expect(kept).toEqual(expect.arrayContaining(['postgres-2026-02-09.dump.enc', 'postgres-2026-02-03.dump.enc']));
    // A day that is not one of the 7, not a Sunday and not the first of a month is gone.
    expect(kept).not.toContain('postgres-2026-01-20.dump.enc');
  });

  it('keeps 4 Sundays and the first days of the last months, and never more than the three rules allow', () => {
    const kept = left(215, '2025-01-01');
    const sundays = kept.filter((name) => {
      const day = /-(\d{4}-\d{2}-\d{2})\./.exec(name)?.[1] ?? '';
      return new Date(`${day}T00:00:00Z`).getUTCDay() === 0;
    }, 30_000);
    const firsts = kept.filter((name) => name.includes('-01.dump.enc'));
    expect(sundays.length).toBeGreaterThanOrEqual(4);
    expect(firsts).toHaveLength(6);
    expect(kept.length).toBeLessThanOrEqual(7 + 4 + 6);
  });

  it('leaves a dump that is still being written alone, and an empty folder is not an error', () => {
    expect(left(0)).toEqual([]);
  });

  it('writes a dump under a name that retention never lists, and moves it when it is whole', () => {
    const script = renderBackupScript('mysql', head);
    expect(script).toContain('.partial');
    expect(script).toContain('mv "$target.partial" "$target"');
    expect(script).toContain('openssl enc -aes-256-cbc -pbkdf2');
  });

  it('never keeps the dump of a failed dump: pipefail, and an empty dump is refused', () => {
    for (const dialect of ['postgres', 'mysql'] as const) {
      const script = renderBackupScript(dialect, head);
      expect(script).toContain('set -euo pipefail');
      expect(script).toContain('the dump is empty');
    }
    expect(renderComposeProduction('postgres', 'shop', head)).toContain("entrypoint: ['bash', '/deploy/backup.sh']");
  });

  it('fails for real when the database cannot be reached, and leaves no dump behind', () => {
    const folder = mkdtempSync(join(tmpdir(), 'bk-backup-'));
    folders.push(folder);
    const script = renderBackupScript('postgres', head)
      .replace('/backups', folder)
      .replace(/\n\s*sleep .*\n/, '\n');
    // A command that fails stands in for pg_dump, which is not here: the script must not turn its failure into a file.
    const failing = script.replace(/PGPASSWORD=.* pg_dump [^|]*\|/, 'false |');
    let failed = false;
    try {
      execFileSync('bash', ['-c', failing], {
        stdio: 'pipe',
        env: { PATH: '/usr/local/bin:/usr/bin:/bin', BACKUP_PASSPHRASE: 'x', DB_ADMIN_PASSWORD: 'x', BACKUP_ONCE: '1' },
      });
    } catch {
      failed = true;
    }
    expect(failed).toBe(true);
    expect(readdirSync(folder)).toEqual([]);
  });

  it('encrypts a SQLite copy the way openssl does, so that one command restores any dump', () => {
    const script = renderSqliteBackupScript(blockHead);
    expect(script).toContain("Buffer.from('Salted__')");
    expect(script).toContain("pbkdf2Sync(passphrase, salt, 600000, 48, 'sha256')");
    expect(script).toContain('VACUUM INTO');
  });

  it('runs the SQLite backup for real: a consistent copy, encrypted as openssl does, and the oldest dumps pruned', () => {
    const folder = mkdtempSync(join(tmpdir(), 'bk-sqlite-backup-'));
    folders.push(folder);
    const database = join(folder, 'app.db');
    const sqlite = new DatabaseSync(database);
    sqlite.exec('create table t (a integer); insert into t values (1), (2), (3)');
    sqlite.close();
    const dumps = join(folder, 'dumps');
    mkdirSync(dumps);
    // Ten old dumps: the retention must leave the 7 newest of them, with the one that this run adds.
    for (let day = 3; day <= 12; day += 1)
      writeFileSync(join(dumps, `sqlite-2025-03-${String(day).padStart(2, '0')}.dump.enc`), '');
    const script = renderSqliteBackupScript(blockHead).replaceAll('/backups', dumps);
    writeFileSync(join(folder, 'backup.mjs'), script);
    execFileSync(process.execPath, [join(folder, 'backup.mjs')], {
      stdio: 'pipe',
      env: {
        PATH: '/usr/local/bin:/usr/bin:/bin',
        BACKUP_PASSPHRASE: 'secret',
        DATABASE_URL: database,
        BACKUP_ONCE: '1',
      },
    });
    const names = readdirSync(dumps).filter((name) => name.endsWith('.dump.enc'));
    const fresh = names.find((name) => statSync(join(dumps, name)).size > 0);
    expect(fresh).toBeDefined();
    const bytes = readFileSync(join(dumps, fresh ?? ''));
    expect(bytes.subarray(0, 8).toString('latin1')).toBe('Salted__');
    const material = pbkdf2Sync('secret', bytes.subarray(8, 16), 600_000, 48, 'sha256');
    const decipher = createDecipheriv('aes-256-cbc', material.subarray(0, 32), material.subarray(32));
    const plain = Buffer.concat([decipher.update(bytes.subarray(16)), decipher.final()]);
    const restored = join(folder, 'restored.db');
    writeFileSync(restored, plain);
    const copy = new DatabaseSync(restored, { readOnly: true });
    expect(copy.prepare('select count(*) as n from t').get()).toMatchObject({ n: 3 });
    copy.close();
    expect(names.length).toBeLessThanOrEqual(7 + 4 + 6);
    // The 3rd is a Monday and not the first of a month, so nothing keeps it. The 9th is a Sunday, and it stays.
    expect(names).not.toContain('sqlite-2025-03-03.dump.enc');
    expect(names).toContain('sqlite-2025-03-09.dump.enc');
  });

  it('uploads with rclone sync, and only when an endpoint is set', () => {
    const upload = renderUploadScript(head);
    expect(upload).toContain('rclone sync /backups');
    expect(upload).toContain('BACKUP_S3_ENDPOINT');
  });
});
