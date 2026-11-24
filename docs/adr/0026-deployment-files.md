<!--
  BieberKit

  @file        docs/adr/0026-deployment-files.md
  @description ADR 0026: the images of the generated deployment files, the proxy, the backup and its encryption, and why the base image is not the hardened one yet.
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

# 0026. The deployment files: images, proxy, backup

- Status: Accepted
- Accepted: 2026-11-24, by delegation: the maintainer asked the engineer to settle every open decision.
- Date: 2026-11-24
- Deciders: Bieber Kieu
- Requirements: section 19 (DEP-01 to DEP-09), PERF-03, SEC-18, OBS-04, Q-08

## Context

M1.9 generates the files that put a project on one server: an image, a production compose file with the roles, a proxy, and a backup (DEP-07 to DEP-09). Section 19.1 names `dhi.io/node:26` (a hardened image), pinned by digest. It also names images for the proxy, the database and the backup that the project would pull, so each is a choice with a license and a maintainer (P9 for what the generated files depend on).

## Decision

| Piece                          | Choice                                                                                         | Reason, maintainer, license                                                                                                                                                                                                                                                                                            |
| ------------------------------ | ---------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Base image of the server       | `node:26-slim`, pinned by digest                                                               | `dhi.io` answers 401 without a login, so the generated files could not be built by someone who has none, nor checked here. The digest is pinned as DEP-04 asks, and moving to the hardened image is the change of two `FROM` lines and of the digest, when an account for it exists. OpenJS Foundation and Docker, MIT |
| Proxy                          | `caddy:2`, pinned by digest                                                                    | TLS with certificates from Let's Encrypt with no setting, HTTP/2 and 3, compression, a health check of the upstream. Section 19.6 names it. Caddy and contributors, Apache-2.0                                                                                                                                         |
| Database and Valkeys           | `postgres:15`, `mysql:8.4`, `valkey/valkey:8`                                                  | The versions that every test of this repository runs on. The queue Valkey is `noeviction` with an append file, the cache Valkey evicts (Q-08)                                                                                                                                                                          |
| Backup of PostgreSQL and MySQL | A container of the database image that runs `deploy/backup.sh`                                 | `pg_dump` and `mysqldump` are in it, so the dump is of the same version as the server. The script is `bash` with `pipefail`, and an empty dump is refused, because a dump that failed must never be kept as a backup                                                                                                   |
| Backup of SQLite               | The same Node image that runs `deploy/backup.mjs`                                              | `VACUUM INTO` of `node:sqlite` copies a database that is being written, consistently                                                                                                                                                                                                                                   |
| Encryption                     | AES-256-CBC with a key from PBKDF2 (600 000 rounds) and a salt, in the format of `openssl enc` | One format for the three dialects. Any machine with `openssl` can decrypt a dump, so recovery does not depend on this framework. A passphrase in `BACKUP_PASSPHRASE` is kept outside the server                                                                                                                        |
| Upload                         | `rclone/rclone:1`, `sync` of the dumps to a bucket                                             | One tool for S3, R2 and MinIO, by settings and not by code. The upload cannot write to the dumps (`:ro`). MIT                                                                                                                                                                                                          |
| Retention                      | 7 daily, 4 Sundays and 6 first days of a month                                                 | DEP-07. It runs on the volume, and `sync` carries it to the bucket                                                                                                                                                                                                                                                     |
| Verification                   | `bieberkit backup:verify`                                                                      | Decrypts the newest dump, restores it into a throwaway container (or a temporary file for SQLite), and asks the migrator what is left to run. Nothing left is the check. The container is removed in every case                                                                                                        |

The compose file keeps no port of a database or a Valkey open, routes only the web role (the metrics port is never routed, OBS-04), sets the heap of Node to 75 percent of the memory limit (PERF-03: 768 of 1024 MB), gives a container 40 seconds to stop (the drain of 5 and the shutdown of 20 of section 19.4, and a margin), and runs the roles with a read only filesystem, no capability and `no-new-privileges`. The scheduler is replaced by compose stopping the old container before it starts the new one.

## Options

| Option                                                        | For                                                            | Against                                                                                       |
| ------------------------------------------------------------- | -------------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| A. `dhi.io/node:26` as the spec says                          | Smaller, fewer packages, signed                                | Needs an account that this work does not have, so the files could not be built or tested      |
| B. `node:26-slim` by digest now, and the hardened image later | Builds for anyone, the same layout, a change of one line later | A larger image with more packages until the move                                              |
| C. A distroless image                                         | Smallest                                                       | No shell for the healthcheck and for debugging, and the same login question for a good digest |

## Evidence

Run on the machine of this work: the compose file of each dialect passes `docker compose config`; the Dockerfile passes `docker build --check`; a dump of a migrated PostgreSQL database, made by the generated script, restores in a throwaway container through `bieberkit backup:verify` (1 migration and 38 steps in place, nothing left to run), and the container is gone after. A first version of the script kept an empty dump when `pg_dump` could not connect, because the pipe hid the failure. `backup:verify` refused that dump, and the script now fails in that case (`pipefail`, and a size check), with tests.

## Consequences

- Easier: a project gets files that work with `docker compose -f compose.prod.yaml up -d --build` and a verified restore.
- Harder: the image is not the hardened one, and its SBOM, its provenance and the Trivy gate (SEC-18, SEC-19) are steps of the CI, which is a change of `.github/workflows/` that waits for the maintainer.
- Not verified here: a `docker build` of a project to the end, because `@bieberkit/*` is not published, so `pnpm install` has nothing to install. It needs a registry (a local Verdaccio) or the first release.

## Spec changes

- Section 19.1: the base image is `node:26-slim` by digest until the hardened image can be pulled, and the layout of the image (`/app/apps/server`, the config and the migrations beside it).
- Section 19.2: `.dockerignore`, `.env.production.example` and the folder `deploy/` are among the generated files.
- Section 18.1: the results of the first run of k6 (docs/modules/deploy.md).

## Follow-ups

- The hardened image, the SBOM and the Trivy gate in the CI, when the maintainer opens the workflows.
- A build of the image to the end from a local registry, and a `backup:verify` for MySQL against a real dump (the code path is tested with a fake docker).
