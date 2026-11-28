<!--
  BieberKit

  @file        docs/modules/deploy.md
  @description Module spec of the deployment of M1.9: the generated image and compose files, the backup and bieberkit backup:verify, and the benchmarks of the reference endpoints.
  @author      Bieber Kieu <kieutrongthien@gmail.com>
  @copyright   Copyright (c) 2026 Bieber Kieu
  @license     Apache-2.0

  Licensed under the Apache License, Version 2.0 (the "License");
  you may not use this file except in compliance with the License.
  You may obtain a copy of the License at

      http://www.apache.org/licenses/LICENSE-2.0

  Unless required by applicable law or agreed to in writing, software
  distributed under the License is distributed on an "AS IS" BASIS,
  WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
  See the License for the specific language governing permissions and
  limitations under the License.

  SPDX-License-Identifier: Apache-2.0
-->

# Deployment and benchmarks

- Where: the renderers in `packages/create/src/scaffold/deploy.ts`, the command `packages/cli/src/commands/backup.ts`, and `benchmarks/`.
- Spec sections: 18.1, 19.1 to 19.8, DEP-01 to DEP-09, PERF-03, PERF-08. ADR 0026.
- Status: **Done in M1.9, with the open points below.**

## What `create` writes

| File                                      | What it is                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| ----------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `Dockerfile`, `.dockerignore`             | One image for the four roles. Two stages on `node:26-slim` by digest: `pnpm fetch` before the source (DEP-01), `bieberkit build`, the build of each plugin of `plugins/`, `pnpm deploy --prod` into `/out/apps/server` (DEP-02), the config and the migrations beside it, and `node deploy/image.mjs /out`. It runs as `node` (not root), with `ENTRYPOINT ["node", "apps/server/src/main.ts"]` and `CMD ["web"]` (DEP-03, DEP-05)                                                     |
| `deploy/image.mjs`                        | What `pnpm deploy` does not do (UI-38): the config and the migrations at the root of the image see the `node_modules` of the server, and each plugin of `plugins/` exports its build in the place of its source, as the published package does, for Node.js runs no TypeScript from `node_modules`. `pnpm test:acceptance` runs the same steps without Docker and serves the admin from that folder. Until 2026-11-28 the image could not start: its config found no `@bieberkit/core` |
| `compose.prod.yaml`                       | The proxy, the roles (`migrate`, `web`, `worker`, `scheduler`), the database for PostgreSQL and MySQL, the two Valkeys, the backup and the upload. `web`, `worker` and `scheduler` wait for `migrate` to end well (section 19.5). Each role has a read only filesystem, no capability, `no-new-privileges`, `mem_limit` of 1024 MB, `--max-old-space-size=768` (PERF-03) and 40 seconds to stop. No port of a database or a Valkey is published                                        |
| `.env.production.example`                 | What production reads, with `change-me` where a person must choose                                                                                                                                                                                                                                                                                                                                                                                                                     |
| `deploy/Caddyfile`                        | TLS, compression, and everything to the web role. The metrics port is never routed (OBS-04)                                                                                                                                                                                                                                                                                                                                                                                            |
| `deploy/backup.sh` or `deploy/backup.mjs` | A dump every day, encrypted (AES-256-CBC, PBKDF2, the format of `openssl enc`), kept 7 daily, 4 weekly and 6 monthly (DEP-07). The scripts fail when the dump fails and refuse an empty one. `BACKUP_ONCE=1` makes one dump and ends, for a cron or a test                                                                                                                                                                                                                             |
| `deploy/upload.sh`                        | `rclone sync` of the dumps to a bucket of their own, when `BACKUP_S3_ENDPOINT` is set                                                                                                                                                                                                                                                                                                                                                                                                  |

The scripts of `deploy/` run in their own containers, so `bieberkit check env-access` does not read them.

## `bieberkit backup:verify [--dir backups] [--passphrase-file file]` (DEP-09)

Takes the newest `*.dump.enc`, decrypts it, restores it into a throwaway database (a container of `postgres:15` or `mysql:8.4` on a free port of 127.0.0.1, or a temporary file for SQLite) and asks the migrator what is left to run. Nothing left is the pass. The failures have their own codes: `BK_BACKUP_NONE`, `BK_BACKUP_DECRYPT` (a wrong passphrase, or a file that is not a dump), `BK_BACKUP_RESTORE` (the restore failed), `BK_BACKUP_DOCKER` (Docker is not there), `BK_BACKUP_PENDING` (the dump is older than the code, or was never migrated), and `BK_USAGE_PASSPHRASE`. The container is removed in every case. Run it weekly.

## Benchmarks (PERF-08)

`pnpm build`, then `pnpm bench` (Docker, for PostgreSQL and for k6; `VUS` and `DURATION` change the load). It makes a blank project on a PostgreSQL container, migrates and seeds it, starts the web role, and measures the cold start, the memory at rest, the size of the admin, and with k6 the p95 of the list of 25 rows and of the get of one row as the administrator, with a route that has no authentication and no query as the floor. `benchmarks/entity.k6.js` carries the targets of section 18.1 as thresholds.

### First results (2026-11-24)

Three runs, 4 virtual users, 20 seconds each, on a laptop of 8 cores with PostgreSQL 15 in a container on the same machine and the web role in development mode. It is **not** the reference setup of section 18.1 (1 vCPU, 1 GB, PostgreSQL on another host), so it is a first reading and not a verdict. Two other runs, with 2 virtual users, gave a p95 of 13 and 9 ms for the same two routes, so the noise of this machine is large.

| Measure                         | Target       | Measured      |                         |
| ------------------------------- | ------------ | ------------- | ----------------------- |
| p95, list of 25 rows            | under 50 ms  | 25 to 32 ms   | met                     |
| p95, get of one row             | under 20 ms  | 22 to 27 ms   | **missed by 10 to 35%** |
| p95, `/health/live` (the floor) |              | about 1 ms    |                         |
| Cold start of the web role      | under 2 s    | 1.7 to 2.0 s  | met, with no margin     |
| Memory at rest of the web role  | under 150 MB | 224 to 236 MB | **missed**              |
| Admin JavaScript, compressed    | under 400 KB | 371 KB        | met, with little margin |

The floor says that the 20 ms of a get is not the server or the network: it is the work that an authenticated entity request does (the session, the grants of the user, the tenant, the authorization, the read). A get that costs as much as a list shows that the fixed part dominates. The memory includes TypeScript that Node strips at load, every plugin, the metadata of the ORM, and the admin, in development mode.

Neither target was relaxed: section 18.1 keeps them. The two that were missed are work for the pilot (M1.10), starting with the number of queries that an authenticated request makes, the cache of the grants (the `GrantLoader` already has a port for it), and a built server (the bundle that `bieberkit build` does not make yet).

## What the work found

- The first backup script kept an **empty dump** when `pg_dump` could not connect, because the pipe hid the failure and the script said "done". `backup:verify` refused the file. The script is now `bash` with `pipefail`, and refuses an empty dump, with tests that run it.
- The first SQLite backup script had a **header that is a `#` comment in a JavaScript file**, and regular expressions with `\d` and `\.` that a template literal turns into `d` and `.`. A test that only compared strings missed both. A test now runs the script against a real database, decrypts what it wrote, and reads the copy.
- A compose `depends_on` with a wrong indentation passed all the string tests and was refused by `docker compose config`, so Docker is the check of these files.

## Not done

- **The image has not been built to the end.** `@bieberkit/*` is not published, so `pnpm install` inside a build has nothing to fetch. The Dockerfile passes `docker build --check`, and each compose file passes `docker compose config`. A local registry (Verdaccio) or the first release closes this.
- **The hardened image, the SBOM, the provenance and the Trivy gate (SEC-18, SEC-19)**: the base image is `node:26-slim` by digest (ADR 0026), and the gates are steps of the CI, in `.github/workflows/`, which waits for the maintainer. So is a k6 run on every release candidate (PERF-08).
- **`worker --queues=critical,default`** (DEP-05): the role takes no list of queues yet, and the file says `worker`.
- **The Helm chart** (`bieberkit deploy:helm`, section 19.2) and **the site image** are not in the list of M1.9.
- **MySQL `backup:verify`** was tested with a fake Docker and not against a real dump. **The upload** (`rclone`) was not run against a bucket.

## Tests

`packages/create/src/deploy.test.ts` (the image, the compose file of each dialect, the proxy, the production environment, and the backup, which runs for real: the retention function on a folder of dumps, the script with a failing dump, and the SQLite script on a database, whose output is decrypted and read), `packages/cli/src/backup.test.ts` (a real SQLite restore, a wrong passphrase, no dump, a database that is not migrated, and the PostgreSQL container sequence with a fake Docker, including that it is always removed). By hand on this machine, once: the real backup script against PostgreSQL 15, and `backup:verify` of its dump (1 migration and 38 steps in place, nothing left to run).
