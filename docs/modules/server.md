<!--
  BieberKit

  @file        docs/modules/server.md
  @description Module spec of @bieberkit/server: how a project is found and how its process roles boot, run and stop.
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

# @bieberkit/server

- Package: `@bieberkit/server`
- Layer: product (it may import every contract package), ADR 0024
- Spec sections: 7, 7.1, 7.2, 19.4, 5.2 (`start`, `dev`, `db:seed`, `doctor`), OBS-01 to OBS-06, CFG-02
- Status: **Prepared on 2026-11-24.**

## Purpose

One place that composes the kernel and the contracts into a process, so that `apps/server/src/main.ts` of a project is `process.exitCode = await main();`, `bieberkit start` and `dev` run that file, and the CLI and the process read a project in the same way.

## Public API

```ts
loadConfig(cwd); loadProject(cwd); findProjectRoot(cwd); envOwnersOf(project)   // bieberkit.config.ts, the plugins in boot order
allModules(project); projectModules(root); contributed<T>(modules, key)       // modules/<name>/module.ts, and what they contribute
boot({ role, cwd?, env?, process? }): Promise<Running>   // role: web | worker | scheduler | migrate | dev
main(argv?): Promise<number>                             // what main.ts calls: boots, waits for SIGTERM or SIGINT, answers the exit code
migrate(db, env); seed({ cwd?, env? }); diagnose({ cwd?, env? })
makeMigration({ cwd?, env?, name? }); runMigrations({ cwd?, env?, allowDestructive?, deployId? }); rollbackMigration(); migrationStatus()
permissionCatalog(project, modules); registerRuntimeServices(container, { env, extra, db, permissions }); COLLECTORS
contributedRecord<T>(modules, key)                        // what each module gives as an object by name, merged (scopedPermissions)
```

## Behavior

1. **Boot (section 7.2).** `boot` finds the project, loads its plugins and modules, validates the environment against the merged schema of core and the plugins (`loadEnv`, a missing or wrong key stops the boot with its own code before anything starts), builds the logger, the reporter, the tracer and the metrics, registers the services of every module in the container, connects the database, starts the role, and answers a `Running` with `stop()`.
2. **What every role has.** The pino logger with the secrets of the environment and the `pii` fields of the entities redacted (ADR 0022), the error reporter of `ERROR_REPORTER_DSN`, the tracer of `OTEL_EXPORTER_OTLP_ENDPOINT`, the metrics registry with the process figures, the metrics server on `METRICS_PORT` (a taken port is a warning and the process goes on, OBS-04), and with `process: true` the handlers of `uncaughtException` and `unhandledRejection` (OBS-06).
3. **`web`.** The HTTP server with the authorizer of auth (deny by default), the routes of the entities and of the modules, `openapi.json`, the probes, and the tracer and metrics of http. It listens on `APP_PORT` and then says ready. Nobody is signed in until a plugin brings an authenticator, so a route that needs a permission answers 401.
4. **`worker`.** The queue of `QUEUE_DRIVER` with the jobs of the modules, a worker, and the outbox dispatcher that hands each event to the queue (MOD-18). **`scheduler`.** The scheduler of Q-07, which has nothing to tick until a module declares a schedule. **`migrate`.** The steps of the framework, of auth and (with the database queue) of the queue, and in development the tables of the entities, with nothing destructive. In production it runs `runMigrations`: the steps of the framework and of the plugins (the module key `migrations`) and then the files of `migrations/`, on `MIGRATE_DATABASE_URL`, under the lock of DATA-25. **`dev`.** The three roles in one process, after `migrate`.
5. **Shutdown (section 19.4).** `stop()` runs the hooks in reverse: the server drains (5 seconds in production, none elsewhere) and stops, the worker and the dispatcher stop, the queue and the database close, and the tracer and the reporter flush. It answers 0, or 1 after a timeout or a failed hook. A boot that fails stops what it started and is `BK_BOOT_FAILED` with the reason.
6. **`seed`.** Boots the container over the database, runs the `seed` function of each plugin in boot order, then `apps/server/src/seed.ts` (a default export that takes the services). Each seeder must be idempotent. **`diagnose`.** The environment, the database (`select 1`), the Valkey findings of `@bieberkit/cache`, the SMTP server (`verify`) and the storage, each with an `id`, a level and a fix.
7. **Not here.** An authenticator and the administrator seed (the base plugins of M1.8), and the schedules of modules.

## Tests

`boot.test.ts` (the roles start, serve and stop; the metrics on their own port and not on the public one; the migrate role makes the tables; dev; stop frees the port; an invalid environment, no project and a taken port), `seed-doctor.test.ts` (plugin seeds in order, the seed of the project, each doctor check). The CLI tests run a project that `create` made, through `main.ts` in a real process, and stop it with SIGTERM.

## What plugins add to the admin (UI-04, ADR 0037)

`plugin-admin.ts`: `pluginAdminOf(project)` reads the `admin` key of every plugin, checks it with `extensionProblems` and checks that each file that it names is in the folder `admin` of the package (`LoadedPlugin.root` is that package), and stops the boot with every problem together (`BK_ADMIN_CONTRIBUTION_INVALID`). `boot` passes the extensions to `registerMeta` and the folders to `registerAdmin`, which serves each at `<admin>/plugins/<short name>/` with the policy of the admin, and nothing outside it.
