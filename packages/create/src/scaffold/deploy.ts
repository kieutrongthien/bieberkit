/**
 * BieberKit
 *
 * @file        packages/create/src/scaffold/deploy.ts
 * @description The deployment files of a new project: the image, the production compose file with the roles, the proxy and the backup, and the environment that production needs (spec section 19, DEP-01 to DEP-09, PERF-03).
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

import type { Dialect } from '@bieberkit/core';

/** Writes the header of a file in the style of its kind: the project, the path, what the file is. */
export type Head = (path: string, description: string) => string;

/** The base images, by digest (DEP-04, SEC-18). A digest is changed on purpose, with the version of the tag it came from. */
export const IMAGES = {
  node: 'node:26-slim@sha256:abe7e5a82b61a8ef67b315b85497c9e65173387ccf2f4a029248184b8e020be5',
  caddy: 'caddy:2@sha256:4851e54a46b206517c574821bb5cc67f170d2156041e9fbc4c9193b45e84a75b',
  valkey: 'valkey/valkey:8',
  postgres: 'postgres:15',
  mysql: 'mysql:8.4',
  rclone: 'rclone/rclone:1',
} as const;

const PNPM = '12.21.0';

/** The memory of a container, and 75 percent of it for the heap of Node (PERF-03). */
export const MEMORY_MB = 1024;
export const HEAP_MB = 768;

/** The time that a container gets to stop: the drain (5 s) and the shutdown (20 s) of section 19.4, and a margin. */
export const STOP_GRACE = '40s';

export function renderDockerfile(folder: string, head: Head): string {
  return `${head('Dockerfile', 'The image of the server: one image that runs as web, worker, scheduler or migrate (spec section 19.1).')}# syntax=docker/dockerfile:1
FROM ${IMAGES.node} AS build
ENV PNPM_HOME=/pnpm
ENV PATH=/pnpm:$PATH
RUN npm install --global pnpm@${PNPM}
WORKDIR /app
# The lockfile first, so that the layers of the dependencies stay cached until it changes (DEP-01).
COPY pnpm-lock.yaml pnpm-workspace.yaml ./
RUN --mount=type=cache,id=pnpm,target=/pnpm/store pnpm fetch
COPY . .
RUN --mount=type=cache,id=pnpm,target=/pnpm/store pnpm install --offline --frozen-lockfile
RUN pnpm exec bieberkit build
# A self-contained folder with no development dependencies (DEP-02). The config and the migrations sit beside it, where the server looks.
RUN pnpm deploy --filter=${folder}-server --prod /out/apps/server
RUN mkdir -p /out/migrations && cp bieberkit.config.ts package.json /out/ && cp -r migrations/. /out/migrations/

FROM ${IMAGES.node} AS runtime
ENV NODE_ENV=production
WORKDIR /app
COPY --from=build --chown=node:node /out ./
# Not root, and nothing in the image to write to: the data and the files are volumes.
USER node
EXPOSE 3000
# The process is node, never pnpm or npm, so that SIGTERM reaches the application (DEP-03). The role is the command (DEP-05).
ENTRYPOINT ["node", "apps/server/src/main.ts"]
CMD ["web"]
`;
}

export function renderDockerignore(head: Head): string {
  return `${head('.dockerignore', 'What the image does not need: installed packages, builds, the environment, git and the local data.')}node_modules
**/node_modules
dist
**/dist
coverage
.git
.env
.env.*
!.env.example
!.env.production.example
data
storage
.bieberkit
.turbo
compose.yaml
compose.prod.yaml
`;
}

export function renderCaddyfile(head: Head): string {
  return `${head('deploy/Caddyfile', 'The proxy of the single server setup: TLS, compression, and everything to the web role. The metrics port is never routed (OBS-04). The admin may have a host of its own, which is routed to the same web role.')}# SITE_ADDRESS is the host of the application. ADMIN_ADDRESS is the host of the admin when it has one of its own (ADMIN_URL), and localhost when it has not.
{$SITE_ADDRESS:localhost}, {$ADMIN_ADDRESS:localhost} {
	encode zstd gzip
	reverse_proxy web:3000 {
		health_uri /health/ready
		health_interval 10s
	}
}
`;
}

/** The production environment: what the compose file reads, with a placeholder where a person must choose a value. */
export function renderProductionEnv(dialect: Dialect, folder: string, head: Head): string {
  const name = folder.replaceAll(/[^a-z0-9_]/g, '_');
  const database =
    dialect === 'sqlite'
      ? ['DATABASE_URL=/app/data/app.db', 'MIGRATE_DATABASE_URL=/app/data/app.db', 'APP_SINGLE_NODE=true']
      : dialect === 'postgres'
        ? [
            `DATABASE_URL=postgres://${name}:change-me@db:5432/${name}`,
            `MIGRATE_DATABASE_URL=postgres://${name}_owner:change-me@db:5432/${name}`,
          ]
        : [
            `DATABASE_URL=mysql://${name}:change-me@db:3306/${name}`,
            `MIGRATE_DATABASE_URL=mysql://${name}_owner:change-me@db:3306/${name}`,
          ];
  return `${head('.env.production.example', 'What production reads: copy it to .env.production and give every change-me a value. The file with the values is never committed.')}APP_ENV=production
APP_URL=https://${folder}.example.com
SITE_ADDRESS=${folder}.example.com

# Where the admin is (UI-14). Leave ADMIN_URL out for /admin of APP_URL. A path of the application: APP_URL/panel. A host of its own:
# https://admin.${folder}.example.com, and then ADMIN_ADDRESS is that host, so that the proxy answers for it and gets its certificate.
# ADMIN_URL=https://admin.${folder}.example.com
# ADMIN_ADDRESS=admin.${folder}.example.com

APP_KEY=change-me
AUTH_SECRET=change-me
DB_CONNECTION=${dialect}
${database.join('\n')}
REDIS_URL=redis://valkey:6379
CACHE_REDIS_URL=redis://valkey-cache:6379
QUEUE_DRIVER=redis
CACHE_DRIVER=redis
STORAGE_DISK=local
STORAGE_LOCAL_ROOT=/app/storage
MAIL_DRIVER=log
USERS_ADMIN_EMAIL=admin@${folder}.example.com
USERS_ADMIN_PASSWORD=change-me

# The size of the heap of Node: about 75 percent of the memory of the container (PERF-03). Change both together.
APP_MEMORY=${String(MEMORY_MB)}m
APP_HEAP_MB=${String(HEAP_MB)}

# The backup (DEP-07). The passphrase encrypts each dump, and the bucket is a separate one (S3, R2 or MinIO).
BACKUP_PASSPHRASE=change-me
BACKUP_BUCKET=${folder}-backups
BACKUP_S3_ENDPOINT=
BACKUP_S3_ACCESS_KEY_ID=
BACKUP_S3_SECRET_ACCESS_KEY=
`;
}

function service(role: string, command: string, extra = ''): string {
  return `  ${role}:
    <<: *app
    command: ['${command}']
${extra}`;
}

function databaseService(dialect: Dialect, folder: string): string {
  const name = folder.replaceAll(/[^a-z0-9_]/g, '_');
  if (dialect === 'postgres') {
    return `  db:
    image: ${IMAGES.postgres}
    restart: unless-stopped
    environment:
      POSTGRES_USER: \${DB_ADMIN_USER:-${name}_owner}
      POSTGRES_PASSWORD: \${DB_ADMIN_PASSWORD:?Set DB_ADMIN_PASSWORD, the password of the role that owns the schema}
      POSTGRES_DB: ${name}
    volumes:
      - db-data:/var/lib/postgresql/data
    healthcheck:
      test: ['CMD-SHELL', 'pg_isready -U \${DB_ADMIN_USER:-${name}_owner}']
      interval: 5s
      retries: 20
`;
  }
  return `  db:
    image: ${IMAGES.mysql}
    restart: unless-stopped
    environment:
      MYSQL_DATABASE: ${name}
      MYSQL_ROOT_PASSWORD: \${DB_ADMIN_PASSWORD:?Set DB_ADMIN_PASSWORD, the password of the role that owns the schema}
    volumes:
      - db-data:/var/lib/mysql
    healthcheck:
      test: ['CMD', 'mysqladmin', 'ping', '-h', 'localhost']
      interval: 5s
      retries: 20
`;
}

function backupServices(dialect: Dialect, name: string): string {
  const dump =
    dialect === 'sqlite'
      ? `  backup:
    image: ${IMAGES.node}
    restart: unless-stopped
    user: node
    command: ['node', '/deploy/backup.mjs']
    env_file: [.env.production]
    volumes:
      - data:/app/data
      - backups:/backups
      - ./deploy:/deploy:ro
    tmpfs: [/tmp]
    read_only: true
    cap_drop: [ALL]
    security_opt: ['no-new-privileges:true']
`
      : `  backup:
    image: ${dialect === 'postgres' ? IMAGES.postgres : IMAGES.mysql}
    restart: unless-stopped
    entrypoint: ['bash', '/deploy/backup.sh']
    env_file: [.env.production]
    environment:
      DB_DIALECT: ${dialect}
      DB_HOST: db
      DB_NAME: ${name}
      DB_ADMIN_USER: \${DB_ADMIN_USER:-}
      DB_ADMIN_PASSWORD: \${DB_ADMIN_PASSWORD}
    depends_on:
      db: { condition: service_healthy }
    volumes:
      - backups:/backups
      - ./deploy:/deploy:ro
`;
  return `${dump}  backup-upload:
    image: ${IMAGES.rclone}
    restart: unless-stopped
    # Copies the encrypted dumps to a bucket of their own, once a day. Without BACKUP_S3_ENDPOINT it waits and does nothing.
    entrypoint: ['sh', '/deploy/upload.sh']
    env_file: [.env.production]
    volumes:
      - backups:/backups:ro
      - ./deploy:/deploy:ro
`;
}

export function renderComposeProduction(dialect: Dialect, folder: string, head: Head): string {
  const sqlite = dialect === 'sqlite';
  const waitForDatabase = sqlite ? '' : '    db: { condition: service_healthy }\n';
  const state = sqlite ? '      - data:/app/data\n' : '';
  return `${head('compose.prod.yaml', 'Single server production: the proxy, the roles of the server, the database, the two Valkeys and the backup (spec section 19.2).')}# Start with: docker compose -f compose.prod.yaml up -d --build
# The order of a rollout (section 19.5): the migrate role runs once and ends, then web and worker, and the scheduler is stopped before it is started.
x-app: &app
  image: \${APP_IMAGE:-${folder}-server:latest}
  build: .
  env_file: [.env.production]
  environment:
    # About 75 percent of the memory of the container (PERF-03).
    NODE_OPTIONS: --max-old-space-size=\${APP_HEAP_MB:-${String(HEAP_MB)}}
  mem_limit: \${APP_MEMORY:-${String(MEMORY_MB)}m}
  restart: unless-stopped
  # Longer than the drain (5 s) and the shutdown (20 s) of section 19.4.
  stop_grace_period: ${STOP_GRACE}
  read_only: true
  tmpfs: [/tmp]
  cap_drop: [ALL]
  security_opt: ['no-new-privileges:true']
  volumes:
    - storage:/app/storage
${state}  depends_on:
${waitForDatabase}    valkey: { condition: service_started }
    valkey-cache: { condition: service_started }

services:
  proxy:
    image: ${IMAGES.caddy}
    restart: unless-stopped
    ports: ['80:80', '443:443']
    environment:
      SITE_ADDRESS: \${SITE_ADDRESS:-localhost}
      ADMIN_ADDRESS: \${ADMIN_ADDRESS:-localhost}
    volumes:
      - ./deploy/Caddyfile:/etc/caddy/Caddyfile:ro
      - caddy-data:/data
    depends_on: [web]
${service('migrate', 'migrate', "    restart: 'no'\n")}${service('web', 'web', "    depends_on:\n      migrate: { condition: service_completed_successfully }\n    healthcheck:\n      test: ['CMD', 'node', '-e', \"fetch('http://127.0.0.1:3000/health/ready').then((r) => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))\"]\n      interval: 10s\n      retries: 6\n")}${service('worker', 'worker', '    depends_on:\n      migrate: { condition: service_completed_successfully }\n')}${service('scheduler', 'scheduler', '    depends_on:\n      migrate: { condition: service_completed_successfully }\n    # One scheduler, and never two at once: compose stops the old container before it starts the new one (section 19.5).\n')}${sqlite ? '' : databaseService(dialect, folder)}  valkey:
    image: ${IMAGES.valkey}
    restart: unless-stopped
    # The queue must never lose a job to memory pressure (Q-08).
    command: ['valkey-server', '--appendonly', 'yes', '--maxmemory-policy', 'noeviction']
    volumes:
      - queue-data:/data
  valkey-cache:
    image: ${IMAGES.valkey}
    restart: unless-stopped
    command: ['valkey-server', '--maxmemory', '256mb', '--maxmemory-policy', 'allkeys-lru']
${backupServices(dialect, folder.replaceAll(/[^a-z0-9_]/g, '_'))}
volumes:
  caddy-data:
  queue-data:
  storage:
  backups:
${sqlite ? '  data:\n' : '  db-data:\n'}`;
}

/** The ciphers of both scripts are the same, so that one command restores any dump: AES-256-CBC with a key from PBKDF2, as `openssl enc` makes. */
export const CIPHER = 'openssl enc -aes-256-cbc -pbkdf2 -iter 600000 -salt -pass env:BACKUP_PASSPHRASE';

/** The retention of DEP-07: the newest 7 daily dumps, the first 4 Sundays and the first 6 first days of a month that are left. */
const PRUNE = `prune() {
  cd /backups || return 1
  keep=$(mktemp)
  ls -1 *.dump.enc 2>/dev/null | sort -r | head -7 >> "$keep"
  ls -1 *.dump.enc 2>/dev/null | sort -r | while read -r file; do
    day=$(echo "$file" | sed -E 's/.*-([0-9]{4}-[0-9]{2}-[0-9]{2})\\.dump\\.enc/\\1/')
    [ "$(date -d "$day" +%u)" = 7 ] && echo "$file"
  done | head -4 >> "$keep"
  ls -1 *.dump.enc 2>/dev/null | sort -r | grep -E -- '-[0-9]{4}-[0-9]{2}-01\\.dump\\.enc$' | head -6 >> "$keep"
  for file in *.dump.enc; do
    [ -e "$file" ] || continue
    grep -qx -- "$file" "$keep" || rm -f -- "$file"
  done
  rm -f "$keep"
}`;

export function renderBackupScript(dialect: Dialect, head: Head): string {
  const dump =
    dialect === 'postgres'
      ? 'PGPASSWORD="$DB_ADMIN_PASSWORD" pg_dump --host "$DB_HOST" --port "${DB_PORT:-5432}" --username "$DB_ADMIN_USER" --format custom "$DB_NAME"'
      : 'mysqldump --host "$DB_HOST" --port "${DB_PORT:-3306}" --user root --password="$DB_ADMIN_PASSWORD" --single-transaction --routines --no-tablespaces "$DB_NAME"';
  return `${head('deploy/backup.sh', 'The backup of the database: a dump every day, encrypted with the passphrase of the project, kept as DEP-07 says (7 daily, 4 weekly, 6 monthly).')}set -euo pipefail
: "\${BACKUP_PASSPHRASE:?Set BACKUP_PASSPHRASE in .env.production}"
: "\${DB_ADMIN_PASSWORD:?Set DB_ADMIN_PASSWORD}"

${PRUNE}

while true; do
  day=$(date +%Y-%m-%d)
  target="/backups/${dialect}-$day.dump.enc"
  # Written under a name that the retention never lists, and moved when it is whole, so that a stopped dump is never kept.
  # pipefail makes a dump that failed fail the script, and a dump that is empty is not a backup, so neither is ever kept.
  ${dump} | ${CIPHER} > "$target.partial"
  [ "$(wc -c < "$target.partial")" -gt 64 ] || { echo "the dump is empty" >&2; rm -f "$target.partial"; exit 1; }
  mv "$target.partial" "$target"
  prune
  echo "backup $target done"
  [ -z "\${BACKUP_ONCE:-}" ] || exit 0
  sleep "\${BACKUP_INTERVAL_SECONDS:-86400}"
done
`;
}

/** `head` writes a block comment: the file is JavaScript, which has no `#` comment. */
export function renderSqliteBackupScript(head: Head): string {
  return `${head('deploy/backup.mjs', 'The backup of the SQLite database: a copy every day, encrypted as openssl enc does, kept as DEP-07 says (7 daily, 4 weekly, 6 monthly).')}import { createCipheriv, pbkdf2Sync, randomBytes } from 'node:crypto';
import { existsSync, readdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';

const passphrase = process.env.BACKUP_PASSPHRASE;
if (!passphrase) throw new Error('Set BACKUP_PASSPHRASE in .env.production');
const source = process.env.DATABASE_URL ?? '/app/data/app.db';
const interval = Number(process.env.BACKUP_INTERVAL_SECONDS ?? 86400) * 1000;

/** What \`openssl enc -aes-256-cbc -pbkdf2 -iter 600000 -salt\` writes: "Salted__", 8 bytes of salt, and the cipher text. */
function encrypt(bytes) {
  const salt = randomBytes(8);
  const material = pbkdf2Sync(passphrase, salt, 600000, 48, 'sha256');
  const cipher = createCipheriv('aes-256-cbc', material.subarray(0, 32), material.subarray(32));
  return Buffer.concat([Buffer.from('Salted__'), salt, cipher.update(bytes), cipher.final()]);
}

/** The newest 7 daily files, the first 4 Sundays and the first 6 first days of a month. */
function prune() {
  const files = readdirSync('/backups').filter((name) => name.endsWith('.dump.enc')).sort().reverse();
  const dateOf = (name) => name.match(/-(\\d{4}-\\d{2}-\\d{2})\\.dump\\.enc$/)?.[1] ?? '';
  const keep = new Set(files.slice(0, 7));
  for (const name of files.filter((file) => new Date(\`\${dateOf(file)}T00:00:00Z\`).getUTCDay() === 0).slice(0, 4)) keep.add(name);
  for (const name of files.filter((file) => dateOf(file).endsWith('-01')).slice(0, 6)) keep.add(name);
  for (const name of files) if (!keep.has(name)) rmSync(\`/backups/\${name}\`);
}

for (;;) {
  const day = new Date().toISOString().slice(0, 10);
  const target = \`/backups/sqlite-\${day}.dump.enc\`;
  if (!existsSync(source)) throw new Error(\`There is no database at \${source}\`);
  // A consistent copy, whatever the writers do meanwhile.
  const copy = \`/tmp/backup-\${day}.db\`;
  rmSync(copy, { force: true });
  new DatabaseSync(source).exec(\`VACUUM INTO '\${copy}'\`);
  writeFileSync(\`\${target}.partial\`, encrypt(readFileSync(copy)));
  renameSync(\`\${target}.partial\`, target);
  rmSync(copy);
  prune();
  console.log(\`backup \${target} done\`);
  if (process.env.BACKUP_ONCE) break;
  await new Promise((resolve) => setTimeout(resolve, interval));
}
`;
}

export function renderUploadScript(head: Head): string {
  return `${head('deploy/upload.sh', 'Copies the encrypted dumps to a bucket of their own, so that a lost server does not take its backups with it (DEP-07).')}set -eu
while true; do
  if [ -n "\${BACKUP_S3_ENDPOINT:-}" ]; then
    # sync, so that a dump that the retention removed is removed from the bucket too. The bucket may keep its own versions (DEP-08).
    rclone sync /backups ":s3,provider=Other,endpoint=$BACKUP_S3_ENDPOINT,access_key_id=$BACKUP_S3_ACCESS_KEY_ID,secret_access_key=$BACKUP_S3_SECRET_ACCESS_KEY:$BACKUP_BUCKET" --include '*.dump.enc'
    echo "backup upload done"
  fi
  sleep "\${BACKUP_INTERVAL_SECONDS:-86400}"
done
`;
}
