---
'bieberkit': minor
'@bieberkit/server': minor
'@bieberkit/testing': minor
---

Start the CLI. `bieberkit` gets `runCli`, the framework of commands with `--json` on every command, the exit codes 0, 1, 2 and 3, stable `BK_` codes with a fix and a link, the project loader (config, plugins, graph), and the commands `plugins`, `env:check` and `env:example` (`--write`, `--check`).

Add `bieberkit check [rule]` with the rules headers, env-access, boundaries, orm, sql, transactions and migrations: violations with a stable code, a fix and a link, exit code 3 for errors, and `// bieberkit-ignore BK_CODE: reason` for a deliberate exception.

Add `routes`, `openapi`, `generate` and `client:generate` (`.bieberkit/` and `packages/client`, deterministic, `--check`), the rules `routes` and `generated` of `check`, and `make:module`, `make:entity` and `make:job`. `@bieberkit/testing` is unchanged.

Add `start`, `dev`, `db:seed`, `doctor` and `test`, and `@bieberkit/server` (ADR 0024): the loader of a project and `boot` of the roles web, worker, scheduler, migrate and dev (logger with redaction, error reporter, tracer, metrics on their own port, process handlers, database, queue, outbox dispatcher, shutdown in reverse), with `main`, `seed`, `diagnose` and `migrate`. `@bieberkit/testing` exports `installNetworkGuard`.
