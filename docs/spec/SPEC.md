<!--
  BieberKit

  @file        docs/spec/SPEC.md
  @description The BieberKit specification, version 0.8.6: design, requirements and roadmap.
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

# BieberKit specification

> Exported from the BieberKit specification doc, version 0.8 (revision 134), on 2026-11-22. From now on this file is the copy agents read. Change it through pull requests together with the code or ADR that needs the change.

Nov 21, 2026 · @Bieber Kieu

## 1. Overview

BieberKit is an open-source TypeScript framework for management-style web apps and APIs. It is licensed under Apache 2.0. One command creates a production-ready project with API, admin UI, auth, permissions, queue, cache and storage already wired. Features come from plugins, and starter templates are presets of plugins.

| Item | Value |
| --- | --- |
| Project name | BieberKit |
| Scaffolder | `create-bieberkit` (run as `pnpm create bieberkit`) |
| Project CLI | `bieberkit` |
| npm scope | `@bieberkit/*` (to be reserved before the first release) |
| License | Apache License 2.0 |
| Author and maintainer | Bieber Kieu (kieutrongthien@gmail.com) |
| Runtime | Node.js 26 LTS by default, Node.js 24.12 or later supported |
| Language | TypeScript, erasable syntax only |
| Package manager | pnpm |
| Status | Draft specification, before implementation |

### 1.1 Problem

Every new back-office, CMS or CRM project rebuilds the same parts: login, roles, CRUD screens, uploads, background jobs, settings and audit logs. Requirements differ per project, but most of this work repeats. Earlier stacks (Laravel with Bootstrap or Vue, then Nuxt and Next) still required both backend and frontend to be assembled by hand each time.

### 1.2 Goals

- **G1** Create a working project (API, admin UI, auth, seeded admin user) with one command.
- **G2** Define an entity once and derive the database schema, validation, REST API, OpenAPI, permissions, admin screens and typed client from it.
- **G3** Compose features from plugins. A template is a preset list of plugins.
- **G4** Ship production-ready defaults for security, observability, graceful shutdown and Docker packaging.
- **G5** Scale horizontally with stateless processes and separate web, worker and scheduler roles.
- **G6** Run the same application code on PostgreSQL, MySQL and SQLite.
- **G7** Make correct usage easy for AI coding agents.
- **G8** Stay sustainable for a single maintainer through a small core, automated releases and automated upgrades.
- **G9** Server-render public sites so search engines and social previews receive full HTML, with SEO handled by the framework.

### 1.3 Non-goals

- Edge or serverless runtimes as a primary target.
- React Server Components anywhere, and server-side rendering for the admin UI. Public sites are server-rendered (section 16.2).
- GraphQL in core (possible as a plugin later).
- MongoDB or other non-relational primary stores.
- A visual low-code builder.
- Bun or Deno support in version 1.

### 1.4 Terminology

| Term | Meaning |
| --- | --- |
| Core | The `@bieberkit/*` runtime packages every project depends on |
| Module | A unit of application code that owns its entities, services, routes and jobs |
| Plugin | A distributable module with a manifest, installed with `bieberkit add` |
| Template | A preset of plugins, configuration and seed data used by the scaffolder |
| Entity | A data model declared with `defineEntity` |
| Process role | One of `web`, `worker`, `scheduler` or `migrate`, all served by the same image |
| Driver | An interchangeable backend for a service contract (queue, cache, storage, mail) |

### 1.5 Requirement keywords

MUST, MUST NOT, SHOULD, SHOULD NOT and MAY are used as defined in RFC 2119. Requirements carry IDs (for example SEC-04) so issues and pull requests can reference them.

## 2. Design principles

These principles settle disagreements during design and review. When two of them conflict, security (P5) wins.

1. **P1 One way to do each thing.** Adding an entity always uses `defineEntity`, adding a module always uses `defineModule`. Humans and AI agents both copy patterns, so the framework offers one pattern per task.
2. **P2 Define once, derive the rest.** Entity metadata is the single source for schema, validation, API, OpenAPI, permissions, admin screens and test factories.
3. **P3 Types carry the rules.** Mistakes SHOULD fail at type check, not at runtime. Code is erasable TypeScript: no enums, no decorators, no parameter properties, no runtime namespaces.
4. **P4 Small core, everything else is a plugin.** Core holds only what every project needs. Business features live in plugins.
5. **P5 Secure by default.** Insecure behavior requires an explicit, documented opt-out that `bieberkit check` reports.
6. **P6 Stateless processes.** No process keeps sessions, files or locks in local memory or disk in production.
7. **P7 Explicit boundaries.** Modules talk through events, declared entity extensions and published services. They never import each other's internals or query each other's tables.
8. **P8 Validated configuration.** All configuration comes from environment variables that are validated against a schema at boot.
9. **P9 Few, maintained dependencies.** Each third-party dependency needs a recorded reason, an active maintainer and a compatible license.
10. **P10 AI-legible.** Predictable structure, errors that state the fix, machine-readable CLI output and version-matched docs inside the package.
11. **P11 Upgradable.** Every breaking change ships a codemod run by `bieberkit upgrade`.

12. **P12 Contracts where swapping is real.** Swappable infrastructure sits behind BieberKit contracts with drivers: queue, cache, storage, mail, search, error reporting, CDN purge and payment. Project code imports foundation libraries only through `@bieberkit/*`. These re-exports keep versions aligned. Fastify, MikroORM, Standard Schema with Zod, React with TanStack and Ant Design are committed foundations rather than wrapped, so replacing one of them is a major release, not a driver swap.

## 3. Technology baseline

The baseline below is fixed for version 1. Changing any row requires an ADR (architecture decision record).

| Layer | Choice | Notes |
| --- | --- | --- |
| Runtime | Node.js 26 LTS by default, 24.12 or later supported | Minimum 24.12, the first release with stable type stripping. Maintenance LTS since 2026-10-20, end of life 2028-04-30. Docker images and CI default to Node.js 26 LTS (Active LTS since 2026-10-28, end of life 2029-04-30) from Phase 1. Node.js 24 stays in the CI matrix until its end of life. |
| Language | TypeScript 7 for type checking | TypeScript 6 is kept only for tools that still need the JavaScript compiler API. |
| Compiler options | `strict`, `erasableSyntaxOnly`, `verbatimModuleSyntax`, `module: nodenext`, `target: esnext` | Lets Node.js run sources directly through type stripping in development. Relative imports keep their .ts extension, and published packages ship compiled JavaScript because Node.js does not strip types inside node\_modules. |
| Package manager | pnpm 12 with workspaces | Only pnpm is supported, for both the framework and generated projects. |
| Task runner | Turborepo 2 | Cached builds and tests across workspace packages. |
| HTTP server | Fastify 5 | Plugin encapsulation, response schemas that whitelist fields (API-01), throughput close to raw node:http in the fastify/benchmarks suite. |
| Validation | BieberKit field DSL compiled to JSON Schema and Zod 4 Mini. Zod 4 through Standard Schema for custom routes | Ajv validators and fast-json-stringify serializers are generated from JSON Schema at build as standalone modules (SCH-06). Formats come from ajv-formats. Design in ADR 0009, section 10.6. |
| ORM | MikroORM 7.2, pinned exactly, with `defineEntity` | One entity definition for PostgreSQL, MySQL and SQLite. No decorators. Rules and spike results in ADR 0008. |
| Databases | PostgreSQL 15+, MySQL 8.4 LTS+, SQLite 3 | Support tiers in section 9. |
| Authentication | Better Auth 1.7 (1.7.16 or later), pinned exactly | Sessions, MFA, passkeys, OAuth, organizations. Runs on MikroORM's Kysely (ADR 0012). |
| Authorization | CASL | Action, subject, field and condition rules per request. Own condition translator (ADR 0013). |
| Queue | BullMQ 6 on Valkey or Redis, pinned exactly, plus a built-in database driver | Section 15 and ADR 0010. BullMQ's PostgreSQL backend is not used. |
| Cache | BentoCache: memory first level, Valkey second level, tags, stampede protection, grace periods | Section 15. |
| File storage | FlyDrive | Local disk, S3, R2, GCS and S3-compatible stores. |
| Logging and telemetry | pino, OpenTelemetry | Section 20. |
| Admin UI | React 19.2 (19.2.4 or later), Vite 8, TanStack Router and Query, Ant Design 6 | Single-page app, no server components. Ant Design is the default UI adapter (UI-10). |
| API client | OpenAPI 3.1 and Orval | Typed client and TanStack Query hooks generated per project. |
| Testing | Vitest 4, Testcontainers, Playwright, k6 | Section 21. |
| Container | Docker, Docker Hardened Images `node:26` | Section 19. |
| Public site | TanStack Start 1.x on Node.js through Nitro | Server-side rendering for SEO. Shares React, TanStack Router and Query with the admin UI. Section 16.2. |
| Site styling | Tailwind CSS 4, shadcn/ui on Base UI | Copied in from the registry and owned by the project. |
| Content editor | Tiptap 3 | Chosen in ADR 0004. Content stored as block JSON, so the engine can be replaced. Section 16.5. |
| Lint and type check | Oxlint with type-aware rules (tsgolint on TypeScript 7) | One pass runs lint rules and TypeScript diagnostics on the same program. BieberKit rules ship as an Oxlint plugin used by bieberkit check. |
| Formatting | Oxfmt | Same Oxc toolchain as Oxlint, Rolldown and Vite. Pinned to an exact version. The Biome formatter is the fallback (ADR 0002). |
| Docs site | Starlight (Astro) on Cloudflare Pages | ADR 0006. Static output, so the host can change. Built from `docs/`, with `llms.txt` and per-version docs. Section 22.1. |
| Package build | tsdown, pinned (pre-1.0) | ESM-only packages with exports maps. isolatedDeclarations for fast .d.ts output. publint and attw check every package in CI, with `attw --profile esm-only`. |
| Workflow checks | actionlint, zizmor and `tools/check-workflows.ts` | Run in `pnpm check` for SEC-13, SEC-15, SEC-16 and SEC-21 (ADR 0014). |

Dependency policy:

- Exact versions are pinned in `pnpm-lock.yaml`, and CI installs with `--frozen-lockfile`.
- Renovate opens update pull requests no sooner than 7 days after a release is published.
- Every dependency MUST use a license compatible with Apache 2.0 (MIT, BSD, ISC, Apache 2.0). Copyleft and source-available licenses are not allowed in core.

## 4. Repository layout

The framework lives in one pnpm monorepo. Every package is published under `@bieberkit/*` on one shared version number.

### 4.1 Framework repository

```text
bieberkit/
├── packages/
│   ├── core/        @bieberkit/core      kernel, container, config, lifecycle, events
│   ├── http/        @bieberkit/http      Fastify integration, routing, OpenAPI
│   ├── data/        @bieberkit/data      defineEntity, MikroORM integration, migrations
│   ├── auth/        @bieberkit/auth      Better Auth and CASL integration
│   ├── queue/       @bieberkit/queue     queue contract and drivers
│   ├── cache/       @bieberkit/cache     cache contract, locks, tags
│   ├── storage/     @bieberkit/storage   storage contract on FlyDrive
│   ├── mail/        @bieberkit/mail      mail contract and drivers
│   ├── search/      @bieberkit/search    search contract and database driver
│   ├── log/         @bieberkit/log       logger contract and pino adapter
│   ├── admin-core/  @bieberkit/admin-core  headless admin: metadata, routing, state
│   ├── admin-antd/  @bieberkit/admin-antd  default UI adapter on Ant Design
│   ├── tokens/      @bieberkit/tokens    design tokens to Ant Design and CSS variables
│   ├── content/     @bieberkit/content   block content schema and renderers
│   ├── site-kit/    @bieberkit/site-kit  SEO head, sitemap, preview, cache helpers for the site
│   ├── testing/     @bieberkit/testing   test app, factories, actingAs helpers
│   ├── server/      @bieberkit/server    boot of the process roles (ADR 0024)
│   ├── mcp/         @bieberkit/mcp       MCP server for AI agents
│   ├── cli/         bieberkit            project CLI
│   └── create/      create-bieberkit     scaffolder
├── plugins/         @bieberkit/plugin-*  first-party plugins (section 12)
├── templates/       blank, cms, crm, saas
├── registry/        copy-in UI blocks and module recipes
├── skills/          Agent Skills shipped to projects
├── docs/            documentation source, bundled into packages at build
├── examples/        sample apps used by upgrade and compatibility tests
├── tools/           header checker, codemods, release scripts
├── LICENSE  NOTICE  README.md  CONTRIBUTING.md  SECURITY.md
├── CODE_OF_CONDUCT.md  AGENTS.md  CLAUDE.md
└── pnpm-workspace.yaml  turbo.json  tsconfig.base.json
```

### 4.2 Generated project

```text
example-project/
├── apps/
│   ├── server/              API, workers, scheduler (one codebase, many roles)
│   │   └── src/
│   │       ├── modules/     the project's own modules
│   │       └── main.ts      entry point, selects the process role
│   ├── admin/               admin SPA (React, Vite)
│   └── site/                public site with SSR (TanStack Start), optional
├── packages/
│   └── client/              generated typed API client
├── migrations/              generated per project dialect
├── bieberkit.config.ts      plugins, project metadata, feature flags
├── .env  .env.example
├── Dockerfile  compose.yaml  compose.prod.yaml
├── AGENTS.md  CLAUDE.md  .agents/skills/
└── pnpm-workspace.yaml
```

Rules:

- Plugins are dependencies in `package.json`, never copied into the project. They upgrade with the framework.
- Registry blocks are copied into the project and owned by it after installation.
- `apps/server` is the only process codebase. The role is chosen at start (section 7).

### 4.3 Package layers

Framework packages form four layers, and imports only point downward. The contracts layer is the stable seam: everything above it is BieberKit's own API, and swappable infrastructure sits beside it as driver adapters. Foundation libraries are re-exported, not wrapped.

Layers, top to bottom. Imports point downward only.

| Layer | Packages | Notes |
| --- | --- | --- |
| Tools | `bieberkit` (cli), `create-bieberkit`, `@bieberkit/mcp` | Act on the project, never imported by it |
| Your project and plugins | | Use foundation libraries through `@bieberkit/*` re-exports |
| Product | admin-core, admin-antd, site-kit, tokens, content, testing, server | |
| Contracts | http, data, auth, queue, cache, storage, mail, search, log | Driver adapters sit behind them: BullMQ, BentoCache, FlyDrive, mail, search, error reporting, CDN purge |
| Foundation | `@bieberkit/core` | Kernel, container, config, errors, events, plugin resolver |

Project code and plugins see only BieberKit packages. Tools act on the project but are never imported by it.

- **PKG-01** A package imports only packages in its own layer or below. `bieberkit check` enforces this in the framework repository.
- **PKG-02** Each contract package exports its interface and its default adapter under a subpath, for example `@bieberkit/cache` and `@bieberkit/cache/bentocache`, so a new adapter never touches callers.
- **PKG-03** Swappable infrastructure libraries (BullMQ, BentoCache, FlyDrive, mail transports, search engines) are imported only inside driver adapters. Foundation libraries are re-exported by BieberKit packages so versions stay aligned (P12).
- **PKG-04** `@bieberkit/core` has no runtime dependency besides Node.js built-ins.

## 5. CLI specification

Two binaries exist. `create-bieberkit` creates projects, and `bieberkit` runs inside a project from its local dependencies. No global install is required.

### 5.1 Creating a project

```bash
pnpm create bieberkit@latest example-project
```

`bieberkit create example-project` is an alias that calls the same scaffolder.

| Flag | Values | Default | Purpose |
| --- | --- | --- | --- |
| `--db` | `postgres`, `mysql`, `sqlite` | asked, `sqlite` with `--yes` | Database dialect |
| `--template` | `blank`, `cms`, `crm`, `saas` | asked, `blank` with `--yes` | Starter template |
| `--plugins` | comma-separated plugin names | none | Extra plugins on top of the template |
| `--admin` / `--no-admin` | flag | `--admin` | Include the admin SPA |
| `--author` | `"Name <email>"` | from git config | Author written into project file headers |
| `--install` / `--no-install` | flag | `--install` | Run `pnpm install` |
| `--git` / `--no-git` | flag | `--git` | Initialize a git repository |
| `--yes` | flag | off | Accept defaults, never prompt |
| `--json` | flag | off | Print a machine-readable result |
| --site / --no-site | flag | --site for cms, otherwise --no-site | Include the server-rendered public site app |
| `--license` | an SPDX identifier or `UNLICENSED` | `UNLICENSED` | License written into `bieberkit.config.ts`, file headers and the `LICENSE` file (ADR 0007) |

A person at the terminal is asked for every choice that no flag gave, the name included, with arrow keys, then sees a summary and confirms it before anything is written (ADR 0029). A cancel writes nothing (`BK_CANCELLED`). Every prompt MUST have an equivalent flag, so CI and AI agents can run the scaffolder without interaction. With nobody to ask and no `--yes`, the command lists every flag that is missing (`BK_CREATE_CHOICE_NEEDED`, exit code 2), so that an agent repairs its command in one go.

### 5.2 Project commands

| Command | Purpose |
| --- | --- |
| `bieberkit dev` | Start local services from `compose.yaml`, then the server in watch mode with web, worker and scheduler in one process, plus the admin and site dev servers |
| `bieberkit build` | Type check, build server, admin and site, generate OpenAPI and the client |
| `bieberkit start <role>` | Start `web`, `worker`, `scheduler` or `migrate` from the built output |
| `bieberkit migrate:make [name]` | Generate a migration from entity changes for the project dialect |
| `bieberkit migrate` | Apply pending plugin steps and migrations under a lock (`--status`, `--rollback`, `--allow-destructive`) |
| `bieberkit db:seed` | Run seeders |
| `bieberkit backup:verify` | Restore the newest backup into a throwaway database and check that nothing is left to migrate (DEP-09) |
| `bieberkit audit:prune --before <date> [--yes]` | Count the audit entries before a date and, with `--yes`, delete them on `MIGRATE_DATABASE_URL`, except those under a legal hold, whose number it prints (AUD-06, AUD-09) |
| `bieberkit make:entity`, `make:module`, `make:plugin`, `make:job` | Generate code from the official recipes. `make:plugin <name>` makes a plugin with its backend and its admin part, wired into the project when it runs in one (UI-38): a package (a `bieberkit-plugin-<name>` or `@scope/bieberkit-plugin-<name>` name, PLG-05) with one entity, its permissions, a test and its static manifest, so that `bieberkit build --check` passes at once; it needs no application |
| `bieberkit add <plugin>` / `remove <plugin>` | Install or uninstall a plugin and update config, env schema and migrations |
| `bieberkit plugins` | List installed plugins in boot order, with versions, the graph (what each requires, with the range, and what requires it) and what each owns (tables, routes); `--json` gives the same graph with its edges |
| `bieberkit env:check` | Validate the current environment against the merged schema |
| `bieberkit env:example` | Regenerate `.env.example` |
| `bieberkit check [rule]` | Run framework rules: headers, env-access, boundaries, orm, sql, transactions, migrations, routes, generated, plugin-steps, plugin-tables, scoped-permissions. `// bieberkit-ignore BK_CODE: reason` lets one violation through |
| `bieberkit doctor` | Check connectivity to database, Valkey or Redis, storage and mail |
| `bieberkit routes` | Print routes with their permissions |
| `bieberkit openapi` / `client:generate` | Emit `openapi.json` / regenerate the typed client |
| `bieberkit generate` | Write everything that is generated (`.bieberkit/` and `packages/client`). `--check` writes nothing and exits with 3 when a file is stale |
| `bieberkit test` | Run tests through Vitest with framework presets |
| `bieberkit upgrade` | Move all `@bieberkit/*` packages to one version and run codemods |
| `bieberkit mcp` | Start the MCP server for AI agents (development only) |
| `bieberkit docker:init` / `deploy:helm` | Regenerate Docker files / generate a Helm chart |

### 5.3 Output and exit codes

- Human-readable output by default. `--json` prints one JSON document on stdout and logs on stderr.
- Every error has a stable code (for example `BK_ENV_MISSING`), a one-line cause, the fix, and a docs link.
- Exit codes: `0` success, `1` failure, `2` usage error, `3` check violations found.
- The CLI sends no telemetry.

### 5.4 Generated files

| Path | Content | Committed |
| --- | --- | --- |
| `.bieberkit/types/` | Entity, client and permission types (SCH-04) | No |
| `.bieberkit/schemas/` | JSON Schema and Zod Mini output (section 10.6) | No |
| `.bieberkit/meta/` | Resolved plugin graph and metadata snapshot | No |
| `packages/client/` | Typed API client and query hooks (API-07) | Yes |
| `migrations/` | Migrations for the project dialect (section 9.3) | Yes |
| `.env.example` | Generated from the env schema (CFG-06) | Yes |

- **GEN-01** Generated files carry a `@generated` header and are never edited by hand. `bieberkit check` fails when a committed generated file is stale.
- **GEN-02** `bieberkit dev` regenerates on change. `bieberkit build` regenerates from scratch, so CI never depends on a developer's local state.
- **GEN-03** Generators are deterministic: the same input gives byte-identical output, so diffs only show real changes.

## 6. Project creation flow

The scaffolder resolves every choice into a valid plugin graph before it writes a single file. A failed check leaves the target directory untouched.

1. **Name.** Ask for it when it is missing. Validate it as an npm package name and check that the target directory is empty, at the prompt, so that a wrong name is typed again.
2. **Database.** Ask for `postgres`, `mysql` or `sqlite`. Choosing `sqlite` with the `saas` template prints a warning that SQLite is meant for development and single-server deployments.
3. **Template.** Ask for `blank`, `cms`, `crm` or `saas`, among those that ship. With one template the question is not asked.
4. **Extra plugins.** Offer only plugins that support the chosen dialect and do not conflict with the template. With none to offer the question is not asked. Then ask for the admin, the license, the install and git, show a summary of every choice, and write nothing until the person confirms it.
5. **Resolve.** Build the plugin dependency graph, sort it topologically, and stop on a missing dependency, a cycle, a version mismatch, or two plugins claiming the same table, route, permission or env key.
6. **Write files.** Copy the template, render `bieberkit.config.ts`, and write file headers with the project author (section 23).
7. **Environment.** Merge the env schemas of core and all plugins, then write `.env` with development defaults and freshly generated secrets, plus `.env.example` without secrets.
8. **Install.** Run `pnpm install` with the supply-chain settings from section 17.
9. **Services.** Generate `compose.yaml` with the chosen database and Valkey, so `bieberkit dev` can start them.
10. **Database setup.** On the first `bieberkit dev`, generate the initial migration, apply it, and seed one administrator account with credentials asked for interactively or printed once.
11. **Git.** Initialize a repository and create the first commit.
12. **Next steps.** Print the commands to run next and the URLs of the API, the admin UI and the docs. A person sees steps 6, 8 and 11 under a spinner, and the output of a step only when it fails.

Development defaults written to `.env`:

| Setting | Development default | Typical production value |
| --- | --- | --- |
| `QUEUE_DRIVER` | `sync` | `redis` |
| `CACHE_DRIVER` | `file` | `redis` |
| `STORAGE_DISK` | `local` | `s3` |
| `MAIL_DRIVER` | `log` | `smtp` |

## 7. Core runtime architecture

Every process starts from the same entry point and the same kernel. Only the role chosen at start decides what runs after boot.

One kernel boots every process role from the same code:

1. `main.ts` reads the role from argv.
2. Kernel: config (validated env), container (services by name), plugin resolver (graph, collisions), lifecycle (boot, ready, stop).
3. Modules and plugins: entities, routes, jobs, events, workflows.
4. Service contracts: data, HTTP, auth, queue, cache, storage, mail.
5. Role: `web` (Fastify, admin assets), `worker` (queues and outbox), `scheduler` (cron under a lock) or `migrate` (migrate, then exit).

The kernel validates config, resolves plugins and fills the container before any module code runs. Each role then starts only the part it needs.

### 7.1 Process roles

| Role | Starts | Scales by | Replicas |
| --- | --- | --- | --- |
| `web` | Fastify server, admin static assets, health endpoints | CPU and p95 latency | 2 or more in production |
| `worker` | Queue consumers, outbox dispatcher | Queue depth | 1 or more, per queue group |
| `scheduler` | Schedule ticks under a distributed lock | Does not scale | Exactly 1 |
| `migrate` | Pending migrations, then exits | Once per deploy | 1 job |

### 7.2 Boot sequence

1. Read the static plugin manifests and resolve the plugin graph (section 11.2, PLG-07).
2. Load and validate configuration against the env schema merged from core and the resolved plugins. Exit on error.
3. Register services in the container.
4. Boot modules and plugins in dependency order: entities, routes, jobs, events, admin metadata.
5. Connect to the database, Valkey or Redis, and storage, with bounded retries.
6. Start the role and report ready on `/health/ready`.
7. On SIGTERM, run the shutdown sequence in section 19.4.

### 7.3 Container

- Services are registered as factories with a scope: `singleton`, `request` or `transient`.
- The request scope holds the ORM context, current user, tenant and CASL ability.
- Resolution is by name with inferred types, for example `ctx.services.pipeline`. No decorators and no reflection metadata.
- Circular dependencies and missing services fail at boot, not at first use.

### 7.4 Module structure and layering

Every module, in a project or a plugin, has the same shape, so humans and agents always know where code goes.

```text
modules/crm/
├── module.ts        defineModule: the only public entry point
├── entities/        defineEntity files, one per entity
├── services/        business logic, transactions, published service API
├── routes/          custom HTTP routes (entity routes are generated)
├── actions/         entity actions and transition handlers
├── jobs/            defineJob files
├── events/          event payload schemas and subscribers
├── workflows/       multi-step workflows with compensations
├── admin/           custom admin pages and widgets
├── i18n/            vi.json, en.json, zh.json
└── tests/
```

- **MOD-15** Dependencies point one way: routes, actions, jobs and subscribers call services. Services use the data layer. Nothing below calls upward.
- **MOD-16** Only services open transactions. A request handler never writes to the database directly, so business rules have one home and can be reused by jobs and the CLI.
- **MOD-17** Errors are thrown as `BkError` subclasses with a stable code, an HTTP status and a safe message. The HTTP layer maps them to RFC 9457 problems, and jobs map them to retry or fail decisions. Unknown errors become 500 and are reported (OBS-06).

### 7.5 Write path

A write commits exactly once, in one transaction that also records the audit entry and the outbox rows. Everything that talks to the outside world runs after the commit, so a failed side effect never corrupts data and a rolled-back write never sends an email.

Writes commit once, and every side effect runs after the commit.

- In the request: HTTP request (pipeline stages 1 to 8), then service (business rules), then transaction (data, audit, outbox), then commit (cache purge, response).
- After commit, in the worker role: outbox dispatcher (batches, versioned), then subscribers and jobs (idempotent, retried), then side effects (realtime events, webhooks, search index, mail).

The request only waits for the transaction and the cache purge. Realtime events, webhooks, search indexing and mail follow from the outbox within moments.

- **WP-01** Code never calls external systems (mail, webhooks, payment, search engines) inside a transaction. `bieberkit check` reports calls to `http.fetch`, `mail.send` or queue dispatch made outside the outbox inside a service transaction.
- **WP-02** A side effect that must happen exactly once (charging a card) uses an idempotency key stored with the outbox row and passed to the external system.

## 8. Configuration and environment

All runtime configuration comes from environment variables, validated once at boot against a merged schema. The process exits with a clear error if a required key is missing or invalid.

### 8.1 Rules

- **CFG-01** Core and each plugin declare their keys with `defineEnv`, including type, default, description and whether the value is secret.
- **CFG-02** Code MUST read configuration through the typed `config` object. Direct `process.env` access outside `bieberkit.config.ts` is reported by `bieberkit check`.
- **CFG-03** Real environment variables take precedence over the `.env` file. Node.js loads `.env` natively, so no dotenv dependency is used.
- **CFG-04** In production, `.env` files are optional. Containers SHOULD receive configuration from the orchestrator or a secret manager.
- **CFG-05** Secret values are redacted in logs, error reports and `bieberkit env:check` output.
- **CFG-06** `.env.example` is generated from the schema and never edited by hand.
- **CFG-07** Boot fails in production when unsafe settings are detected, such as `STORAGE_DISK=local` without APP\_SINGLE\_NODE=true, `APP_KEY` shorter than 32 bytes, a `sync` queue driver, or a `memory` or `file` cache driver without `APP_SINGLE_NODE=true`.

### 8.2 Core keys

| Key | Values | Default | Notes |
| --- | --- | --- | --- |
| `APP_NAME` | string | project name |  |
| `APP_ENV` | `development`, `test`, `production` | `development` |  |
| `APP_URL` | URL | `http://localhost:3000` | Used for links, CORS and cookies |
| `ADMIN_URL` | URL | `APP_URL` and `/admin` | Where the admin is: a path of the application (`https://example.com/panel`), a host of its own (`https://admin.example.com`), or a path of that host. Never a path of the API (`/api`, `/health`, `/metrics`) |
| `ADMIN_ASSETS_DIR` | path | `data/admin-assets` | Where the hashed files of the previous releases of the admin are kept for 24 hours (UI-22). The instances of a rolling deploy share it |
| `APP_PORT` | integer | `3000` |  |
| `APP_KEY` | 32+ random bytes, base64 | generated | Secret. Encryption and signing. Rotation supported through `APP_KEY_PREVIOUS` |
| `AUTH_SECRET` | 32+ random bytes | generated | Secret. Session signing |
| `LOG_LEVEL` | `fatal` to `trace` | `info` |  |
| `TRUST_PROXY` | boolean or hop count | `false` | Required behind a load balancer |
| `DB_CONNECTION` | `postgres`, `mysql`, `sqlite` | from scaffolder |  |
| `DATABASE_URL` | connection URL | from scaffolder | Secret |
| `DATABASE_READ_URLS` | comma-separated URLs | empty | Read replicas |
| `DB_POOL_MAX` | integer | `10` | Per process |
| `REDIS_URL` | URL | empty | Valkey or Redis. Secret |
| `QUEUE_DRIVER` | `sync`, `database`, `redis` | `sync` |  |
| `CACHE_DRIVER` | `memory`, `file`, `database`, `redis` | `file` |  |
| `CACHE_PREFIX` | string | `APP_NAME` | Isolates apps that share one Valkey |
| `STORAGE_DISK` | `local`, `s3` | `local` |  |
| `STORAGE_LOCAL_ROOT` | path | `./storage` |  |
| `S3_BUCKET`, `S3_REGION`, `S3_ENDPOINT` | strings | empty | `S3_ENDPOINT` for R2 and MinIO |
| `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY` | strings | empty | Secrets |
| `S3_FORCE_PATH_STYLE` | boolean | `false` | MinIO |
| `MAIL_DRIVER` | `log`, `smtp` | `log` |  |
| `SMTP_URL` | URL | empty | Secret |
| `MAIL_FROM` | address | empty |  |
| `ERROR_REPORTER_DSN` | URL | empty | Secret. A Sentry, GlitchTip or Bugsink project. Errors are not sent when empty (OBS-06) |
| `ERROR_REPORTER_SAMPLE_PERCENT` | integer 0 to 100 | `100` | Fatal reports are always sent |
| `OTEL_EXPORTER_OTLP_ENDPOINT` | URL | empty | Tracing is off when empty |
| `METRICS_PORT` | integer | `9464` | Prometheus endpoint on a separate port |
| APP\_KEY\_PREVIOUS | base64 | empty | Secret. Previous key, still accepted for decryption during rotation |
| APP\_SINGLE\_NODE | boolean | false | Declares a one-server deployment, which allows local storage and file cache in production |
| API\_DOCS\_PUBLIC | boolean | false | Serves openapi.json publicly in production (API-06) |
| SITE\_URL, SITE\_API\_URL | URLs | empty | Public site address and the internal API address it calls |
| SITE\_SERVICE\_TOKEN, SITE\_REVALIDATE\_SECRET | 32+ random bytes | generated | Secrets. Site to API authentication (API-12) and cache purge calls |
| CACHE\_REDIS\_URL | URL | REDIS\_URL in development only | Secret. Separate Valkey instance with allkeys-lru for cache. REDIS\_URL keeps noeviction for queue, sessions, locks and rate limits |
| MIGRATE\_DATABASE\_URL | connection URL | DATABASE\_URL in development only | Secret. Schema-owning role used only by the migrate role (DATA-25) |

Plugins add their own keys with a prefix equal to the plugin name, for example `SEO_SITEMAP_CRON`.

### 8.3 Project configuration

`bieberkit.config.ts` holds everything about a project that is not a secret and does not change between environments.

```ts
import { defineConfig } from '@bieberkit/core'

export default defineConfig({
  name: 'example-project',
  author: 'Nguyen Van A <a@example.com>',
  license: 'UNLICENSED',
  database: { dialect: 'postgres' },
  tenancy: { mode: 'single' },
  locales: { default: 'vi', supported: ['vi', 'en', 'zh'] },
  plugins: [
    '@bieberkit/plugin-users',
    '@bieberkit/plugin-roles',
    '@bieberkit/plugin-media',
    ['@bieberkit/plugin-seo', { sitemap: true }],
  ],
  admin: { path: '/admin', adapter: '@bieberkit/admin-antd' },
  site: { enabled: true, theme: '@bieberkit/theme-default' },
  theme: { colors: { primary: '#2563EB' }, radius: 8, font: 'system' },
})
```

- **CFG-08** The config file never holds secrets or environment-specific values. Those come only from environment variables.
- **CFG-09** The config is validated by a schema at build and at boot, with the same error format as env validation.
- **CFG-10** Project modules are discovered by convention from `apps/server/src/modules/*/module.ts`. Plugins are listed explicitly, because their order and options matter.
- **CFG-11** `tenancy.mode` is `single` (no `tenant_id` columns) or `shared-schema` (section 9.4). The `saas` template starts in `shared-schema`, the others in `single`. Switching later needs a generated migration.

## 9. Data layer

BieberKit uses MikroORM 7 because one `defineEntity` definition works on PostgreSQL, MySQL and SQLite without decorators. Drizzle was rejected for this reason: it has no shared table type, so every plugin would need three schemas.

### 9.1 Dialect support tiers

| Dialect | Tier | Intended use | CI coverage |
| --- | --- | --- | --- |
| PostgreSQL 15+ | 1 | Production, multi-tenant SaaS | Full suite |
| MySQL 8.4 LTS+ | 1 | Production, common shared hosting in Vietnam | Full suite |
| SQLite 3 | 2 | Development, demos, single-server small apps | Full suite, no load tests |

MariaDB is best effort and not in CI (ADR 0005). The only MySQL-family dialect value in configuration is `mysql`, and the docs call MariaDB untested. Revisit after the Phase 2 gate.

### 9.2 Rules

- **DATA-01** Core and first-party plugins MUST NOT depend on dialect-only features (JSONB operators, arrays, full-text syntax). Such features go behind a driver, for example a search plugin.
- **DATA-02** Each plugin declares `dialects` in its manifest. The CLI refuses to install a plugin on an unsupported dialect.
- **DATA-03** Primary keys are UUIDv7 by default: unique across nodes and roughly time-ordered for index locality.
- **DATA-04** Timestamps are stored in UTC. Conversion to the user's time zone happens at the edge.
- **DATA-05** Every request and every job runs in its own MikroORM request context (unit of work).
- **DATA-06** List queries MUST be paginated. The maximum page size is 100.
- **DATA-07** Fields used in filters or sorting MUST declare an index. `bieberkit check` reports missing ones.

### 9.3 Migrations

- Project modules: `bieberkit migrate:make` diffs project entities against a committed schema snapshot (`migrations/.snapshot-<dialect>.json`), never against a live database, so the output is the same on every machine.
- **DATA-24** Plugins own their migrations: ordered, versioned steps written with a portable schema builder plus data steps, keyed by plugin version and recorded in a `bk_plugin_migrations` table. `bieberkit add` and `bieberkit upgrade` run each plugin's pending steps in version order, so a rename or a split moves data before anything is dropped. A step is `{ plugin, version, id, kind: 'expand' | 'migrate' | 'contract', after?, up(trx, dialect) }` and runs in its own transaction. The ledger row holds the plugin, step id, version, kind, time and the `deploy_id` of the `bieberkit migrate` run, with `(plugin, step_id)` as primary key. The portable builder is Kysely's schema builder with helpers for UUID columns and `setNotNull` (ADR 0011).
- **DATA-08** Schema changes follow expand, migrate, contract. Old and new versions run side by side during a rolling deploy, so a column is added first, filled, and only removed or constrained in a later release. A plugin MUST NOT ship an expand and its contract in the same minor release, and the migrate role refuses a contract step whose expand step was applied in the same deploy, so skipping several versions can never merge them. `bieberkit check` flags destructive statements (drop, rename, type narrowing, new non-null column without default). The refusal is `PLG_CONTRACT_SAME_DEPLOY`, and later steps of that plugin wait. A deploy is named by `DEPLOY_ID` (1 to 40 characters, or `bieberkit migrate --deploy-id`), which CI and orchestration set to the id of the release, so that every run of one release, a retry or a second migrate role that waited for the lock included, is one deploy and cannot finish what the first refused. Without it each run gets a random id, which is only right for a release that is run once. A contract step starts with an idempotent backfill, because rows written by the old version between the two deploys can still be incomplete (ADR 0011).
- Migrations run only in the `migrate` role, once per deploy, never at web start, using `MIGRATE_DATABASE_URL` (DATA-25).

### 9.4 Multi-tenancy

- Model: shared schema, one `tenant_id` column on every tenant-scoped table (`tenant: true` in `defineEntity`).
- **DATA-09** Tenant isolation is enforced by a MikroORM global filter that is on by default and cannot be disabled inside request handlers. Disabling it requires the explicit `asSystem()` scope, which is audit-logged.
- On PostgreSQL, row-level security MAY be enabled as a second layer. Tenant context is then set per transaction with `set_config('app.tenant_id', $1, true)`, tables use `FORCE ROW LEVEL SECURITY`, and the application role has no `BYPASSRLS`.
- Schema-per-tenant and database-per-tenant are out of scope for version 1.

### 9.5 Connections

- Pool size per process comes from `DB_POOL_MAX`. Replicas times the total pool size per process (Better Auth shares the ORM pool, AUTH-09) MUST stay below the database connection limit.
- PostgreSQL deployments with many replicas SHOULD put PgBouncer in transaction mode in front. MySQL deployments MAY use ProxySQL.
- Read replicas from `DATABASE_READ_URLS` serve queries marked read-only, such as reports and large lists.

### 9.6 Read performance

- **DATA-10** List, export and report endpoints use read-only queries: no identity map tracking, only the requested or listed fields selected, relations loaded in one batched query per relation.
- **DATA-11** Large tables use keyset (cursor) pagination on an indexed, unique sort. `meta.total` is computed only when the client asks with `withTotal=true`, because exact counts are expensive on big tables.
- **DATA-12** Hot read paths MAY use the Kysely query builder that MikroORM 7 exposes, with the same tenant filter and permission conditions applied by BieberKit.
- **DATA-13** Query results MAY be cached with `cache.tags()`. Cache keys include a generation number per tag that is bumped right after commit, so an entry written by a racing read before the bump is never served afterwards. First-level memory caches use a short TTL (default 5 s) because the bus that clears them on other replicas is asynchronous. A user's reads go to the primary database for 5 s after their own write. This is done for lists and counts, after every commit of the user, through a store that is shared when there are several processes (`useReadYourWrites`). A failed purge is logged as a warning and never turns a committed write into an error.

### 9.7 Keys, uniqueness and translations

- **DATA-14** UUIDv7 keys are stored as native `uuid` on PostgreSQL, `BINARY(16)` on MySQL and `BLOB` on SQLite, and always appear as strings in the API.
- **DATA-15** On tenant-scoped entities, every unique constraint includes `tenant_id` automatically, so two tenants can use the same customer code.
- **DATA-16** On soft-deleted entities, unique indexes include a `deleted_token` column that is empty for live rows and unique for deleted ones. A deleted record therefore never blocks reuse of its code, on all three dialects.
- **DATA-17** Fields marked `.localized()` keep translations in a per-entity translation table, which works the same on all dialects. The API takes `?locale=` and falls back to the default locale. Slugs and SEO fields are localized (SEO-02, SEO-03).

* **DATA-18** Standard columns have fixed names and are added by entity options, never by hand: `id`, `tenant_id`, `version`, `created_at`, `updated_at`, `created_by`, `updated_by`, `deleted_at`, `deleted_token`. Plugins and generic features (audit, timeline, sync) rely on these names.
* **DATA-19** The current tenant is resolved once per request: from the X-Tenant header (or a /t/:tenant URL segment) checked against the user's memberships for admin and API calls, from the API key for machine clients, and from the domain mapping for public site calls. It never comes from mutable session state, so two tabs open on two tenants can never cross. A request with no resolvable tenant on a tenant-scoped route is rejected with 400.
* **DATA-20** Every write checks that each referenced id (relations, `owner`, `customerId` and so on) is visible under the current tenant filter and the user's CASL read rules. On every dialect, entities keep a single-column `id` primary key and add `UNIQUE (tenant_id, id)`, and relations between tenant-scoped entities use composite `(tenant_id, x_id)` foreign keys onto that pair, so the database rejects a cross-tenant reference even if application code is wrong (ADR 0008). The generated tenant tests cover both the two-tab case and the foreign-id case.

- **DATA-21** Every text field declares its comparison semantics: `exact` (default), `ci` (case-insensitive) or `ci_ai` (case- and accent-insensitive). `ci` and `ci_ai` use shadow columns that the application folds (Unicode NFC, lowercase, and for `ci_ai` also strip combining marks and map `đ` to `d`), compared with plain equality and a normal index. Native collations are not used, because they disagree across dialects (ADR 0008). So "Lê" and "Le", "đường" and "duong", or "LE01" and "le01" behave the same on every dialect. Contract tests run Vietnamese fixtures on all dialects. Bulk writes (`nativeUpdate`, `insert`) skip entity hooks, so they go through data-layer helpers that add the shadow values, and `bieberkit check` flags direct calls on entities that have compared fields (ADR 0009).
- **DATA-22** Money and decimals are stored as scaled integers (MOD-11), never as floating point and never as `DECIMAL`. This matters on SQLite, which stores DECIMAL values with fractions as REAL. Validation limits every money value to the safe integer range (±9,007,199,254,740,991) on all dialects, because SQLite returns integers to JavaScript as numbers.
- **DATA-23** SQLite runs in WAL mode with a busy timeout and starts write transactions with `BEGIN IMMEDIATE`, so web, worker and scheduler processes can share one file. MikroORM issues a plain `begin`, so `@bieberkit/data` provides the `BEGIN IMMEDIATE` through its own Kysely driver override (ADR 0008).
- **DATA-25** Two database roles: `MIGRATE_DATABASE_URL` owns the schema and runs DDL, `DATABASE_URL` is the application role with no DDL rights. On PostgreSQL and MySQL the application role has only INSERT and SELECT on `bk_audit_log`, which makes the audit log append-only in fact. On SQLite, triggers enforce the same rule. One migrate run is guaranteed by a lock row with a lease in `bk_migration_lock`: a second run waits, then finds nothing to do, and a crashed run frees the lock when its lease ends.
- **DATA-26** Standard options expand into constraints automatically. Every unique constraint on a tenant-scoped entity includes `tenant_id`, on a soft-deleted entity it also includes `deleted_token`, and a tenant-scoped entity gets `UNIQUE (tenant_id, id)` as the target of composite foreign keys (DATA-15, DATA-16, DATA-20, ADR 0009).

- **DATA-27** A SQLite table rebuild in a plugin step runs with foreign keys switched off (the runner sets the pragma, because it cannot change inside a transaction), since dropping the old table with foreign keys on silently cascades deletes into dependent tables. On MySQL and MariaDB DDL is not transactional, so a step has one DDL statement or guards every statement with `if not exists` or `if exists`, and `bieberkit check` flags steps that do not (ADR 0011).
- **DATA-28** Every table that the framework or a first-party plugin owns starts with `bk_`: `bk_migrations`, `bk_outbox`, `bk_audit_log`, `bk_auth_users`, `bk_jobs`, `bk_settings`, and the indexes and constraints that go with them (`bk_auth_users_email_unique`). The prefix keeps them apart from the tables of a project, which take the name of their module (`crm_deals`), so a project can never collide with the framework and a person who reads a database knows whose table it is. The same prefix names the metrics (`bk_http_request_duration_seconds`) and the API keys (`bk_...`).

## 10. Entities and modules

An entity is declared once with `defineEntity`, and BieberKit derives everything else from it. A module groups entities with the services, routes, jobs and events that belong to them.

### 10.1 Defining an entity

```ts
import { defineEntity, f, type EntityDef } from '@bieberkit/data'
import { User } from '@bieberkit/plugin-users'

export const Customer: EntityDef<'crm.Customer'> = defineEntity({
  name: 'crm.Customer',
  table: 'crm_customers',
  tenant: true,
  softDelete: true,
  fields: {
    id: f.id(),
    code: f.string({ max: 32 }).unique(),
    name: f.string({ max: 200 }).searchable().index(),
    email: f.email().optional(),
    tier: f.oneOf(['standard', 'gold', 'vip']).default('standard').index(),
    owner: f.belongsTo(() => User),
    createdAt: f.createdAt(),
    updatedAt: f.updatedAt(),
  },
  permissions: {
    read: 'crm.customer.read',
    create: 'crm.customer.create',
    update: 'crm.customer.update',
    delete: 'crm.customer.delete',
    fields: { email: { read: 'crm.customer.read-pii' } },
  },
  api: { list: true, get: true, create: true, update: true, delete: true },
  admin: { title: 'name', list: ['code', 'name', 'tier', 'owner'], icon: 'users' },
  label: { en: 'Customer', vi: 'Khách hàng', zh: '客户' },
})
```

`f.oneOf` produces a string union type. TypeScript enums are not used anywhere (P3). The type annotation on the exported constant is required by `isolatedDeclarations`. Row, create and update types come from the generated registry (SCH-04), not from the annotation.

### 10.2 What is derived

| Artifact | Derived from | Consumer |
| --- | --- | --- |
| MikroORM entity schema | `fields`, `table`, `tenant`, `softDelete` | Data layer, migrations |
| Zod schemas for create, update and read | `fields` | HTTP validation, client |
| REST routes | `api` | HTTP layer |
| OpenAPI 3.1 components and paths | Zod schemas, routes | Docs, client generator |
| CASL subject, actions and field masks | `permissions` | Authorization |
| Admin list, form and detail metadata | `admin`, `fields`, `label` | Admin UI |
| Test factories | `fields` | `@bieberkit/testing` |
| Generated permission tests | `permissions`, `api` | CI |

The compilers are pure functions over the entity descriptor. Design and spike results are in ADR 0009.

### 10.3 Modules

```ts
import { defineModule } from '@bieberkit/core'

export default defineModule({
  name: 'crm',
  entities: [Customer, Deal],
  services: { pipeline: PipelineService },
  routes: [dealRoutes],
  events: { 'crm.deal.won': DealWon },
  jobs: [syncCustomerStats],
  schedules: [{ job: syncCustomerStats, cron: '0 2 * * *' }],
  workflows: [closeDealWorkflow],
})
```

- **MOD-01** A module owns its tables. Other modules read them only through its published services or declared entity links.
- **MOD-02** Services are registered in the container and resolved by name, with full type inference and no decorators.
- **MOD-03** Cross-module side effects use events. Events that must survive a crash are written to an outbox table in the same transaction and dispatched by the worker role.
- **MOD-04** Multi-step operations that touch several modules or external systems are workflows. Each step declares a compensation that runs when a later step fails.
- **MOD-05** Lifecycle hooks (`beforeCreate`, `afterUpdate` and so on) are limited to the entity's own module. Other modules subscribe to events instead.

* **MOD-18** Outbox delivery is at least once with no ordering guarantee, because open-source BullMQ has no per-group ordering. Every event carries the record version, and subscribers ignore an event older than what they already applied. Processed event ids are recorded per subscriber so a redelivered event is skipped. The dispatcher claims rows with SKIP LOCKED in batches of 100 (one dispatcher on SQLite), wakes on LISTEN/NOTIFY on PostgreSQL and polls every second otherwise, deletes delivered rows and processed ids after 7 days, and exports dispatch lag as a metric. On MySQL and MariaDB the dispatcher deletes delivered rows one at a time by primary key and retries on a deadlock error, because range deletes deadlock between dispatchers. With the `database` queue driver the job insert joins the dispatcher's own transaction, so moving a row from the outbox to the queue is atomic, which SQLite requires. With BullMQ the stable `jobId` (`ob-<outbox id>`) absorbs a repeated dispatch (ADR 0010).

### 10.4 Actions and state machines

Management apps revolve around records that move through states (draft, submitted, approved) and buttons that do more than save. Both are first-class so they get permissions, audit, API and admin UI for free.

```ts
export const PurchaseOrder: EntityDef<'purchasing.PurchaseOrder'> = defineEntity({
  name: 'purchasing.PurchaseOrder',
  fields: {
    status: f.state({
      initial: 'draft',
      transitions: {
        submit:  { from: ['draft'], to: 'submitted', permission: 'purchasing.po.submit' },
        approve: { from: ['submitted'], to: 'approved', permission: 'purchasing.po.approve' },
        reject:  { from: ['submitted'], to: 'draft', permission: 'purchasing.po.approve', input: z.object({ reason: z.string().min(3) }) },
      },
    }),
    total: f.decimal({ precision: 14, scale: 2 }).computed((po) => sum(po.lines, 'amount')),
    lines: f.hasMany(() => PurchaseOrderLine).inline(),
  },
  actions: {
    duplicate: { permission: 'purchasing.po.create', handle: duplicatePurchaseOrder },
  },
})
```

- **MOD-06** Each transition and action becomes `POST /api/v1/<module>/<resource>/:id/actions/<name>`, a button in the admin UI shown only to users with its permission, an audit log entry, and an event such as `purchasing.po.approved`.
- **MOD-07** Transitions are validated on the server. A record can only change state through its declared transitions, never through a plain update.
- **MOD-08** Computed fields are calculated on save and stored when `stored: true`, so they can be filtered and sorted. Otherwise they are calculated on read.
- **MOD-09** `.inline()` child collections are edited inside the parent form and saved in the parent's transaction.
- **MOD-10** Runtime custom fields (fields added by administrators without code) are provided by an optional `custom-fields` plugin that stores values in a JSON column validated by a runtime schema. Filtering on them is limited to equality.

### 10.5 Domain helpers

- **MOD-11** Money uses `f.money({ currency })`: stored as an integer in the currency's minor unit plus a currency code, never as a float. Rounding follows the currency's minor unit (0 decimals for VND, 2 for USD) and is applied once, on save. The amount must stay within the safe integer range (DATA-22).
- **MOD-12** Document numbers (for example `PO-2026-00042`) come from `f.sequence({ pattern, resetEvery })`. Numbers are allocated per tenant inside the saving transaction, so they are unique and gap-free even with many concurrent writers.
- **MOD-13** Any entity can enable shared record features with `features: ['attachments', 'comments', 'timeline', 'tags']`. They are stored once in generic tables, carry the record's permissions, and appear as tabs in the admin detail screen.
- **MOD-14** Printable documents (invoices, purchase orders, delivery notes) are React templates rendered to PDF in the worker role (Q-09). Each template declares the entity it prints and the permission needed.

### 10.6 Schema pipeline

The field DSL (`f.*`) is the single source of truth, and it belongs to BieberKit, not to any library. At build and boot it compiles into every format the stack needs, so nothing is written twice and entity definitions never depend on a library's own API (P12). Descriptors are plain immutable data (`FieldDef`), and `defineEntity` returns a nameable `EntityDef<Name>`. `@bieberkit/data/schema` holds the descriptors, JSON Schema and Zod outputs and imports no ORM, so the client and the admin can use it. `@bieberkit/data/orm` is the only module that imports MikroORM, and the CASL compiler lives in `@bieberkit/auth` (ADR 0009).

| Output | Used by | Why this format |
| --- | --- | --- |
| MikroORM entity metadata | Data layer, migrations | Portable across the three dialects |
| JSON Schema 2020-12 | Ajv request validation, fast-json-stringify responses, OpenAPI 3.1 | Validation and serialization schemas for Fastify (serialization drops fields that are not in the schema), standalone modules at build, and the native schema language of OpenAPI |
| Zod 4 Mini schemas | Admin forms, site forms, generated client | Small, tree-shakable client bundles with the same rules as the server |
| TypeScript types | Services, client, tests | End-to-end type safety without hand-written interfaces |
| CASL subjects and field masks | Authorization | Permissions follow the same field names |

- **SCH-01** Custom routes and jobs MAY use any Standard Schema library, Zod 4 by default. Their schemas are converted to JSON Schema for OpenAPI and serialization. Rules that JSON Schema cannot express (custom refinements) run as a second validation step.
- **SCH-02** Changing the ORM, the validator or the client generator changes only the compiler targets, never entity definitions.

* **SCH-03** The DSL defines one meaning for every rule, and both validators are generated to match it. String lengths count Unicode code points, so a Vietnamese or emoji-containing value gets the same answer on server and client. Shared fixtures run through Ajv and Zod Mini in the generated contract tests, and any disagreement fails CI. Ajv and Zod 4 Mini both count code points by default, so only the NFC step (SCH-05) has to run before either of them (ADR 0009).
* **SCH-04** Entity, client and permission types are generated into `.bieberkit/types/` by `bieberkit dev` and `bieberkit build`, instead of being inferred through deep generic types. This keeps type checking and editor feedback fast as projects grow to hundreds of entities. Entity files declare `EntityDef<Name>`, a type with no field generics, and `Row<Name>`, `CreateInput<Name>` and `UpdateInput<Name>` resolve through a generated `EntityRegistry` interface, which also keeps entity files valid under `isolatedDeclarations` (ADR 0009).

- **SCH-05** Every string input is normalized to Unicode NFC at the validation boundary, so Vietnamese typed in decomposed form (NFD, common on macOS and some input methods) gets the same length, uniqueness and slug as composed text.
- **SCH-06** Ajv validators and fast-json-stringify serializers are emitted as standalone modules at build. The web role loads them instead of compiling thousands of schemas at boot, which protects the cold start target. The generated validators `require` Ajv's runtime helpers and `ajv-formats`, so both ship in the web role.
- **SCH-07** `f.custom({ column, jsonSchema, zod, tsType, admin })` is the only way to add a field kind in version 1. `zod` is a schema value. An option that receives a library namespace (`(z) => ...`) is not allowed, because it keeps all of the library in the client bundle (28 KB against 426 KB measured, ADR 0009).
- **SCH-08** Entity files import only `@bieberkit/data`. Hand-written MikroORM entities, the escape hatch, live in separate `*.orm.ts` files and are registered next to generated entities, and `orm: { indexes, properties }` on an entity merges extra metadata into the generated schema. `bieberkit check` reports both uses (ADR 0009).

### 10.7 Workflows

- **WF-01** A workflow is a list of named steps declared with `defineWorkflow`, each with `run` and `compensate`. Workflows run in the worker role.
- **WF-02** Workflow state (current step, input, outputs of finished steps) is saved to the database after every step, so a crash resumes from the last finished step instead of starting over.
- **WF-03** Steps are idempotent and retried with backoff. When a step fails for good, the compensations of finished steps run in reverse order, and the workflow ends as `compensated`, or as `failed` for manual review.
- **WF-04** A workflow MAY wait for an event or a timer (payment confirmed, three days passed) without holding a worker.
- **WF-05** Human approvals are entity state transitions (section 10.4). A workflow waits for the transition event, so approval rules never hide inside workflow code.
- **WF-06** Running, waiting and failed workflows are visible in the admin UI with retry and cancel actions.

## 11. Plugin system

A plugin is a module packaged for reuse, with a manifest that the CLI and the kernel can read without running its code. Plugins are npm packages, installed and upgraded like any dependency.

### 11.1 Manifest

```ts
import { definePlugin, env } from '@bieberkit/core'
import { defineExtension, f } from '@bieberkit/data'

const PageSeo = defineExtension({
  table: 'seo_page_ext',
  fields: { seoTitle: f.string({ max: 70 }).optional(), noindex: f.boolean().default(false) },
})

export default definePlugin({
  name: '@bieberkit/plugin-seo',
  version: '1.0.0',
  core: '^1.0.0',
  requires: { '@bieberkit/plugin-pages': '^1.0.0' },
  dialects: ['postgres', 'mysql', 'sqlite'],
  env: { SEO_SITEMAP_CRON: env.string().default('0 3 * * *') },
  entities: [SeoMeta],
  extends: { 'pages.Page': PageSeo },
  permissions: ['seo.read', 'seo.manage'],
  jobs: [generateSitemap],
  schedules: [{ job: generateSitemap, cron: 'SEO_SITEMAP_CRON' }],
  admin: { menu: [{ label: 'SEO', path: '/seo', permission: 'seo.read' }] },
  seed: seedDefaults,
})
```

| Field | Required | Meaning |
| --- | --- | --- |
| `name`, `version` | yes | npm name and version |
| `core` | yes | Supported `@bieberkit/core` range |
| `requires` | no | Other plugins and their version ranges |
| `conflicts` | no | Plugins that cannot be installed together with this one |
| `dialects` | yes | Supported database dialects |
| `env` | no | Environment keys, prefixed with the plugin name |
| `entities`, `extends` | no | Own entities and declared extensions of other plugins' entities |
| `permissions` | no | Permission strings, prefixed with the plugin name |
| `routes`, `jobs`, `schedules`, `events`, `workflows` | no | Runtime contributions |
| `admin` | no | The admin paths, for the check of collisions. The screens are the export `./admin` (UI-34), not a part of this object |
| `seed` | no | Idempotent seed function |

In `package.json` the `bieberkit` field holds `core`, `dialects`, `requires`, `conflicts` and the key lists `env`, `tables`, `routes`, `permissions` and `admin`. `name` and `version` come from `package.json`, and `bieberkit build` writes the field from `definePlugin` (ADR 0011).

### 11.2 Resolution

1. Collect manifests of all plugins listed in `bieberkit.config.ts`.
2. Check `core` ranges, `requires`, `conflicts` and `dialects`.
3. Sort topologically. A cycle is an error.
4. Detect collisions in table names, route paths, permission strings, env keys and admin paths.
5. Boot plugins in dependency order. Shut them down in reverse order.

The same resolver runs in the scaffolder, in `bieberkit add`, and at kernel boot, so a project that boots is a project that resolves.

The resolver is one pure function that reports every problem together, each with a stable code: `PLG_CORE_RANGE`, `PLG_DIALECT`, `PLG_MISSING_REQUIRE`, `PLG_REQUIRE_RANGE`, `PLG_CONFLICT`, `PLG_CYCLE`, `PLG_COLLISION_TABLE`, `PLG_COLLISION_ROUTE`, `PLG_COLLISION_PERMISSION`, `PLG_COLLISION_ENV`, `PLG_COLLISION_ADMIN`, `PLG_PREFIX_ENV` and `PLG_PREFIX_PERMISSION`. Env keys start with the plugin's short name in upper case (`SEO_`) and permissions with the short name and a dot (`seo.`), so env and permission collisions can only come from two plugins with the same short name in different scopes. The boot order is topological with ties broken by name, so it does not depend on input order (ADR 0011). `definePlugin` raises the name, version, range, dialect and prefix codes (`PLG_NAME`, `PLG_BAD_VERSION`, `PLG_BAD_RANGE`, `PLG_DIALECT`, `PLG_PREFIX_ENV`, `PLG_PREFIX_PERMISSION`) when the plugin is built. The manifest check reports `PLG_MANIFEST_NAME`, `PLG_MANIFEST_VERSION`, `PLG_MANIFEST_MISSING` or `PLG_MANIFEST_STALE`. The short name of a plugin drops the scope and a leading `bieberkit-plugin-` or `plugin-`.

### 11.3 Extension points

| Extension point | Mechanism |
| --- | --- |
| Add fields or relations to another plugin's entity | `extends`, stored in an extension table owned by the extending plugin, joined automatically, and exposed in the target's API and admin form |
| React to something that happened | Event subscription, optionally through the outbox |
| Call another plugin's logic | Published service from the container |
| Add admin screens | The admin part of the plugin, its export `./admin`, in the slots of UI-35 |
| Add background work | `jobs`, `schedules` |
| Change HTTP behavior | Fastify plugin scoped to the plugin's own routes |
| Declare a setting that the admin can change | `settings: [defineSetting(...)]`; each key of a plugin starts with its short name and a dot (`PLG_PREFIX_SETTING`, ADR 0030, SET-01) |

### 11.4 Rules

- **PLG-01** A plugin MUST NOT import files from another plugin except through that plugin's public entry point. `bieberkit check` enforces this.
- **PLG-02** A plugin MUST NOT query another plugin's tables directly.
- **PLG-03** `bieberkit remove` lists the data the plugin owns and asks before generating a migration that drops it.
- **PLG-04** Plugins run in-process with full trust. There is no sandbox, so projects SHOULD install only first-party or reviewed plugins. This is documented on the plugin page.
- **PLG-05** First-party plugins are named `@bieberkit/plugin-<name>`. Community plugins SHOULD be named `bieberkit-plugin-<name>`.

* **PLG-07** Each plugin publishes a static manifest in the `bieberkit` field of its `package.json`: `core`, `dialects`, `requires`, `conflicts` and the key lists `env`, `tables`, `routes`, `permissions` and `admin`. The CI check compares canonical text (keys sorted), so only a real difference fails it. It is generated from `definePlugin` at plugin build and checked against it in CI. The scaffolder reads first-party manifests bundled in `create-bieberkit`, so it can resolve the graph before anything is installed. Route collisions are checked again at kernel boot.

- **PLG-06** Fields a plugin adds to another plugin's entity live in the extending plugin's own 1:1 extension table, never as columns in the target table. Ownership stays clear (MOD-01), the target plugin can upgrade its schema freely, and removing the extending plugin drops only its own table. The plugin declares them with `extends: { '<module>.<Entity>': defineExtension({ table, fields, permissions? }) }` (ADR 0033). The table has one row for each row of the target, found by a unique foreign key to it that is deleted with it (composite with `tenant_id` for a tenant target), and its fields are merged into the API, the metadata and the types of the target. They are read in one batched query and written in the transaction of the target, whose `version` covers them. A field that the target or another extension has, an unknown target and a table that is taken are boot errors (`DATA_EXTENSION_FIELD_CLASH`, `DATA_EXTENSION_TARGET_UNKNOWN`, `DATA_EXTENSION_TABLE_CLASH`). Filtering and sorting by an extension field, relation fields, and targets with hand-written routes are not supported yet.

- **PLG-08** The resolver accepts exact versions, `^`, `~`, `>=` and `*`, and rejects pre-release tags, `||`, partial versions and `x` ranges with `PLG_BAD_RANGE`, so it needs no dependency (PKG-04). Plugin authors see the error when they build (ADR 0011).

## 12. Starter templates

A template is a preset of plugins, configuration and seed data. After creation the project owns its configuration, and plugins keep upgrading as dependencies.

| Template | Plugins on top of `blank` | Seeded with |
| --- | --- | --- |
| `blank` | users, roles, settings, audit-log, notifications, media | Administrator account, base roles |
| `cms` | pages, posts, categories, tags, menus, seo, theme, redirects | Home page, sample post, main menu |
| `crm` | contacts, companies, deals, pipelines, activities, tasks, imports | Default pipeline and stages |
| `saas` | tenants, teams, invitations, plans, subscriptions, api-keys, usage | Demo tenant and plans |

- Each `blank` plugin brings its own admin screens (UI-34). There is no `auth-ui` plugin: the account screens are those of `users` (UI-26).
- The `blank` plugins form the shared base that every management app needs, so they are built and hardened first.
- Billing in `saas` ships with a payment driver contract and a manual-invoice driver. Payment providers are separate plugins.
- A template is a file `template.ts` in `templates/<name>/` that lists plugins, config defaults, seeders and the admin menu order. Adding a template needs no change to the scaffolder.

The `cms` template includes the server-rendered public site (section 16.2) by default. Other templates add it with `--site`.

### 12.1 Base-plugin platform (slice S0)

The base plugins use the framework services below. Full users/roles, settings, notifications, media, audit-log and enterprise behavior is delivered in later slices of [the complete base-plugins design](../modules/base-plugins-complete.md).

- **BPL-01** The auth user row MUST carry `disabledAt`, `disabledReason` and `disabledBy`. `disableUser` MUST set that state, revoke the user's database sessions and record `users.user.disabled` in one transaction. `enableUser` clears the state and records `users.user.enabled`. Repeating either state change is a no-op; an unknown user is `USERS_NOT_FOUND` (404). Sign-in session creation and cookie/API-key authentication MUST refuse a resolved disabled user with `AUTH_USER_DISABLED` (403). Authentication MUST check current user status even when secondary storage still holds an enabled-user snapshot. Cookie authentication MUST also verify that its durable session still exists, including on native auth routes when an API key is present. Session issuance MUST serialize its insert with disable/enable. Enabling MUST NOT revive a revoked cached session. A revoked session follows the normal unauthenticated path.
- **BPL-02** The plugin service registry MUST expose typed `mail`, `queue` and `cache` services in every process role and seeders. Web processes MAY dispatch to the database queue without starting a worker. Reset and verification callbacks MUST send through the mail contract; inside a transaction they MUST write a `mail.send` outbox intent and deliver only after commit. Failed initialization MUST release acquired resources and preserve the original error. `createTestApp` MUST register the same contracts backed by memory and a sync queue, expose the sent `mailbox`, and provide `runOutbox()` to dispatch one committed batch explicitly.
- **BPL-03** A plugin MAY publish a named service through its `services` declaration. Other plugins consume it through `ServiceRegistry` declaration merging and `RouteContext.services`. Registering a service name twice MUST fail with `CORE_SERVICE_DUPLICATE`; this uses the existing module/container mechanism.
- **BPL-04** Modules MAY contribute `subscriptions` mapping an outbox event to a registered job, optionally mapping the message to its input. Boot, seed and test-app wiring MUST apply these mappings. An unregistered subscription job MUST fail at registration with `QUEUE_JOB_UNKNOWN` (500). A rolled-back transaction MUST leave no event for the job to consume. Delivery follows Q-01 and MOD-18, including the stable outbox job id; consumers remain idempotent. One event has one job mapping, and a second subscription MUST fail with `QUEUE_SUBSCRIPTION_DUPLICATE` (500) on every driver. Deleting a media object after commit applies this mechanism (MED-03). The sync driver runs a subscribed job after the transaction of the dispatcher that published it, as the other drivers do, so the job may use the database; `queue.settle()` waits for such jobs, and the test app's `runOutbox()` calls it.
- **IDN-01** The auth user row MUST carry `source` (non-null, default `local`) and nullable `externalId`, unique together within a provider. Several users MAY have no external id. These columns and BPL-01 status columns are additive auth migration steps at version 0.5.0 and are declared through Better Auth's non-input `additionalFields`. Provider-managed editing and provisioning are later slices.

BPL-05/BPL-06 and IDN-02/IDN-03 remain proposals in the design for the slices that implement them; S0 does not claim their acceptance tests.

### 12.2 Users and roles (slice S1)

The logic is in `@bieberkit/auth` (`createUserService` and the role service); the `users` and `roles` plugins are thin routes over it. Every mutation below writes its audit entry in the same transaction (BPL-05), with the action `users.user.<verb>` or `auth.role.<verb>`, and every list uses a keyset cursor with a page of at most 100 and `withTotal` (BPL-06).

- **USR-01** `GET /api/v1/users/users` MUST filter by `q` (a prefix of `lower(name)` or of the email, served by an index), `role`, `status` (`active`, `disabled`, `invited`), `emailVerified` and a `createdFrom`/`createdTo` range, and sort by `createdAt`, `name` or `email`, ascending or descending (`-`). Order and range of creation use the UUIDv7 id. The answer has the meta of the entity routes (`pageSize`, `nextCursor`, `total` with `withTotal`). A row carries `status`, `source`, `roles` (id and name), `mfaEnabled` and `lastSignInAt`. The auth user row carries `lastSignInAt`, written when a session is made, and `deletedAt` (auth migration 0.6.0).
- **USR-02** `GET .../users/:id` MUST return the row and `activeSessions`, the number of unexpired sessions.
- **USR-03** `POST .../users` takes a password or `invite: true` (one of the two) and `roles`, given in the same transaction. A password outside 8 to 128 characters is `USERS_CREATE_REFUSED` (400) with that policy (AUTH-04); a taken email is `USERS_EMAIL_TAKEN` (409).
- **USR-04** `PATCH .../users/:id` changes the name and the email only. A changed email MUST become unverified and a verification mail is sent through the outbox.
- **USR-05** `POST .../:id/disable` (with a `reason`) and `.../enable` change the state of BPL-01. `status` is `invited` for an account that has never signed in and has no verified email.
- **USR-06** `DELETE .../users/:id` MUST, in one transaction, anonymize the row (`deleted-<id>@invalid`, empty name, `source` local, no external id, `deletedAt` set) and remove its sessions, accounts, role memberships, second factors, passkeys, API keys and links. Audit rows stay. A deleted user is never listed, found or given a session, and the email is free again.
- **USR-07** Nobody disables, deletes, resets the MFA of, or takes the administrator role (the system role `admin`) from themselves: `USERS_SELF_ACTION` (409). The last active holder of the administrator role in a tenant cannot be disabled, deleted or lose the role, also when the system asks: `USERS_LAST_ADMIN` (409). The check locks the role first, so two changes at the same time leave one administrator.
- **USR-08** `GET .../:id/sessions` lists the unexpired sessions (id, IP, user agent, created, last used) without tokens; `DELETE .../:id/sessions/:sessionId` and `DELETE .../:id/sessions` revoke them. Permission `users.revoke-sessions`.
- **USR-09** `POST .../:id/reset-password` (202) sends a reset link through the outbox. The answer never holds a token. It is limited per target user and per administrator (AUTH-06): `USERS_RATE_LIMITED` (429) with `Retry-After`.
- **USR-10** An invited user has no credential account. The invitation is a link of Better Auth's `/reset-password`, valid for `USERS_INVITE_TTL_DAYS` (default 7); using it sets the first password and verifies the email. When the admin is installed, the link comes back to `<admin>/reset-password` (the address of `ADMIN_URL`) with `invite=1`; a reset link of USR-09 comes back to the same page without it, and a project without the admin keeps `<origin of APP_URL>/reset-password`. `POST .../:id/resend-invite` (202) replaces the old link and is `USERS_NOT_INVITED` (409) for a user who is not invited. This is the only invitation path.
- **USR-11** `POST .../:id/mfa/reset` (204, permission `users.reset-mfa`) removes the TOTP secret and the passkeys and revokes the sessions; the user is told by mail.
- **USR-12** `GET` and `PATCH /api/v1/users/me` read and rename the signed-in person. `GET` carries `mfaRequired`: true when a role of the person has `requireMfa` or `security.mfa.required-for-all` is on; anything else of one's own account stays on the Better Auth endpoints.
- **ROL-01** `GET /api/v1/roles/roles/:id` returns the role with `memberCount`; `GET .../:id/members` pages its holders.
- **ROL-02** `POST .../roles/:id/assign` and `.../revoke` take 1 to 100 `userIds` and answer a result for each (`assigned`, `revoked`, `unchanged`, `not_found`, `refused` with a code), in one transaction; a refused user does not undo the others.
- **ROL-03** `POST .../roles/:id/duplicate` makes a non-system role with the permissions of the source and the given name.
- **ROL-04** `GET /api/v1/roles/permissions` returns each permission with `module`, `resource` (or null) and `action`, split from its name.
- **ROL-05** `GET /api/v1/users/users/:id/permissions` returns the effective permissions of a user in the tenant, each with the roles that grant it; the service adds the condition of a scoped permission when it is given the scoped permissions.
- **ROL-06** Deleting a role with members MUST be refused with `ROLES_IN_USE` (409) and `memberCount`, unless `reassignTo` names a role of the same tenant that the members move to. System roles stay unchangeable, except `requireMfa`: only a holder of the administrator role changes it (anyone else gets `ROLES_ESCALATION`, 403, audited), and a holder without a second factor cannot turn it on for a system role that they hold (`ROLES_SELF_LOCKOUT`, 409). The system (a seeder, the CLI) is not limited.
- **ROL-07** Giving a role with `requireMfa` to a user without a second factor succeeds with the warning `AUTH_MFA_ENROL_REQUIRED`.
- **ROL-08** A person creates, changes, copies, reassigns into or gives a role only with permissions that they hold in the tenant; a holder of the administrator role, in the tenant or the nil tenant, may grant anything, and a system role is given only by one of its holders. A refusal is `ROLES_ESCALATION` (403) and is audited as `authz.denied`. The system (a seeder, the CLI) is not limited.

In a tenant, the users routes see only the holders of a role in that tenant; without a tenant or in the nil tenant they see every user. A user outside the scope is `USERS_NOT_FOUND`.

### 12.3 Settings (slice S2)

A setting is declared in code with `defineSetting` of `@bieberkit/core` and contributed under `settings` by a plugin or a module (ADR 0030). The `settings` plugin stores values, serves them through its `settings` service and its routes, and owns nothing else.

- **SET-01** A setting MUST be declared before it is used: `key` (dotted, lower case, at most 120 characters, starting with the plugin's short name for a plugin), `type` (`string`, `number`, `boolean`, `enum` with `values`, or `json` with a `parser`), `default` (which MUST pass the setting's own check), `label`, and optionally `description`, `group`, `scope` (`global` by default, or `tenant`), `public` and `secret` (never both). A bad declaration is `CORE_SETTING_INVALID`. A key declared twice is `SETTINGS_DUPLICATE_KEY` at boot. Any route or service call with an undeclared key is `SETTINGS_UNKNOWN_KEY` (404).
- **SET-02** There is one way to write a value: `GET /api/v1/settings/settings`, `GET .../settings/:key`, `PUT .../settings/:key` with `{ value }`, validated against the declaration (`SETTINGS_INVALID_VALUE`, 422), and `DELETE .../settings/:key`, which goes back to the default. The entity `settings.Setting` has no generated routes.
- **SET-03** A `secret` value MUST be encrypted at rest (SEC-08). It MUST never be returned: a read shows `"********"` and `hasValue`. It MUST never appear in audit data. Writing one needs `settings.manage`.
- **SET-04** A `tenant` setting has a value for each tenant. A read falls back to the global value, then to the default. A tenant never sees another tenant's value. A `global` setting MUST be changed only outside a tenant (or in the nil tenant): from inside a tenant it is `SETTINGS_SCOPE_REFUSED` (403), so one tenant never changes what all tenants read.
- **SET-05** Services read through `settings.get(def, { tenantId })`, typed by the declaration. Reads are cached under the tag `settings` and invalidated after commit (DATA-13). When the cache fails, a read falls back to the database, and then to the default.
- **SET-06** A change or a reset writes `settings.setting.updated` or `settings.setting.reset` with the key, the old value and the new value (the key only, for a secret) in the transaction of the change.
- **SET-07** `GET /api/v1/settings/public` returns the `public` settings without a session, with the cache headers of a public GET (API-09).

### 12.4 Notifications (slice S3)

- **NTF-01** The `notifier` service sends `{ to, title, body, level, category, link, data, channels, dedupeKey, expiresAt }` in the transaction of the caller when one is open. `to` is a user id, up to 100 user ids, or `{ role }` in the tenant of the request. A role with more than 100 holders writes the outbox event `notifications.expand`, and its job sends in batches of 100 after commit. An unknown role is `NOTIFICATIONS_ROLE_UNKNOWN` (404), a bad input `NOTIFICATIONS_INVALID` (400).
- **NTF-02** A notification has `level` (`info`, `success`, `warning`, `error`), `category` (default `general`), `link`, `data` (JSON), `dedupeKey` (unique for each user) and `expiresAt`. A second send with the same `dedupeKey` to the same user does nothing.
- **NTF-03** The signed-in person has `GET /api/v1/notifications/me` (filters `unread` and `category`, newest first, keyset cursor, page of at most 100, `withTotal`), `GET .../me/unread-count`, `POST .../me/:id/read`, `POST .../me/read-all` and `DELETE .../me/:id`, under `notifications.read-own`, `.update-own` and `.delete-own`. Another person's notification is `NOTIFICATIONS_NOT_FOUND` (404). An expired notification is not shown.
- **NTF-04** `GET` and `PUT /api/v1/notifications/me/preferences` hold, for each category and channel (`in-app`, `mail`), whether it is on. A missing preference is on. A send honours the preference of each channel; mail is a `mail.send` outbox intent, sent after commit (M-01).
- **NTF-05** The job `notifications.prune`, on the schedule `17 3 * * *`, deletes read notifications older than `NOTIFICATIONS_RETENTION_DAYS` (default 90) and every expired one. A module contributes schedules as `schedules: [{ job, cron, input? }]`, and the scheduler role runs them under the lock of Q-07.
- **NTF-06** Each created notification emits `notifications.created` with its id, user, level and category, for the realtime layer of M2.4.
- **NTF-07** Support keeps `list`, `get` and `delete` of the entity under `notifications.read` and `notifications.manage`; creating is `POST /api/v1/notifications/send` under `notifications.send` (202, `{ created, queued }`). Each change by a person or a job is audited as `notifications.<noun>.<verb>`.

### 12.5 Media (slice S4)

The logic is in the `media` service of the plugin; the routes under `/api/v1/media` are thin over it, and `media.Media` and `media.Folder` are tenant entities with no generated routes. Every change writes its audit entry `media.file.<verb>` or `media.folder.<verb>` in its transaction (BPL-05), and every list uses a keyset cursor with a page of at most 100 (BPL-06).

- **MED-01** `POST /api/v1/media/media` takes `filename` (one safe path segment with an extension), `contentType`, `size`, `visibility` (`private` by default, or `public`), `alt`, `description` and `folderId`. The visibility is fixed when the record is made and is the key prefix of S-05: the object lives at `<visibility>/<tenant>/media/<id>/<filename>`. Nothing changes it later; another visibility is a new upload.
- **MED-02** `GET .../media/:id/url` answers `{ url, expiresAt }` for a `ready` file: the public URL of a public file, a signed URL of five minutes for a private file, and, on a disk that cannot sign, the URL of `GET .../media/:id/content`, which streams the file after the permission check with its verified type, `X-Content-Type-Options: nosniff` and `Content-Disposition: attachment`. A private file never gets a public URL. A file that is not `ready` is `MEDIA_NOT_READY` (409).
- **MED-03** `DELETE .../media/:id` removes the record and writes the outbox event `media.file.deleted` with the path in the same transaction; a subscription (BPL-04) gives it to the job `media.delete-object`, which deletes the object after commit, retries up to 10 times and is left dead on a final failure. The job `media.prune-pending`, on the schedule `41 * * * *`, deletes the records still `pending` after `MEDIA_PENDING_TTL_HOURS` (default 24) in every tenant, with their objects, through the same event (`media.file.expired`).
- **MED-04** Confirm stores the SHA-256 of the bytes (`checksum`, hex), read from the storage before the transaction. `PATCH .../media/:id` changes `alt`, `description` and `folderId` only; any other field is a validation error, and an unknown folder is `MEDIA_FOLDER_NOT_FOUND` (404).
- **MED-05** Folders are `bk_media_folders`: `GET /api/v1/media/folders?parentId=`, `POST` (`name`, `parentId`), `PATCH .../:id` (renames) and `DELETE .../:id`. A name is unique inside its parent (`MEDIA_FOLDER_NAME_TAKEN`, 409), a folder is at most 8 deep (`MEDIA_FOLDER_TOO_DEEP`, 422), and a folder with files or folders is not deleted (`MEDIA_FOLDER_NOT_EMPTY`, 409). Files have the `tags` feature (MOD-13).
- **MED-06** `GET /api/v1/media/media` filters by `q` (a prefix of the filename in any case), `kind` (`image`, `video`, `audio`, `document`, `other`, from the type), `folderId`, `status`, `visibility`, `sizeMin`/`sizeMax` and `createdFrom`/`createdTo` (on the UUIDv7 id), newest first, with `withTotal`.
- **MED-07** `MEDIA_MAX_SIZE_MB` (default 25), `MEDIA_ALLOWED_TYPES` (MIME types; default the images, PDF, text, CSV and Office types) and an optional `MEDIA_TENANT_QUOTA_MB` are checked when the record is made and again before a signed upload URL is given: `MEDIA_TOO_LARGE` (413), `MEDIA_TYPE_REFUSED` (422), `MEDIA_QUOTA_EXCEEDED` (422). The quota counts the `pending` and `ready` files of the tenant. The storage policy (S-02) applies on top.
- **MED-08** A file is `pending`, `ready` or `rejected`. Confirm makes it `ready` with the size and the type that the storage verified, and emits `media.file.confirmed` with `{ id, path }` for a scanner (S-02). Bytes that the storage refuses leave the record `rejected` (audited, kept) with no object, and answer `STORAGE_UPLOAD_REJECTED` (422). Confirming a file that is not `pending` is `MEDIA_NOT_PENDING` (409), and a ready file gets no second upload URL (`MEDIA_ALREADY_READY`, 409).

### 12.6 Audit log (slice S5)

The `audit-log` plugin only reads: its four routes are `GET`, and the application role cannot change or delete an audit row (DATA-25). Every list uses a keyset cursor with a page of at most 100 and `withTotal` (BPL-06).

- **AUD-01** `GET /api/v1/audit-log/entries` filters by `from` and `to` (on `at`), `action` (exact, or a prefix when it ends in `*`), `entity`, `recordId`, `actorId` and `requestId`, newest first.
- **AUD-02** `GET .../entries/:id` returns one entry. An entry carries `actor` (`id`, `name`, `email` from the auth tables), or `null` when the system wrote it. An unknown entry, or one of another tenant, is `AUDIT_NOT_FOUND` (404).
- **AUD-03** `GET /api/v1/audit-log/export?format=csv|ndjson` takes the filters of AUD-01 and streams the entries by keyset pages, at most `AUDIT_LOG_EXPORT_MAX_ROWS` (default 100 000). When more match, the answer carries `X-Export-Truncated: true`. A CSV cell that starts with `=`, `+`, `-`, `@`, a tab or a carriage return starts with `'` (IO-04). The export writes `audit-log.entries.exported` with its format and filters before the first byte. Permission `audit-log.export`.
- **AUD-04** `GET .../audit-log/actions` returns the distinct actions in order, cached for 60 seconds.
- **AUD-05** In a tenant, every read sees the entries of that tenant only. Without a tenant, or in the nil tenant, a reader sees every tenant.
- **AUD-06** Retention is `bieberkit audit:prune --before <date>`, on `MIGRATE_DATABASE_URL` only. It prints the count of entries before the date and deletes them only with `--yes`, in one transaction that also writes `audit.pruned` with the date and the count. On SQLite the append-only trigger is lifted and made again inside that transaction. No route and no job of the application deletes audit rows.

### 12.7 Security policies (slice S6, first part)

The policies of sessions, second factors and networks are settings of the group `security`, declared by `@bieberkit/auth` and read on every request through the `PolicyReader` port that the server fills from the settings service (ADR 0031). A change shows within two seconds, because the server keeps the policy for that long, and needs no restart. If the settings cannot be read, the last good policy is used, and with none the request fails (`getStrict` of the settings service). Their keys are kebab-case, as every setting key is. Each default is what a single person gets: nothing is asked of them.

- **POL-01** `security.session.idle-minutes` (0, off), `security.session.absolute-hours` (0, the lifetime of Better Auth) and `security.session.max-concurrent` (0, off). A session older than the absolute limit, or without a request for the idle time, is refused with `AUTH_SESSION_EXPIRED` (401). At sign in the oldest sessions beyond the maximum are revoked and the new one stays. The idle time is the `updatedAt` of the session, which a request writes at most once a minute. Overrides per role are not part of this slice.
- **POL-02** `security.mfa.required-for-all` (off) and `security.mfa.grace-days` (7). A user without a second factor may sign in until the grace ends, counted from the later of the day the rule was turned on (`security.mfa.required-since`, which the settings service writes) and the account. `GET /api/v1/users/me` then carries `mfaEnrolBy`. After the grace the cookie is refused with `AUTH_MFA_ENROL_REQUIRED` (403); the native auth routes still work, so the user can enrol.
- **POL-03** `security.network.admin-allowlist` (empty, no limit) is a list of CIDR ranges, IPv4 or IPv6. A role flagged `ipRestricted` (auth migration 0.7.0, shown and set by the roles routes) can be used only from those ranges. The address is the one resolved through `TRUST_PROXY`. With a list set, an unknown or malformed address is refused: the check fails closed. A refusal is `AUTH_NETWORK_DENIED` (403) and is audited as `auth.network.denied`.
- **POL-04** `security.sign-in.notify-new-device` (on). The first sign in from a device that a user has not used before, when they have used another, sends a mail (`sendNewDevice`). A device is the hash of its user agent, kept in `bk_auth_known_devices` (auth migration 0.7.0). A failure of the notice never refuses the sign in.
- **POL-05** Every policy has a validated range (a lifetime of at most 365 days, a CIDR list). A declaration may carry a `guard`. A change that the guard says would lock out the person who makes it is refused with `SETTINGS_SELF_LOCKOUT` (409): an allowlist without their own address, or the rule for everyone while they have no second factor.

### 12.8 Managed identities and delegated administration (slice S6, second part)

- **IDN-02** A user whose `source` is not `local` is managed by that provider. The users routes refuse to change its name, email and disabled state with `USERS_MANAGED_EXTERNALLY` (409), also for the signed-in person on `PATCH /users/me`, unless the caller holds `users.override-external`. Local roles can still be given. Changes that touch no managed field are not refused.
- **IDN-03** The user service gives provider plugins `upsertExternalUser` and `setExternalDisabled`. A source is `sso:<provider>` or `scim:<provider>` and an external id has 1 to 255 characters (`USERS_EXTERNAL_INVALID`, 400). An identity is found by `(source, externalId)`. A new user is verified, has no password and signs in only through the provider. An email that another user holds is `USERS_EMAIL_TAKEN`, so a provider cannot take over an account. Disabling ends the sessions and keeps the last active administrator (`USERS_LAST_ADMIN`). The audit entries are those of a local change, written by the system, and name the provider in `data.provider`.
- **ROL-08** A role is created, changed or assigned only with permissions that the actor holds (`ROLES_ESCALATION`, 403, audited). The administrator role is exempt, and a system role is not given by anybody else.
- **ROL-09** A role can be given to a user for one group only (`groupId` on `POST .../roles/:id/assign`). The project puts users in groups with `PUT /api/v1/users/users/:id/groups` or `groups` on create, 1 to 50 groups of 1 to 120 characters, and the framework knows no organization model. A caller whose roles with `users.*` permissions are all limited to groups sees and changes the users of those groups only: a user outside them is `USERS_NOT_FOUND` (404), and a new user or a move must stay inside them (`USERS_OUT_OF_SCOPE`, 403). A role given without a group, the administrator role and an API key are not limited. Auth migration 0.7.0 adds `bk_auth_user_roles.scope_group` and `bk_auth_user_groups`. A change of groups is audited as `users.user.groups-changed`.

### 12.9 Audit for an enterprise (slice S6, third part)

- **AUD-07** `AUDIT_LOG_MIRROR=true` (default off) writes every audit entry to the outbox in the transaction that wrote it, and a worker job logs it after commit as one structured line with `audit: true`, so a log shipper delivers it to a SIEM or to storage that the database administrator cannot change. The line goes through the logger, so SEC-09 redaction applies, and the entry already had its personal data masked. The request never waits for it.
- **AUD-08** `GET /api/v1/audit-log/entries` and `GET .../export` take `after=<entry id>` and then read oldest first, each entry once. `meta.nextAfter` is the id to resume from. `after` and `cursor` together, or an `after` that is not an id, are `AUDIT_AFTER_INVALID` (400).
- **AUD-09** `POST /api/v1/audit-log/holds` places a hold on an entity, a record or an actor, with a reason, `GET` lists the active ones (`status=released|all` for others) and `DELETE .../holds/:id` releases one by a mark, so its row stays. Permission `audit-log.hold` to place and release, `audit-log.read` to list. A hold covers the entries that match every field it sets, in its tenant, or every tenant when placed outside one. `audit:prune` never deletes an entry under an active hold and says how many it kept (`kept` in its data and in its text). Placing and releasing are audited (`audit-log.hold.placed`, `audit-log.hold.released`). At most 200 holds are active at once (`AUDIT_HOLD_LIMIT`, 409). The table `bk_audit_holds` is a framework table (data migration step 0.5.0, ADR 0032).

### 12.10 Operations of the base plugins (slice S6, last part)

- **OPS-01** The routes of the six plugins that send mail or remove data honor `Idempotency-Key` (§13.1). A `DELETE` route may declare `idempotent: true` as a `POST` route does, and an answer with no body, such as a 204, is replayed.
- **OPS-02** Sensitive actions are limited per actor as well as per address (AUTH-06): invitations (20 in 15 minutes per administrator, with the limits of reset mail and MFA reset of USR-09 to USR-11) and the audit export (10 in 15 minutes per person). Over the limit the answer is 429 with `Retry-After`, `USERS_RATE_LIMITED` or `AUTH_ACTION_LIMITED`. `audit:prune` runs from the command line on the migrate role and has no actor to count.
- **OPS-03** `GET /api/v1/settings/export` (permission `settings.read`) lists the values stored in the scope of the caller, with `{ key, secret: true }` for a secret and never its value. `POST /api/v1/settings/import` (permission `settings.manage`, `?dryRun=true` to only report) applies such a file. Each entry answers `created`, `updated`, `unchanged`, `skipped` (a secret) or `invalid`; any invalid entry refuses all of them with `SETTINGS_IMPORT_INVALID` (422) and the report.
- **OPS-04** A media object has the key `<visibility>/<tenant>/media/<id>/<name>`, so a tenant's files are reached by prefix. `MEDIA_AUDIT_DOWNLOADS=true` (default off) writes `media.file.downloaded` when a private file is read through its URL or its content route.
- **OPS-05** The lists of users, media and the audit log are tested with 100 000 rows on the three dialects: the plan of the list and of each filter does not read the whole table, the first page answers inside a bound, and no list runs `COUNT(*)` unless `withTotal` is asked for. The audit log has indexes for its filters (action, record, actor, request: data migration step 0.5.0), and the users list for the sort by name and, on PostgreSQL, for the prefix search (auth migration 0.7.0).
- **OPS-06** Each plugin has an operations section in `docs/modules/plugins.md`: what to back up, what each policy does, the audit action names, the retention knobs and how to run `audit:prune`.

## 13. HTTP API

The API is REST over JSON on Fastify 5, described by an OpenAPI 3.1 document generated at build time. Entity routes are generated from `api` settings, and custom routes use the same validation and permission helpers.

### 13.1 Conventions

| Concern | Convention |
| --- | --- |
| Base path | `/api/v1/<module>/<resource>`, for example `/api/v1/crm/customers` |
| Versioning | Major version in the path. Breaking changes need a new major path, old one kept for one framework major |
| List | `GET` with `page` and `pageSize` (default 25, max 100), or `cursor` for large tables |
| Sorting | `sort=-createdAt,name` |
| Filtering | `filter[tier][eq]=gold`, `filter[createdAt][gte]=2026-01-01`. Operators: `eq`, `ne`, `in`, `lt`, `lte`, `gt`, `gte`, `null`. Only fields declared `filterable()` or `sortable()` are accepted, and both imply an index (DATA-07). Text search uses `q=` and the search contract (section 15.7) |
| Relations and fields | `include=owner`, `fields=code,name` |
| Success body | `{ "data": ..., "meta": { "page", "pageSize" } }`, plus `total` only when `withTotal=true` (DATA-11) and `nextCursor` for cursor lists |
| Errors | RFC 9457 `application/problem+json` with `type`, `title`, `status`, `detail`, a stable `code` and `traceId` |
| Validation errors | Problem with `errors: [{ path, code, message }]` |
| Idempotency | `Idempotency-Key` header honored on `POST` and `DELETE` for routes that declare `idempotent: true` |
| Dates | ISO 8601 in UTC |
| Naming | camelCase in JSON, snake\_case in the database |

### 13.2 Requirements

- **API-01** Every route declares input schemas (params, query, body) and a response schema. Responses are serialized through the schema, so fields not in it never leak.
- **API-02** Every route declares a permission or is explicitly marked `public: true`. `bieberkit check` fails on routes with neither.
- **API-03** Request body limit defaults to 1 MB. Uploads go directly to storage through signed URLs (section 15).
- **API-04** Every response carries `x-request-id`. Incoming trace context headers are honored.
- **API-05** Server timeouts: 30 s request timeout, keep-alive timeout above the load balancer idle timeout.
- **API-06** `openapi.json` is served in development. In production it is served only when `API_DOCS_PUBLIC=true` or to users with the `system.api-docs` permission.
- **API-07** The project client package is regenerated from `openapi.json` on every `bieberkit build`, and CI fails when the committed client is out of date.

### 13.3 HTTP caching and composition

- **API-08** `GET` responses carry an `ETag`. Conditional requests with `If-None-Match` return 304 without a body.
- **API-09** Endpoints marked `public: true` and `cacheable` send `Cache-Control` with `s-maxage` and `stale-while-revalidate`, and cache tags for purging.
- **API-10** Site composition endpoints (`/api/v1/site/pages/:slug`, `/api/v1/site/layout`) return everything one page needs in a single call: content, menus, SEO fields, related items. They are cached by tag and purged on publish, so a server-rendered page normally costs one cached API call. They serve public content only. Anything personal to a signed-in visitor comes from separate endpoints that are never cached publicly.
- **API-11** HTTP/2 or HTTP/3 and compression are terminated at the load balancer, not in Node.js.

* **API-12** Calls from the site server carry a service token (`SITE_SERVICE_TOKEN`) and forward the visitor's IP address and session cookie. The API rate-limits by the forwarded IP, and relaxes the Fetch Metadata CSRF check only for requests with a valid service token arriving from the internal network.

- **API-13** Optimistic concurrency: every entity has a `version` column. Updates and transitions MUST send `If-Match` with the ETag or `version` they read, and a stale write returns 412 with the current record, so two editors never silently overwrite each other.
- **API-14** Bulk endpoints (`POST /<resource>/bulk` for update, delete and transitions) accept up to 500 ids, check permissions and conditions per row, run in one transaction for 100 rows or fewer and as a queued job above that, and report per-row results. A call above 100 rows is answered `202` with the id of the job and its `Location`; the job runs as the same principal, asks the authorizer again, and its owner reads the per-row results at `GET /api/v1/_jobs/:id` (Q-10, Q-15).
- **API-15** An aggregate endpoint (`GET /<resource>/aggregate?groupBy=&sum=&count=`) serves dashboards. It applies the same tenant filter, permission conditions and field masks as lists, and only allows fields declared `aggregatable()`.
- **API-16** Deprecated endpoints and fields send `Deprecation` and `Sunset` headers and are listed in the OpenAPI document.

* **API-17** Bulk payloads carry the `version` of each row (API-13), and rows with a stale version are reported as conflicts. Imports declare their conflict policy explicitly: skip, overwrite or fail.

### 13.4 Request pipeline

Every request passes the same stages in the same order. Core implements them as Fastify hooks, so no route can skip a security step.

1. Request id, trace context and request timeout start.
2. Client IP resolution through `TRUST_PROXY`, or from the site service token (API-12), followed by a coarse per-IP rate limit generous enough for many users behind one carrier-grade NAT address.
3. Authentication by session cookie or API key.
4. Per-user and per-API-key rate limits. Login endpoints apply their per-account limit right after body parsing.
5. Tenant resolution (DATA-19).
6. CSRF check for cookie-authenticated unsafe methods (SEC-03).
7. Body parsing within the size limit, then schema validation by Ajv.
8. Authorization: the route permission first, then the CASL ability for the subject and its conditions.
9. The handler calls a service inside a request-scoped unit of work (MOD-16). Data, audit entries and outbox rows are written in one transaction, which commits before the response is built.
10. Response serialization through the schema, with field masks applied (API-01, AUTHZ-03).
11. ETag and cache headers (API-08, API-09).
12. Logs and metrics are emitted when the response finishes. Side effects run later from the outbox (section 7.5).

- **REQ-01** Plugins add hooks only at named stages (`afterAuth`, `beforeHandler`, `afterHandler`, `onResponse`). They cannot reorder or remove core stages.
- **REQ-02** A failure at any stage stops the pipeline and returns an RFC 9457 problem. No later stage runs.

### 13.5 Site composition

- **COMP-01** Plugins register composition fragments with `site.fragment(name, loader)`: menus from `menus`, SEO fields from `seo`, page content from `pages`.
- **COMP-02** A composition endpoint (API-10) runs only the fragments a route asks for, in parallel, each with its own cache tags.
- **COMP-03** Fragments return public data only and declare their tags, so a publish event purges exactly the pages that used the changed data.

## 14. Authentication and authorization

Better Auth handles identity and sessions. CASL evaluates permissions per request. Roles are data, permissions are code.

### 14.1 Authentication

- **AUTH-01** Browser sessions are server-side, referenced by a `__Host-` cookie that is `HttpOnly`, `Secure` and `SameSite=Lax`. Tokens are never stored in `localStorage`. The cookie is named `__Host-bk_session`, with `Path=/` and no `Domain`, set through `advanced.cookies.session_token`. `useSecureCookies` stays off, because it prefixes `__Secure-` and breaks the `__Host-` name (ADR 0012).
- **AUTH-02** Session storage uses the database by default and Valkey when `REDIS_URL` is set, so every web replica sees every session. The database always holds the session (`storeSessionInDatabase`), so a Valkey that loses its data signs nobody out, and the Valkey of sessions is the one with `noeviction`.
- **AUTH-03** Supported methods: email and password, magic link, OAuth and OIDC providers, TOTP, passkeys. A server always turns TOTP on, under the name of `admin.brand.name` or of the project, so a person can set it up with no configuration. Magic link MUST NOT be turned on while a session that it makes can pass `requireMfa` without a code: Better Auth asks for the second factor after a password sign in only. Organizations and teams through the Better Auth organization plugin in the `saas` template.
- **AUTH-04** Passwords: minimum 8 characters, 15 or more recommended in the UI, no composition rules, optional breached-password check. This follows OWASP ASVS 5.0.
- **AUTH-05** A second factor is required only where it is asked for: of the holders of a role flagged `requireMfa`, or of everyone with `security.mfa.required-for-all` (POL-02). No role has the flag by default, the administrator role included. Turning the second factor on MUST end every other session of the account, because the factor is a mark of the account and not of a session.
- **AUTH-06** Login, OTP, magic-link and password-reset endpoints are rate limited per IP and per account. A password that is set through a link MUST end every session of the account.
- **AUTH-07** Machine clients use API keys from the `api-keys` plugin. Keys are shown once, stored hashed, scoped to permissions, and expire.
- **AUTH-08** Better Auth is pinned to 1.7.16 or later, and its security advisories are watched by a dedicated Renovate rule that skips the release-age delay.

* **AUTH-09** Better Auth connects through a BieberKit adapter on top of MikroORM that joins the request's transaction, so signup writes its user, audit and outbox rows atomically (section 7.5). Its tables are part of the BieberKit schema and migrated as versioned steps of `@bieberkit/auth` (DATA-24), so auth and application data share one migration history. The mechanism is Better Auth's own Kysely adapter over `em.getKysely()` of the current request, reached through a request-scoped proxy (`AsyncLocalStorage`) where a nested `db.transaction()` joins the outer transaction. The Phase 0 spike confirmed it on PostgreSQL, MySQL and SQLite (ADR 0012).

- **AUTH-10** Better Auth is configured to fit the pipeline: client IP comes from the `TRUST_PROXY` resolution (never a raw `X-Forwarded-For`), rate-limit counters live in Valkey or the database (never per-process memory), tables and columns map to snake\_case, and user ids use the DSL's UUID type so foreign keys from `created_by` match. A CI job compares Better Auth's expected schema with the BieberKit entities on every Better Auth upgrade and fails on drift. The organization plugin of Better Auth is not loaded: tenants and members are ours (ADR 0021), the tenant is resolved for each request (DATA-19) and is never persisted in the session, which has no column for it. The pipeline sets the trusted header `x-bk-client-ip` after removing any incoming one, and Better Auth reads only that header. No column is named `<entity>_id` on the table of that entity, because MikroORM reads it as the primary key (Better Auth's `account.accountId` is stored as `external_account_ref`). The id generator stays set, and the UUID type throws on a string that is not a UUID. The drift job compares property presence, nullability and uniqueness (ADR 0012).

- **AUTH-11** Better Auth is pinned to an exact version (1.7.27 was tested, the minimum is 1.7.16), and its telemetry stays off (ADR 0012).

### 14.2 Authorization model

| Concept | Defined in | Example |
| --- | --- | --- |
| Permission | Code (entity, module, plugin) | `crm.customer.update` |
| Role | Database, edited in the admin UI | `Sales manager` with a set of permissions |
| Condition | Code, attached to a permission | Only rows where `ownerId = currentUser.id` |
| Field mask | Entity `permissions.fields` | `email` readable only with `crm.customer.read-pii` |
| Tenant scope | Global data filter | Rows of the current tenant only |

- **AUTHZ-01** A CASL ability is built per request from the user's roles and cached for the request only.
- **AUTHZ-02** CASL conditions are translated into MikroORM query conditions, so list endpoints return only permitted rows instead of filtering after loading. BieberKit owns this translator. It reads CASL's condition tree (`rulesToAST`) and supports the operators `eq` (also `null`), `ne`, `in`, `nin`, `gt`, `gte`, `lt` and `lte` on entity properties, with the `and`, `or` and `not` nodes that CASL builds from several rules. Anything else throws `AUTHZ_UNSUPPORTED_CONDITION` before a query runs, so a list answers 403 and never widens. The tenant filter is AND-ed outside the translated condition (ADR 0013).
- **AUTHZ-03** Field masks apply to both reads (fields removed from responses) and writes (fields rejected in input).
- **AUTHZ-04** Default deny: a route without a matching permission returns 403.
- **AUTHZ-05** Role and permission changes, impersonation, `asSystem()` calls and failed authorization attempts are written to the audit log. Unsupported conditions are written too.

- **AUTHZ-06** A condition uses one operator per field from the AUTHZ-02 set and no `$or`, `$and` or `$not` inside it: "or" is several rules and "not" is an inverted rule. `bieberkit check` rejects other operators, dotted paths and unknown fields in declared conditions at build time (ADR 0013).

## 15. Queue, cache and storage services

Application code depends only on contracts. `.env` picks the driver, so switching from local development to production changes configuration, never code.

| Contract | Drivers | Library underneath | Production default |
| --- | --- | --- | --- |
| Queue | `sync`, `database`, `redis` | BullMQ for `redis`, BieberKit for `database` | `redis` |
| Cache | `memory`, `file`, `database`, `redis` | BentoCache | `redis` |
| Storage | `local`, `s3` (also R2, MinIO, GCS) | FlyDrive | `s3` |
| Mail | `log`, `smtp` | Nodemailer-compatible transport | `smtp` |

### 15.1 Queue

```ts
export const sendInvoice = defineJob({
  name: 'billing.send-invoice',
  queue: 'default',
  input: z.object({ invoiceId: z.uuid() }),
  retries: 5,
  backoff: { type: 'exponential', delayMs: 2000 },
  timeoutMs: 60_000,
  handle: async ({ input, ctx }) => { /* ... */ },
})

await queue.dispatch(sendInvoice, { invoiceId })
```

- **Q-01** Delivery is at least once. Handlers MUST be idempotent, and the framework passes a stable `jobId` to help. BullMQ keeps completed jobs for at least 1 hour and never uses `removeOnComplete: true`, so a redelivered outbox row cannot run twice. The attempt number is informational and is not a delivery count (ADR 0010).
- **Q-02** Job input is validated on dispatch and again on execution.
- **Q-03** Named queues `critical`, `default` and `reports` exist by default, so long jobs never block urgent ones. Workers choose queues with `--queues`.
- **Q-04** Failed jobs land in a dead-letter list visible in the admin UI, with retry and discard actions.
- **Q-05** The `database` driver claims jobs with `SELECT ... FOR UPDATE SKIP LOCKED` on PostgreSQL, MySQL 8.4 and MariaDB. On SQLite it claims inside a `BEGIN IMMEDIATE` transaction, provided by the driver override of ADR 0008, which is safe because SQLite has a single writer.
- **Q-06** Jobs dispatched inside a database transaction are enqueued only after commit (outbox), so a rollback never leaves an orphan job.
- **Q-07** Schedules run only in the `scheduler` role and take a distributed lock per tick, so a second scheduler cannot run the same tick twice. On Valkey the lock is `SET key owner NX PX ttl` per tick. With the `database` driver it is a row in `bk_locks`, taken by an `UPDATE ... WHERE until < now` followed by a read of the owner (ADR 0010).
- **Q-08** Valkey or Redis used for queues MUST run with `maxmemory-policy noeviction`. `bieberkit doctor` checks it. Cache data lives on a separate instance (CACHE\_REDIS\_URL) with an eviction policy and a TTL on every key, because Valkey applies one memory policy per instance and a full cache must never block jobs, sessions or rate limits.

* **Q-10** Every job carries the `tenantId` and the acting user or system actor of the code that dispatched it. Workers restore that context before running, so tenant filters, permission checks and audit entries behave exactly as in the original request.

- **Q-11** Every queue driver passes the shared contract suite of nine tests: context restored (Q-10), `jobId` deduplication, retries with backoff, dead letters, delay, queue isolation, redelivery after a crash, exactly one run per job with two workers, and throughput (ADR 0010).
- **Q-13** A worker on PostgreSQL MAY be woken by a notification that is sent in the transaction of the insert and delivered at the commit, so a job that another process adds starts at once. The poll stays as the fallback, and a source that cannot connect never stops the worker (ADR 0019).
- **Q-14** The `redis` driver is BullMQ on Valkey, imported only in `@bieberkit/queue/redis`. It passes the same contract suite as the other drivers, keeps the job ids that callers choose (Q-01), and gives a job of a worker that died to another worker. Its instance needs `maxmemory-policy noeviction` (Q-08).
- **Q-15** A handler may return JSON, which the queue keeps with the job (at most 1 MiB, for 7 days), and `queue.status(jobId)` answers where a job is, its result and its error, with the tenant and the user that dispatched it.

### 15.2 Cache

- API: `get`, `set`, `remember(key, ttl, fn)`, `forget`, `tags([...]).flush()`, `lock(key, ttl)`.
- **C-01** Keys are namespaced by `CACHE_PREFIX` and by tenant for tenant-scoped data.
- **C-02** `memory` is per process. It is allowed in production only as a short-lived first level in front of `redis`, or as the only cache when APP\_SINGLE\_NODE=true (CFG-07).
- **C-03** `remember` prevents stampedes with a lock, so one caller computes while others wait.
- **C-04** The memory level in front of `redis` is a separate first level with a TTL of 5 seconds (DATA-13), never the BentoCache L1. Locks, tag generations and the claims of `Idempotency-Key` use `atomic` keys that skip it and go to the shared store (ADR 0016).

### 15.3 Storage

- API: `put`, `get`, `stream`, `exists`, `delete`, `copy`, `move`, `url`, `signedUrl`, `signedUploadUrl`.
- **S-01** Browsers upload directly to the bucket through signed upload URLs. The API then confirms the upload and records it in the `media` plugin.
- **S-02** Uploads are checked for size, MIME type by content sniffing, and an allowed extension list. A virus-scan hook MAY run as a job.
- **S-03** Files are private by default. Public access is granted per file through `visibility: 'public'` or short-lived signed URLs.
- **S-04** `local` is allowed in production only with `APP_SINGLE_NODE=true`.
- **S-05** Visibility is a key prefix, `private/` or `public/`, on every disk, so it works on a local folder, S3 and R2 with no ACL. A file has one copy, and a public file is served by a bucket policy, a CDN or a static folder that allows `public/` only (ADR 0017).
- **S-06** A signed upload fixes the size and the content type of the file, and `confirmUpload` reads the first bytes and deletes the object when they are not what the extension says. The content type of a client is never kept for a ready file: a pending record holds it only to sign the upload, and confirm replaces it with the verified type.

### 15.4 Mail

- **M-01** Mail is sent through the queue by default, so a slow SMTP server never delays a request.
- **M-02** Templates are React Email components with vi, en and zh variants. Block content renders into emails through the HTML serializer (CNT-05).
- **M-03** A message is checked when it is sent: addresses, names and the subject cannot hold a line break (no header injection), there are at most 50 recipients and 1 MiB for each part. A server that refuses a message for good is logged and reported and the job is not retried, and every other failure is retried with a backoff (ADR 0018).
- **M-04** The `log` driver writes no address and no body in production. In production a plain `smtp://` URL to a host that is not the loopback address is refused at boot unless it asks for TLS.

### 15.5 CPU-heavy work

- **Q-09** PDF rendering, spreadsheet import and export, and image transforms run in a `worker_threads` pool inside the worker role, so one heavy job never blocks the event loop of others.
- **Q-12** A pool task is a module that is named by a URL or an absolute path of the project, never by a user. A task that runs over its time, ends its thread or passes its memory limit costs that thread and no more: the others run, and the call fails with a stable code.

### 15.6 Realtime

- **RT-01** The web role offers Server-Sent Events at `/api/v1/events`, filtered by the user's permissions and tenant.
- **RT-02** Events fan out across replicas through Valkey pub/sub. Without Valkey, realtime is off and the admin UI falls back to polling.
- **RT-03** The admin UI uses these events to refresh lists, show notifications and invalidate TanStack Query caches.

* **RT-04** Event streams disable proxy buffering and send a heartbeat every 25 s so load balancers keep them open. HTTP/2 at the load balancer (API-11) avoids the browser limit of six HTTP/1.1 connections per origin.
* **RT-05** On shutdown, open streams are closed with a retry hint right after step 1 of section 19.4, so clients reconnect to another replica instead of holding the old one until the timeout.

### 15.7 Search

- **SR-01** Search is a contract with a `database` driver by default (per-word prefix matching on a normalized copy of each searchable field: NFC, lowercase, Vietnamese diacritics removed, đ mapped to d. "nguyen lan" therefore finds "Nguyễn Thị Lan". Words are kept in a token table with a plain index, which works on every dialect. An optional pg\_trgm driver adds fuzzy matching on PostgreSQL).
- **SR-02** Dedicated engines are plugins with their own drivers. Fields marked `searchable()` are indexed by a job on every write event.

### 15.8 Webhooks and integrations

- **WH-01** The `webhooks` plugin delivers selected events to external URLs, signed with HMAC-SHA256 and a timestamp, retried through the queue with exponential backoff, and logged per delivery.
- **WH-02** Outbound webhook calls use the SSRF-guarded `http.fetch` helper (SEC-06).
- **WH-03** Inbound integrations (ERP, payment, e-invoice providers) are plugins that verify signatures and enqueue work instead of processing inside the request.

* **WH-04** `http.fetch` applies default timeouts (5 s to connect, 30 s in total), retries only idempotent requests, and opens a circuit breaker per host after repeated failures.

### 15.9 Import and export

- **IO-01** Any entity with `api.list` can be exported to CSV or XLSX, and any entity with `api.create` can be imported, with the same field masks and permissions as the API.
- **IO-02** Imports run as queued jobs: upload, column mapping, a dry run that validates every row, then the real run. Progress streams to the admin UI (RT-01), and failed rows come back as a downloadable error file.
- **IO-03** Imports match existing records by a declared natural key (for example `code`) to update instead of duplicate.
- **IO-04** Exported spreadsheet cells that start with `=`, `+`, `-` or `@` are escaped to prevent formula injection.

## 16. Admin UI and public site

Projects have two user interfaces. The admin UI is a single-page app for signed-in staff. The public site is rendered on the server, so search engines and social previews receive complete HTML.

### 16.1 Admin UI

The admin UI is a React single-page app that renders most screens from entity metadata, so a new entity gets list, form and detail screens without frontend code. It calls the API like any other client, which keeps authentication and authorization in one place.

- **UI-01** Stack: React 19.2 (19.2.4 or later), Vite 8, TanStack Router and Query. No React Server Components. Visual components come through a UI adapter (UI-10), Ant Design 6 by default.
- **UI-02** The shell loads `/api/v1/_meta`, which returns the entities, fields, permissions and menu entries the current user may see.
- **UI-03** Generic screens: list (filters, sorting, saved views, bulk actions, export), form (validation from the same schemas as the API), detail (tabs for related records, activity, audit history; the history tab comes from the `audit-log` plugin, UI-34).
- **UI-04** Escape hatches: a field can use a custom widget, a generic screen can be replaced by a custom page, and plugins add pages and dashboard widgets. A plugin does it in its admin part (UI-34), in the slots of UI-35; the pages and widgets of a project are in `apps/admin/src` (section 16.6).
- **UI-05** Languages en, vi and zh are bundled. Dates, numbers and currency follow the user's locale. Vietnamese and Chinese labels come from the entity `label` and plugin translation files. The language is the one that the person chose in the header (kept in the browser), then the first language of the browser that is bundled, then English; the three dictionaries have the same keys and the same placeholders, which a test enforces. Money is formatted from the text that the API sends, so its digits are never rounded by a number.
- **UI-06** Theme tokens (colors, radius, spacing, fonts, dark mode) are set in the `theme` key of `bieberkit.config.ts`, and every one of them is optional. The key is validated at build and at boot with every problem reported together (a color is a hex of 3 or 6 digits, the radius is 0 to 24 px, the spacing 2 to 8 px, `darkMode` is `auto`, `light` or `dark`). The server writes the resolved theme into the page of the admin as data and as CSS variables, so a change is a restart and not a build (UI-14). The default font stack covers Latin, Vietnamese and Chinese scripts.
- **UI-07** Accessibility target: WCAG 2.2 level AA for all generic screens.
- **UI-08** Built assets are static files with content hashes, served from a CDN or from the web role.
- **UI-09** Reusable blocks (dashboards, approval forms, import wizards) are installed from the registry as editable source.

Admin architecture, forms and performance:

- **UI-10** The admin is split in two packages. `@bieberkit/admin-core` holds no visual components: metadata loading, routing, permissions, the logic of lists, filters, saved views, moves of a state field, forms and their checks (as functions that need no library), data hooks, realtime. `@bieberkit/admin-antd` is the default adapter that renders it with Ant Design 6. The adapter contract is public, so other adapters (shadcn/ui, MUI) can be built without forking the core. Only the Ant Design adapter is maintained by the project. Neither package names a first-party plugin (UI-34). The screens of a plugin are written for one adapter, so a plugin keeps its logic free of UI libraries.
- **UI-11** Form metadata supports repeatable groups and inline child tables, fields shown or required by condition (`visibleWhen`, `requiredWhen`, written with `.admin()` on the field as data that the server enforces and the form follows), computed read-only fields, file and image fields with direct upload (`f.file()` and `f.image()` hold the id of a media record, ADR 0036; the control comes from the `media` plugin, UI-34), relation pickers with server search, and the block content editor (section 16.5).
- **UI-12** Every route and every screen of a plugin is a lazy chunk. Translations load per language and per module. A table over 200 rows draws only the rows in view (ADR 0035).
- **UI-13** Data hooks prefetch on link hover, update optimistically for state transitions and inline edits, and invalidate caches from realtime events (RT-03).
- **UI-14** The admin is served at the address of `ADMIN_URL` (`/admin` of the application by default) on the same origin as the API, as static files from the web role or a CDN, with its own strict Content-Security-Policy. Its address is not in the build: the server writes it in the page, so one build runs at `/admin`, at any other path, or at the root of a host of its own such as `admin.example.com`. A host of its own is the same server answering for another name (a proxy routes both names to the web role), so the session cookie, which belongs to one host, is the one of the admin and the API calls need no CORS, and the origin of the admin is trusted by the sign in.
- **UI-15** Generic screens never fetch more than the listed fields (`fields=` from metadata), so wide entities stay fast in lists.

* **UI-16** Generic list, detail and form screens work down to a 360 px wide screen, so staff can use the admin on phones and tablets in the field. Wide tables switch to a card layout on small screens.
* **UI-17** Forms warn before leaving with unsaved changes, keep a local draft of long forms, and support keyboard shortcuts for save, new and search.
* **UI-18** On a 412 conflict (API-13) the form shows who changed the record and what changed, and lets the user reload or re-apply their edits.
* **UI-19** Every route has an error boundary with a retry action. Network errors retry with backoff and show an offline banner instead of a blank screen.
* **UI-20** Supported browsers: the last two versions of Chrome, Edge, Firefox and Safari, including Safari on iOS. The same policy applies to the site.
* **UI-21** Client errors and Core Web Vitals from real users are sent to the error-reporter contract (OBS-06), sampled and without personal data. The admin sends them to the public route `POST /api/v1/_client-reports`, which takes a closed shape, hands an error to the reporter as a warning of the source `client`, and counts a vital in the metrics `bk_admin_web_vitals_total`, `bk_admin_web_vital_seconds` and `bk_admin_layout_shift`.

- **UI-22** Hashed admin assets from the previous release stay available (CDN or a retained folder) for at least 24 hours after a deploy, and the admin reloads itself on a chunk-load error, so open tabs survive rolling deploys. The web role keeps them: at start it copies the hashed files of its build into `ADMIN_ASSETS_DIR`, marks the ones that the release before used and this one does not, serves a hashed file that its build lacks from there, and removes a file 24 hours after the release that replaced it. A CDN that keeps the files of past releases does the same without it.

Identity and the screens of the base plugins:

- **UI-23** The default theme of the admin has an identity of its own: the dark frame whose chosen entry joins the page, the folder tabs, the palette with the colors `frame` and `accent`, the font Be Vietnam Pro that the adapter bundles (ADR 0039), the sign in and the empty, loading and error states, in light and dark. The identity is the default value of the theme tokens, so the `theme` key (UI-06) still changes it. A theme that sets `primary` and no `frame` gets a frame that is a dark tone of its `primary`. The texts on the frame are derived from the frame, so that they read at level AA on any frame. The admin loads no font or file from another origin (UI-14), its fonts cover the languages of UI-05, and it keeps UI-07, UI-16 and the size budget of the admin (section 18.1).
- **UI-24** The frame of the admin has a navigation with groups and icons, a breadcrumb, a box that goes to a page of the menu (Ctrl or Cmd and K, found without accents) and a menu of the account. What a plugin adds to the frame goes in the slots of UI-35. It shows only what the person may use. The order and the groups are those of `admin.menu` of the config, which a template writes (section 12). Without it they are those of the base plugins of `blank`: what the project adds first, then people, content and system. An entry that `admin.menu` does not name stays in the menu, after the named groups.
- **UI-25** A project of the `blank` template has the screens of UI-26 to UI-32 for its base plugins, each screen shipped by the plugin that it serves (UI-34), with no further install or configuration. Each screen is a lazy chunk (UI-12), is in the languages of UI-05, covers every task of its plugin that the API gives to a person, and shows an entry or an action only to a person with the permission for it. The server stays the only authority: a refusal is shown with its text and its fix.
- **UI-26** Account screens, of the `users` plugin (the shell has no sign in of its own, so the admin needs this plugin): sign in with the second factor, forgotten and reset password, acceptance of an invitation (USR-10), enrolment of a second factor (AUTH-05, ROL-07), and one's own profile, password, second factors and sessions (USR-12). A sign in method of AUTH-03 is shown when the project turns it on. Where the API answers `AUTH_MFA_REQUIRED` or `AUTH_MFA_ENROL_REQUIRED`, the screen that sets up the second factor stands in place of the admin, and in the days of grace of POL-02 the frame says by when. The token of a password link is held in memory and taken out of the address.
- **UI-27** Users screens, of the `users` plugin: the list and its filters, the detail, create and invite, change, disable and enable, delete, password reset, reset of the second factor, sessions, effective permissions and groups (USR-01 to USR-11, ROL-05, ROL-09). An identity of a provider shows what cannot be changed (IDN-02).
- **UI-28** Roles screens, of the `roles` plugin: the roles and their members, the permissions by module, create, change, duplicate and delete with reassignment, and giving and taking a role for several people, with the answer for each (ROL-01 to ROL-09).
- **UI-29** Settings screens, of the `settings` plugin: a form for each group of declared settings with a control for each type, the scope of a value, reset to the default, secrets that are written and never shown, export and import, and the security policies with the refusal of their guard (SET-01 to SET-06, OPS-03, POL-01 to POL-05).
- **UI-30** Notification screens, of the `notifications` plugin: the inbox of the signed-in person with an unread count in the frame, marking as read, delete, the preferences, and for those with the permission, sending and the list for support (NTF-01 to NTF-07).
- **UI-31** Media screens, of the `media` plugin: a library with folders, upload, preview, filters, change of the description of a file, download and delete, with the limits and the state of each file (MED-01 to MED-08, OPS-04).
- **UI-32** Audit log screens, of the `audit-log` plugin: the entries and their filters, the detail of an entry with its actor and its changes, export, and holds (AUD-01 to AUD-05, AUD-09). Retention stays a command of the CLI (AUD-06).
- **UI-33** A project gives the admin its own name, logo and sentence of the sign in with `admin.brand` of the config: a name of 1 to 60 characters, a logo that is a `data:` URI of a PNG, JPEG, WebP or SVG image of at most 100,000 characters (the policy of the admin lets it show, UI-14), and a sentence of at most 120 characters, as one text or by language. Each is optional. Without them the admin shows the logo and the sentence of BieberKit. The key is validated at boot with every problem reported together, and a change is a restart and not a build.

Admin parts of plugins (ADR 0040, `docs/modules/plugin-admin.md`):

- **UI-34** A plugin MUST ship its own admin UI: its screens, texts and calls of the API are in its package, as the export `./admin`. One line of `plugins` in the config attaches the backend and the admin part, and removing it removes both; the data stays (PLG-03). `@bieberkit/admin-core` and `@bieberkit/admin-antd` hold only what is shared and MUST NOT name a first-party plugin. An admin part imports no server code (FE-01) and no file of another plugin (PLG-01).
- **UI-35** An admin part attaches only to these slots: a menu entry; a page after sign in; a button in the header; a notice over the frame; a tab of the detail of a record; the control of a field; a block of the home page; an entry in the menu of the account and a tab of "My account"; a page without a session; a screen that stands in place of the admin. It may also replace a generic list or form (UI-04). A new slot is a change of this specification.
- **UI-36** An admin part declares and does not patch: it MUST NOT change the shell, replace the layout or write a global style. The shell owns routes, the menu, permissions, lazy loading, languages and an error boundary around each contribution. A screen uses the shared components and tokens, keeps UI-07 and UI-16, and brings its texts for each language of the project. A repeated address, an unknown slot or a missing text stops the build with every problem and a stable code. A first-party plugin uses no API that another plugin cannot use.
- **UI-37** A project builds its admin from the plugins of its config. `apps/admin` (section 16.6) gets a generated list of the admin parts; `bieberkit dev` serves it with hot reload and `bieberkit build` writes `apps/admin/dist` (DEP-06). React and Ant Design are one copy each. The build keeps the policy of UI-14 and the budget of section 18.1.
- **UI-38** In a project made by `create`, which has only the published packages, `make:plugin` MUST make a plugin with a backend and an admin part that is wired into the project: it works in `bieberkit dev` with no manual build, passes `bieberkit build`, and can be published as it is. A test that installs packed tarballs in a new project outside the framework repository proves it.

### 16.2 Public site (server-side rendering)

Public pages are rendered on the server by a separate app, `apps/site`, built on TanStack Start. It shares React, TanStack Router, TanStack Query and the generated client with the admin UI, so components and data hooks are reused.

- **SITE-01** SSR is on for every public route by default. A route MAY switch to client rendering. Build-time prerendering is not used, because HTML baked into an image cannot be purged on publish.
- **SITE-02** The site reads data only through the BieberKit API with the generated client. It holds no database, Valkey or storage credentials. Server-side calls use the internal API address in `SITE_API_URL`.
- **SITE-03** Same origin: the load balancer sends `/api/*` to the web role, /admin/\* to the admin static files, and everything else to the site. The `__Host-` session cookie then works for signed-in visitors without cross-domain cookies.
- **SITE-04** React Server Components are not used. Server functions are limited to forms that forward to the API, with CSRF protection.
- **SITE-05** Drafts are visible only in preview mode, opened from the admin UI with a short-lived signed token. Preview responses are marked `noindex` and never cached.
- **SITE-06** TanStack Start is pinned and its advisories are watched with the same fast path as Better Auth (AUTH-08). Version 1.0 shipped on 2026-10-13 and has already needed a security update.
- **SITE-07** Other renderers (Astro, Nuxt, Next.js) can be used as headless clients of the same public API, preview tokens and revalidation webhooks. They are supported but not scaffolded.
- **SITE-08** The site does not load Ant Design or the admin bundle. It uses Tailwind CSS 4 and shadcn/ui components on Base UI, installed from the registry as editable source, so every project can own its look.
- **SITE-09** `bieberkit dev` starts the site dev server next to the API and the admin UI. New env keys: `SITE_URL`, `SITE_API_URL`, `SITE_SERVICE_TOKEN`, `SITE_REVALIDATE_SECRET` (secrets).

Site performance:

- **SITE-10** A page loads its data from one composition endpoint (API-10), so a typical server render makes a single, usually cached, API call over keep-alive connections.
- **SITE-11** HTML streams to the browser as soon as the shell is ready. Slow sections (related items, comments) render behind Suspense boundaries without delaying the first byte.
- **SITE-12** Pages that change rarely (home, landing pages, policies) are rendered on first request and kept at the CDN until a publish event purges them.
- **SITE-13** Interactive parts load only where used. Content pages ship no client JavaScript beyond hydration of the interactive components on them.
- **SITE-14** Site themes are packages or registry items that provide layouts and block renderers. Switching theme never touches content.

* **SITE-15** Public forms (contact, newsletter, lead capture) post through the API, use a honeypot field and rate limits by default, and MAY add a CAPTCHA driver.
* **SITE-16** Analytics and marketing scripts load only after consent from a built-in consent banner, and consent is stored by the `privacy` plugin (PDP-02).
* **SITE-17** Custom 404 and 500 pages and a maintenance mode switch, all editable in the admin UI and returning the correct status codes (503 with `Retry-After` for maintenance).

- **SITE-18** A response rendered with a visitor's session, and any response that sets a cookie, is sent with `Cache-Control: private, no-store`. Shared caches store only pages rendered without reading the session, and the CDN cache key ignores cookies. Personal parts of a public page (greeting, member price, cart) load on the client from `/api/*`, which is never publicly cacheable. A generated test fails when a cacheable route reads the session during SSR.

Alternatives considered:

| Option | Why it is not the default |
| --- | --- |
| Astro 6 | Strong for content sites, but adds a second component model beside React. Usable as a headless client. |
| Next.js 16 | Heavy security advisory load in 2026 and the React Server Components remote code execution of December 2025. |
| `@fastify/react` inside the web role | Puts page rendering in the API process and its scaling. Smaller community. |
| Admin-style SPA with prerendering | Fails for dynamic pages and fresh content. |

### 16.3 SEO

- **SEO-01** Every public route sets its head: title, meta description, canonical URL, Open Graph and Twitter card tags, robots. A `seoHead()` helper builds them from the `seo` plugin fields and falls back to the entity title and excerpt.
- **SEO-02** Locales use a URL prefix (`/vi/`, `/en/`, `/zh/`) or one domain per locale. Every localized page links its alternates with `hreflang`, plus `x-default`.
- **SEO-03** Slugs are generated per locale with Vietnamese diacritics transliterated (`khach-hang`), kept unique, and old slugs turn into 301 redirects automatically.
- **SEO-04** JSON-LD helpers for Organization, WebSite, Article, Product, BreadcrumbList and FAQPage.
- **SEO-05** `sitemap.xml` (an index plus one file per entity type, with `lastmod`) is regenerated by a job on publish and served by the site. `robots.txt` is set per environment, and non-production environments always send `noindex`.
- **SEO-06** Redirects managed in the admin UI (`redirects` plugin) apply before rendering. Missing pages return 404 or 410, never 200.
- **SEO-07** Public HTML is cached with `Cache-Control: s-maxage` and `stale-while-revalidate`, tagged by entity. This cache lives at the CDN or reverse proxy, never inside site replicas, so all replicas see one state. A publish event purges it through a purge driver (generic webhook or Cloudflare).
- **SEO-08** Images go through the `media` plugin, which generates the variants declared in config (widths, WebP or AVIF) in the worker role after upload. The transform endpoint serves only declared variants, so arbitrary sizes cannot be requested to exhaust CPU. Pages use them with responsive `srcset`, explicit width and height, and lazy loading below the fold.
- **SEO-09** Core Web Vitals budgets at the 75th percentile: LCP under 2.5 s, INP under 200 ms, CLS under 0.1. Lighthouse CI checks the `cms` home and article pages on every release candidate.

### 16.4 Design tokens

- **TOK-01** Brand tokens (colors, fonts, radius, spacing, dark mode) are declared once in `bieberkit.config.ts`.
- **TOK-02** `@bieberkit/tokens` compiles them into an Ant Design theme for the admin (`compileAntdTheme`) and CSS variables (`cssVariables`, `--bk-*`, with the dark palette under `data-theme="dark"` and the system setting) plus a Tailwind theme that points at those variables (`tailwindTheme`) for the site, so both stay on brand without double configuration. The package does not import core, because the admin imports it into the browser. The brand colors of the dark palette are those of the theme unless `dark.colors` says otherwise.
- **TOK-03** The default font stack covers Latin, Vietnamese and Chinese.

### 16.5 Block content editor

- **CNT-01** Rich content is stored as versioned block JSON, never as raw HTML: `{ version: 1, blocks }`, a flat list of blocks in which only lists nest (ADR 0038). Blocks include heading, paragraph, list, quote, image, gallery, video embed, table, call to action, and custom blocks declared by plugins.
- **CNT-02** `@bieberkit/content` defines the block schema and one set of React renderers used by both the admin preview and the site, so preview matches production.
- **CNT-03** Rendered output is sanitized: links get safe `rel` values, embeds come only from an allowlist, and there is no raw HTML block.
- **CNT-04** The editor engine is Tiptap 3 (MIT, ADR 0004). Before the editor ships in M2.3, a manual Vietnamese input test (Telex and VNI) MUST pass. If it fails where Lexical passes, a new ADR supersedes ADR 0004. The editor loads as a lazy chunk.

* **CNT-05** `@bieberkit/content` also ships a framework-free HTML serializer, used for emails, RSS feeds and headless renderers (SITE-07).

### 16.6 App structure

```text
apps/admin/src/
├── main.tsx       boots admin-core with the UI adapter and plugin admin entries
├── pages/         custom pages that replace or extend generated screens
├── widgets/       custom field widgets and dashboard widgets
├── blocks/        registry blocks installed as source
└── i18n/          project translation overrides

apps/site/src/
├── routes/        TanStack Start file routes ($locale, preview, sitemap)
├── layouts/       header, footer, page shells
├── blocks/        content block renderers that override the theme's
├── components/    shadcn/ui components installed from the registry
├── theme.css      Tailwind theme generated from tokens (TOK-02)
└── server/        composition calls through the generated client only
```

- **FE-01** Neither app imports server code. They share only `packages/client`, the `@bieberkit/content` renderers and the design tokens.
- **FE-02** Generated screens are configured through entity metadata first. A custom page is the escape hatch, not the starting point.

### 16.7 Metadata contract

`/api/v1/_meta` is the contract between the server and every admin UI adapter. Adapters learn about entities from this document and nothing else.

- **META-01** The response carries a `schemaVersion`. A breaking change to its shape bumps the version, and admin-core supports the current and the previous version.
- **META-02** It describes entities (fields with type, label per locale, validation, widget hints, visibility rules), actions and transitions, list and form layouts, menus, dashboards, enabled features, and the permissions of the current user.
- **META-03** It is computed per tenant, role set and deployment version, cached with an ETag, and invalidated when roles, plugins or the deployment change.
- **META-04** It never contains data rows, secrets or fields the user cannot read.
- **META-05** Its JSON Schema is published with every release, so third-party adapters and tools can validate against it.

## 17. Security requirements

BieberKit targets OWASP ASVS 5.0 Level 2 for generated projects and covers the OWASP Top 10:2025, including the new categories for software supply chain failures and mishandled exceptional conditions. Each requirement below is tested in CI or checked by `bieberkit check`.

### 17.1 Application

- **SEC-01** Security headers on by default: strict Content-Security-Policy (hash-based with strict-dynamic on cacheable site pages, per-response nonces only on uncached personal pages, script-src 'self' with hashes for the static admin), HSTS, `frame-ancestors 'none'`, `Referrer-Policy: strict-origin-when-cross-origin`, `X-Content-Type-Options: nosniff`, a restrictive Permissions-Policy.
- **SEC-02** CORS uses an explicit origin allowlist. Wildcards and the `null` origin are rejected.
- **SEC-03** CSRF protection for cookie sessions: Fetch Metadata (`Sec-Fetch-Site`) as the primary check and a signed double-submit token bound to the session. State never changes through `GET`.
- **SEC-04** All input is validated by schema. Unknown fields are rejected on write.
- **SEC-05** Queries are built only through the ORM or parameterized SQL. String-built SQL is reported by `bieberkit check`.
- **SEC-06** A built-in `http.fetch` helper for outbound calls blocks private, loopback and metadata IP ranges unless an allowlist permits them (SSRF).
- **SEC-07** Errors return RFC 9457 problems without stack traces in production. Unexpected exceptions are logged with a trace id and never crash other requests.
- **SEC-08** Sensitive fields declared `encrypted: true` are encrypted at rest with keys derived from `APP_KEY`, with rotation through `APP_KEY_PREVIOUS`.
- **SEC-09** Logs redact secrets, tokens, passwords and fields marked `pii: true`.
- **SEC-10** Rate limits are stored in Valkey or the database so they hold across replicas, and use the client IP resolved through `TRUST_PROXY`.

### 17.2 Supply chain

- **SEC-11** pnpm settings in the framework and in generated projects: dependency build scripts blocked unless allowlisted, exotic sub-dependencies blocked, `minimumReleaseAge` of 10080 minutes (7 days) with no blanket exclusion, not even for `@bieberkit/*`. A security fast path (AUTH-08, SITE-06) adds a temporary exclusion for the exact fixed version and removes it after 7 days, and `trustPolicy: no-downgrade`.
- **SEC-12** CI installs with `--frozen-lockfile` and never runs lifecycle scripts of unreviewed packages.
- **SEC-13** Third-party GitHub Actions are pinned by commit SHA, with the tag in a comment. Renovate keeps the SHAs current and respects `minimumReleaseAge`.
- **SEC-14** Agent configuration (`AGENTS.md`, `CLAUDE.md`, `.claude/`, `.agents/`, skill folders) is treated as code: changes need maintainer review and are listed in CODEOWNERS.

### 17.3 Releases

- **SEC-15** Packages are published only by npm trusted publishing (OIDC) from a dedicated release workflow, which adds provenance automatically. No long-lived npm token exists. The release workflow has three jobs, `verify`, `build` and `publish`. It starts only from a tag `v<major>.<minor>.<patch>`, and a repository ruleset on `refs/tags/v*` limits creation to the maintainer and blocks updates and deletion (ADR 0014).
- **SEC-16** The release workflow runs only on protected tags, never on `pull_request_target`, shares no cache with pull request workflows, grants `id-token: write` to the publish job only, and waits for manual approval in a protected environment. The publish job runs in the environment `release`, whose required reviewer is the maintainer and which accepts only `v*` tags, and its `setup-node` step has no `registry-url` (that would set `NODE_AUTH_TOKEN` and override the OIDC exchange).
- **SEC-17** These rules come from the May 2026 TanStack incident, where a poisoned Actions cache let an attacker publish through a legitimate trusted publisher without stealing a long-lived token: attacker code ran in the release workflow through a poisoned Actions cache and extracted the short-lived OIDC token from runner memory.

- **SEC-21** No job that holds `id-token: write` runs dependency installs, builds or tests. The publish job only downloads artifacts that earlier jobs built and checksummed (npm adds provenance when it publishes), and the only actions it may use are `actions/download-artifact` and `actions/setup-node`. `actionlint`, `zizmor` and `tools/check-workflows.ts` run in `pnpm check` and enforce SEC-13, SEC-15, SEC-16 and SEC-21 (ADR 0014).

### 17.4 Containers

- **SEC-18** Runtime images use Docker Hardened Images, run as a non-root user with a read-only root filesystem, pin the base image by digest, and ship an SBOM and provenance attestation.
- **SEC-19** CI scans images with Trivy and fails on fixable critical or high vulnerabilities.

### 17.5 Disclosure

- **SEC-20** `SECURITY.md` describes private vulnerability reporting through GitHub, a response within 7 days, and coordinated disclosure within 90 days.

### 17.6 Personal data

Vietnam's Personal Data Protection Law (No. 91/2025/QH15) and Decree 356/2025/ND-CP took effect on 2026-01-01 and give people the right to know, consent, access, correct and request deletion of their data. BieberKit gives projects the technical building blocks. Legal compliance stays the responsibility of each project owner.

- **PDP-01** Fields holding personal data are marked `pii: true`. `bieberkit check` produces a data inventory of every such field, the entity holding it and its retention rule.
- **PDP-02** The `privacy` plugin records consent per purpose with time and source, and supports withdrawal.
- **PDP-03** Data subject requests (access, correction, deletion) are tracked as records with due dates. Access produces a machine-readable export. Deletion anonymizes `pii` fields and keeps the audit trail.
- **PDP-04** Entities MAY declare `retention` (for example 24 months after last activity). A scheduled job anonymizes or deletes expired records.
- **PDP-05** Access to `pii` fields is audit-logged, and the audit log can be exported to support breach investigation and notification.

- **PDP-06** Audit diffs never keep personal data in clear text. Values of `pii` fields are encrypted with a per-person key, and a deletion request destroys that key, so old audit rows become unreadable without being edited (crypto-shredding). The rest of each audit entry stays intact.

## 18. Performance and scalability requirements

BieberKit scales by adding stateless replicas of each process role. The targets below are initial and will be validated with benchmarks in Phase 1 before they become release gates.

### 18.1 Initial targets

Reference setup: one web replica with 1 vCPU and 1 GB of memory, PostgreSQL on a separate host, 25-row list with one relation.

| Measure | Target |
| --- | --- |
| p95 latency, entity list endpoint | under 50 ms |
| p95 latency, entity get endpoint | under 20 ms |
| Framework overhead over raw Fastify on a hello route | under 15% throughput loss |
| Cold start of the web role | under 2 s |
| Idle memory of the web role | under 150 MB |
| Admin initial JavaScript, compressed | under 400 KB |
| p95 time to first byte, cached public page | under 100 ms |
| p95 time to first byte, uncached public page | under 400 ms |
| Client JavaScript on a content page, compressed | under 100 KB |

### 18.2 Requirements

- **PERF-01** No process keeps state that another replica needs: sessions, rate limits, locks, cache and files live in shared stores (P6).
- **PERF-02** One Node.js process per container. Scale with replicas, not with the cluster module or PM2 inside the container.
- **PERF-03** `--max-old-space-size` is set to about 75% of the container memory limit through NODE\_OPTIONS in the generated compose files and Helm values.
- **PERF-04** Generated list endpoints load relations in batches. Tests fail when a list endpoint issues one query per row.
- **PERF-05** Exports, imports, PDF generation and bulk updates run in the worker role, never inside a web request.
- **PERF-06** Response serialization uses compiled schemas.
- **PERF-07** Static admin assets and public CMS pages are cacheable at a CDN with explicit cache headers.
- **PERF-08** A k6 load test of the reference endpoints runs in CI on every release candidate and fails when a target regresses by more than 10%.

## 19. Deployment

A project ships as one server image that runs as web, worker, scheduler or migrate, plus a small site image when the public site is enabled. Moving from one VPS to Kubernetes changes configuration only, never application code.

The server image scales by role and the site image serves public pages.

- Load balancer (TLS, compression, routing): `/api/*` goes to the server image, all other paths go to the site image.
- Server image, four roles: `web` x N (scaled by latency), `worker` x M (scaled by queue depth), `scheduler` x 1 (exactly one), `migrate` job (before rollout).
- Site image: `site` x K, server-side rendering through the API.
- Shared stores: PostgreSQL or MySQL through PgBouncer or ProxySQL, Valkey or Redis (section 15), S3, R2 or MinIO (user files, signed URLs).

The load balancer sends API calls to the web role and page requests to the site. Only the server roles touch the database, Valkey and object storage, and each role scales on its own signal.

### 19.1 Image

```dockerfile
# syntax=docker/dockerfile:1
FROM ghcr.io/pnpm/pnpm:12 AS build
RUN pnpm runtime set node 26 -g
WORKDIR /app
COPY pnpm-lock.yaml pnpm-workspace.yaml ./
RUN --mount=type=cache,id=pnpm,target=/pnpm/store pnpm fetch
COPY . .
RUN --mount=type=cache,id=pnpm,target=/pnpm/store pnpm install --offline --frozen-lockfile
RUN pnpm exec bieberkit build
RUN pnpm deploy --filter=@app/server --prod /out
RUN cp -r apps/admin/dist /out/public/admin

FROM dhi.io/node:26 AS runtime
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /out .
EXPOSE 3000
ENTRYPOINT ["node", "dist/main.js"]
CMD ["web"]
```

- **DEP-01** `pnpm fetch` runs before the source copy, so dependency layers stay cached until the lockfile changes.
- **DEP-02** `pnpm deploy --prod` produces a self-contained folder without devDependencies or TypeScript sources. The server package lists dist in its files field, so a gitignored build output is still included.
- **DEP-03** The entrypoint calls `node` directly, never `pnpm start` or `npm start`, so SIGTERM reaches the application.
- **DEP-04** Build caches are shared only between trusted builds (SEC-16). Base images are pinned by digest (SEC-18). The generated Dockerfile uses `node:26-slim` by digest until the hardened `dhi.io/node:26` can be pulled without a login, and the layout of the image is `/app/apps/server` (the deployed server app) with `bieberkit.config.ts` and `migrations/` beside it (ADR 0026).
- **DEP-05** The role is the container command: `web`, `worker --queues=critical,default`, `scheduler`, `migrate`.

* **DEP-06** The admin build output (`apps/admin/dist`) is copied into the server image under `public/admin`, so the web role can serve it when no CDN is used.

### 19.2 Generated deployment files

| File | Purpose |
| --- | --- |
| `Dockerfile`, `.dockerignore` | Image above |
| `.env.production.example`, `deploy/` | What production reads, the Caddyfile, the backup and the upload scripts (DEP-07) |
| `compose.yaml` | Local services for development |
| `compose.prod.yaml` | Single-server production: proxy, web, worker, scheduler, migrate, database, Valkey |
| Helm chart (`bieberkit deploy:helm`) | Kubernetes deployments with probes, preStop hook, migrate job, autoscaling |
| apps/site/Dockerfile | Public site image (Nitro Node server on dhi.io/node:26), generated when the site is enabled |

### 19.3 Health endpoints

| Endpoint | Checks | Used for |
| --- | --- | --- |
| `/health/live` | Event loop responds. No external dependencies | Restart a stuck process |
| `/health/ready` | Process booted and not shutting down. Dependency health goes to metrics and bieberkit doctor, so a short database blip does not pull every pod out at once | Send or stop traffic |
| `/health/startup` | Boot sequence finished | Delay the other probes during slow starts |

### 19.4 Graceful shutdown

1. On SIGTERM, `/health/ready` starts returning 503.
2. Wait a short drain delay (default 5 s) so the load balancer stops routing new requests.
3. Stop accepting new connections. Since Node.js 19, `server.close()` also closes idle keep-alive connections, so no custom code is needed.
4. Wait for in-flight requests up to a timeout (default 20 s).
5. Workers stop taking jobs and let running jobs finish within the same budget. Unfinished jobs return to the queue.
6. Run plugin `onShutdown` hooks in reverse boot order, then close database and Valkey pools.
7. Exit with code 0, or 1 if the timeout was hit.

The orchestrator's grace period (for example `terminationGracePeriodSeconds`) MUST be longer than the drain delay plus the shutdown timeout.

### 19.5 Rollout order

1. Build and scan the image, then push it to the registry.
2. Run the `migrate` role once and wait for success. Migrations are backward compatible (DATA-08).
3. Roll out `web` and `worker` gradually.
4. Replace `scheduler` with a stop-then-start strategy, so two schedulers never overlap.

### 19.6 Deployment targets

| Scale | Runs on | Provided by BieberKit |
| --- | --- | --- |
| Small | One VPS with Docker Compose and Caddy | `compose.prod.yaml` |
| Medium | Several VPS with Kamal or Docker Swarm | Image, env template, deploy notes |
| Large | Kubernetes, web scaled on CPU, workers scaled on queue depth | Helm chart |

### 19.7 Public site

- The site ships as its own image and runs as a stateless service that scales on CPU and latency, like the web role.
- The load balancer routes `/api/*` to web, /admin/\* to the admin static files, and all other paths to the site (SITE-03).
- The site exposes `/health` and follows the same graceful shutdown rules as the server roles.
- Rollout order: migrate, then web and worker, then the site, so the site never calls an API version older than it expects.

### 19.8 Backups and recovery

- **DEP-07** `compose.prod.yaml` includes a backup service that dumps the database daily, encrypts the dump and uploads it to a separate bucket. Retention defaults to 7 daily, 4 weekly and 6 monthly copies.
- **DEP-08** Object storage buckets SHOULD have versioning enabled. The docs explain how for S3, R2 and MinIO.
- **DEP-09** `bieberkit backup:verify` restores the latest dump into a throwaway container and runs migrations and health checks against it. The docs recommend running it weekly.
- **DEP-10** The deployment guide states target recovery figures for the reference setup: at most 24 hours of data loss with daily dumps, less with point-in-time recovery on managed databases.

## 20. Observability

Every process writes JSON logs to stdout, exports OpenTelemetry traces when an endpoint is configured, and exposes Prometheus metrics on a separate port.

- **OBS-01** Logs use pino, bound as in ADR 0003: `@bieberkit/core` owns the `Logger` port, a dependency-free default logger and the request context, and only `@bieberkit/log/pino` imports pino. Each line carries `time`, `level`, `msg`, `role`, `requestId`, `traceId`, `spanId`, and `tenantId` and `userId` when known.
- **OBS-02** Traces cover HTTP requests, database queries, cache calls, queue dispatch and job execution, with trace context carried from the request into the jobs it creates. Core writes them (OTLP over HTTP, no SDK, ADR 0023), and a span holds ids, names and counts, never a statement, a URL query, a header, a body or an error message.
- **OBS-03** Metrics: HTTP duration histogram by route and status, event loop lag, heap usage, database pool usage, queue depth and job duration by queue, cache hit ratio.
- **OBS-04** The metrics port is never exposed through the public load balancer. The server answers `GET /metrics` only, and refuses a request that carries a `Forwarded` or `X-Forwarded-*` header.
- **OBS-05** The audit log is a database table separate from application logs, append-only for the application role, and viewable in the admin UI.
- **OBS-06** Unhandled errors are reported with the request or job context through an error-reporter contract. A Sentry-compatible driver is optional. The reporter never throws and never waits, reports carry ids and the place of the error and never a body, a header or a query string, and a Sentry-compatible server is reached through `ERROR_REPORTER_DSN` with no SDK.

## 21. Testing strategy

Tests run against real databases in containers, and a large share of tests is generated from entity definitions so that security rules are checked for every entity automatically.

| Layer | Tool | Scope | Runs on |
| --- | --- | --- | --- |
| Unit | Vitest 4 | Pure functions, services with fakes | Every push |
| Module integration | Vitest 4, Testcontainers | One module booted alone against PostgreSQL, MySQL and SQLite | Every push |
| Generated contract | `@bieberkit/testing` | Each entity: permissions, field masks, tenant isolation, validation, pagination limits, generated from the `permissions` block. The generator is mutation-tested against six known faults (ADR 0013) | Every push |
| End to end | Playwright | Login, CRUD in the admin UI, uploads, one flow per template | Pull requests to main |
| Upgrade | `examples/` apps | `bieberkit upgrade` and codemods on sample apps from the previous minor and major | Release candidates |
| Load | k6 | Reference endpoints in section 18 | Release candidates |
| Headers and rules | `bieberkit check` | File headers, boundaries, env access, destructive migrations | Every push and pre-commit |
| Component | Vitest 4 Browser Mode | admin-core hooks, UI adapter components, block renderers, site components | Every push |
| Accessibility and SEO | Playwright with axe, Lighthouse CI | Generic admin screens against WCAG 2.2 AA (UI-07), cms site pages against SEO-09 | Pull requests to main |

- **TST-01** Coverage targets: 90% lines for `@bieberkit/core`, `data`, `http` and `auth`. 80% for other packages and first-party plugins.
- **TST-02** `@bieberkit/testing` provides `createTestApp({ modules })`, entity factories, `actingAs(user, roles)` and `withTenant(tenant)`. Its platform services use memory and a sync queue; `mailbox` exposes sent messages, and `runOutbox()` delivers one committed batch and returns the number of rows claimed (BPL-02).
- **TST-03** A test that needs a network call outside the test containers fails, so tests stay deterministic.

## 22. AI-assisted development

BieberKit is built with AI coding agents and is meant to be used with them. The main lever is design (P1, P3, P10), not prompt files: one pattern per task, types that reject wrong code, and fast checks the agent can run itself.

### 22.1 Shipped to every project

| Item | Content |
| --- | --- |
| `AGENTS.md` | Hand-written and short: commands, folder rules, things never to do, where the docs are. No architecture essay. |
| `CLAUDE.md` | One line that points to `AGENTS.md` |
| Agent Skills | `bieberkit-add-entity`, `bieberkit-add-module`, `bieberkit-add-workflow`, `bieberkit-write-tests`, `bieberkit-upgrade`, in the open Agent Skills format |
| Bundled docs | `node_modules/@bieberkit/core/docs/*.md` and an `llms.txt` index, matching the installed version |
| `bieberkit mcp` | Development-only MCP server: list modules, entities, fields, permissions, routes and workflows, read recent errors and logs, validate an entity definition, run `bieberkit check` |

### 22.2 Rules

- **AI-01** `AGENTS.md` stays short and is written by a human. A 2026 ETH Zurich study found that LLM-generated context files slightly lowered agent success and raised cost by over 20%, while human-written ones helped only marginally.
- **AI-02** Every CLI error and check violation has a stable code, the fix in one line and a docs link, so an agent can repair its own mistake.
- **AI-03** Every CLI command supports `--json`.
- **AI-04** The MCP server is off in production builds and binds only to localhost.

### 22.3 Building BieberKit itself with AI

1. Write an ADR and a short module spec before code. Split the work into small tasks.
2. The maintainer designs and reviews the sensitive core by hand: public API of `defineEntity` and `definePlugin`, authentication, authorization, tenant isolation, release pipeline.
3. Agents write tests from the spec first. The maintainer reviews the tests, then agents implement.
4. An API report of each package's public surface is committed. Any change to it shows in the diff and needs a changeset.
5. A second, independent AI review runs on each pull request. The maintainer makes the final call and merges nothing they cannot explain.
6. A real pilot project is built in parallel with the framework from Phase 1.

## 23. Licensing and mandatory file headers

BieberKit is licensed under the Apache License 2.0. Every file in the framework repository that can hold a comment MUST start with a header that names the file, describes it, and states the author Bieber Kieu (kieutrongthien@gmail.com), the copyright and the license.

### 23.1 License files and metadata

- `LICENSE` holds the full Apache License 2.0 text, at the repository root and inside every published package.
- `NOTICE` at the root reads:

```text
BieberKit
Copyright 2026 Bieber Kieu <kieutrongthien@gmail.com>

This product includes software developed by Bieber Kieu.
```

- Every `package.json` sets `"license": "Apache-2.0"` and `"author": "Bieber Kieu <kieutrongthien@gmail.com>"`.
- Contributions are accepted under the same license (Apache 2.0, section 5) with a Developer Certificate of Origin `Signed-off-by` line on each commit.

### 23.2 Header for TypeScript, JavaScript and CSS

```ts
/**
 * BieberKit
 *
 * @file        packages/core/src/kernel.ts
 * @description Boots modules and plugins and manages the application lifecycle.
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
```

### 23.3 Header for hash-comment files

Used for YAML, Dockerfile, shell scripts, `.env.example`, `.gitignore`, `.git-blame-ignore-revs`, `.npmrc` and TOML. The license paragraph is the same as above, prefixed with ` #  `.

```yaml
# BieberKit
#
# @file        templates/blank/compose.yaml
# @description Local development services: database and Valkey.
# @author      Bieber Kieu <kieutrongthien@gmail.com>
# @copyright   Copyright (c) 2026 Bieber Kieu
# @license     Apache-2.0
#
# Licensed under the Apache License, Version 2.0 (the "License");
# ... (same license paragraph as 23.2)
#
# SPDX-License-Identifier: Apache-2.0
```

Other comment styles: Markdown and HTML use one `<!-- ... -->` block, SQL uses `--` lines.

### 23.4 Rules

- **HDR-01** The header is the first content of the file. Exceptions that must stay first: a shebang (`#!/usr/bin/env node`) and a Dockerfile `# syntax=` directive. The header follows directly after them. In Markdown with frontmatter, the header follows the frontmatter, and blank lines between them are allowed.
- **HDR-02** `@file` is the path relative to the repository root. `@description` is one sentence about what the file does, never empty.
- **HDR-03** The copyright year is the year the file was created and is not bumped every year.
- **HDR-04** The `@author` line for Bieber Kieu always comes first. Maintainers MAY add further `@author` lines for substantial contributions.
- **HDR-05** Generated files that allow comments (for example the typed client) carry the header plus a `@generated` tag and the command that generated them.
- **HDR-06** Code samples in the documentation and in this specification omit headers for brevity. Files created from those samples still need them.

### 23.5 Exempt files

| File type | Reason | Where authorship is stated instead |
| --- | --- | --- |
| JSON (`package.json`, `tsconfig.json`, `turbo.json`) | No comment syntax | `author` and `license` fields where the format allows |
| Lockfiles | Generated by pnpm | Not applicable |
| `.changeset/*.md` except its `README.md` | Written by the changesets CLI, and the text becomes the changelog | The commit that adds them |
| `LICENSE`, `NOTICE` | Legal text | The files themselves |
| Images, fonts, other binaries | No comment syntax | `NOTICE` and asset credits in `docs/` |
| Vendored third-party files | Must keep their original notice | Their own header, plus an entry in `NOTICE` |

### 23.6 Enforcement

- `bieberkit check headers` (in the repository: `pnpm check:headers`) verifies presence, field order, path, non-empty description and SPDX line.
- It runs in the pre-commit hook and in CI. CI fails on any violation.
- `--fix` inserts a header with the correct path. It leaves the description for the author to write, and CI fails until it is filled.

### 23.7 Headers in generated projects

- Files the scaffolder creates in a user's project carry the same header layout, with the project name, the project author from `--author` or git config, and the project's license from `bieberkit.config.ts` (default `UNLICENSED`, set with `--license`). For a known SPDX identifier the scaffolder also writes the matching `LICENSE` file, and for `UNLICENSED` it writes none.
- Files copied in from the BieberKit registry keep the BieberKit header, because Apache 2.0 section 4 requires keeping copyright notices. A user who changes such a file adds a `@modified-by` line.

## 24. Open source governance, releases and support

BieberKit has one maintainer, Bieber Kieu, who makes final decisions. Process exists to keep that sustainable: small scope, automated releases, and a contribution policy that protects review time.

### 24.1 Contributions

- **GOV-01** Issue first. A pull request needs a linked issue that a maintainer has accepted, except for typo and documentation fixes.
- **GOV-02** AI use is allowed and must be disclosed in the pull request. The author must be able to explain every change. Pull requests without an accepted issue, or that the author cannot explain, are closed.
- **GOV-03** Every commit carries a DCO `Signed-off-by` line.
- **GOV-04** The Contributor Covenant is the code of conduct.
- **GOV-05** Pull requests from outside collaborators may be limited in repository settings when review load requires it.

### 24.2 Versioning and releases

- All `@bieberkit/*` packages share one version and are released together (release train), so `bieberkit upgrade` moves one number.
- Tarballs are packed once in the build job, checked by checksum in the publish job and published in layer order. A rerun skips versions that already exist, so a partly published release is finished by running the job again (ADR 0014).
- Semantic Versioning. Changes are recorded with changesets, and changelogs are generated from them.
- A public API is deprecated in a minor release before it is removed in the next major. Deprecations log a warning with the replacement.
- Every breaking change ships a codemod run by `bieberkit upgrade`, tested against `examples/`.
- Releases follow SEC-15 to SEC-17.

### 24.3 Support policy

| Line | Support |
| --- | --- |
| Current major | Features, fixes, security fixes |
| Previous major | Security fixes for 6 months after the next major ships |
| Node.js | Active and maintenance LTS lines only. Node.js 24 until its end of life on 2028-04-30 |
| Databases | Versions in section 9.1 that are still supported upstream |

### 24.4 Repository files

`README.md`, `LICENSE`, `NOTICE`, `CONTRIBUTING.md`, `SECURITY.md`, `CODE_OF_CONDUCT.md`, `AGENTS.md`, `CLAUDE.md`, `CODEOWNERS`, issue and pull request templates. All carry headers where the format allows (section 23).

## 25. Roadmap

BieberKit reaches 1.0 in four phases. A phase ends only when its gate is met. The maintainer has chosen to implement Phase 2 and prepare a verified pre-1.0 npm release before M1.10 Pilot. Phase 2 work may proceed while the Phase 1 production gate remains open; neither publication nor template tests complete that gate. The core is proven on a real pilot project before 1.0 is declared production ready.

| Phase | Duration | Scope | Gate |
| --- | --- | --- | --- |
| 0. Foundations | 2 to 3 weeks | Spikes and ADRs, repository, CI, headers, release pipeline | ADRs accepted |
| 1. Core MVP | 2 to 3 months | Kernel, data, HTTP, auth, CLI, blank template, pilot project | Pilot live in production |
| 2. Plugins and templates | 2 to 3 months | cms, crm, saas, admin renderer, public site, registry | All three dialects green |
| 3. Hardening and 1.0 | Before 1.0 | Security review, docs, MCP, Helm, load tests | 1.0 released |

Durations are rough estimates for one maintainer working with AI agents. Phase 3 has no estimate until Phase 2 ends. The independent review judged the full scope at about three times what one maintainer can harden for 1.0. The scope is kept on purpose, so these estimates are optimistic and the phase gates are what protect quality.

Gate criteria:

- **ADRs accepted.** Decisions recorded for ORM, plugin manifest, `defineEntity` API, auth, queue drivers and release pipeline. Header checker and trusted publishing work end to end.
- **Pilot live in production.** One real project runs on the `blank` template with web, worker and scheduler roles behind a load balancer.
- **All three dialects green.** The full test suite, including generated permission and tenant tests, passes on PostgreSQL, MySQL and SQLite for every first-party plugin.
- **1.0 released.** Security review against section 17 done, performance targets in section 18 met, documentation and upgrade codemods published.

## 26. Risks and open questions

The largest risk is scope: a framework with many plugins and three dialects can outgrow one maintainer. The mitigations below keep the core small and push work to automation.

| Risk | Impact | Mitigation |
| --- | --- | --- |
| Scope grows faster than one maintainer can review | Stalled releases, burnout | Small core (P4), issue-first policy, plugins outside core, release train |
| Three dialects triple test and bug surface | Slower releases | Tier 2 for SQLite, dialect-free core (DATA-01), CI matrix from day one |
| CASL to MikroORM condition translator: @ucast/sql has a MikroORM module but may not support version 7 | Wrong rows returned if buggy | Decided in ADR 0013: an own translator limited to a small operator set that fails closed, with generated permission tests for every entity, which are mutation-tested |
| Better Auth ships many security advisories | Auth vulnerabilities in projects | Pinned minimum version, Renovate fast path, advisory watch |
| npm supply-chain attacks | Compromised builds or releases | SEC-11 to SEC-17 |
| Over-abstraction in `defineEntity` | Hard to express unusual cases | Escape hatches to raw MikroORM entities and custom routes, tested in examples |
| Upstream breaking changes (MikroORM, Fastify, Ant Design) | Forced majors | Drivers behind contracts (P12), ORM-independent field DSL (10.6), foundation libraries pinned and covered by upgrade tests |
| Bus factor of one | Project stops if the maintainer stops | Docs and ADRs in the repository, automated release, Apache 2.0 allows forks |
| TanStack Start is young (1.0 in October 2026) | Breaking changes or vulnerabilities in public sites | Site isolated from data stores (SITE-02), pinned versions, headless contract allows another renderer |
| Admin UI adapter contract designed too narrowly around Ant Design | Other adapters impossible without core changes | Build a small second adapter as a test fixture in Phase 2 to prove the contract |
| Several core libraries rely on one main maintainer (MikroORM, CASL, BentoCache, tsdown) | Slow fixes or abandonment upstream | Drivers are replaceable through contracts. Foundation libraries are pinned, sponsored, and forked for critical fixes if needed |
| Full v1 scope (three dialects, SSR site, workflows, admin adapters) is about three times what one maintainer can harden (independent review) | Later 1.0, or a 1.0 with weak spots | Strict phase gates, MySQL and site hardened after the PostgreSQL core is stable, AI agents for tests and docs, no release before its gate is met |

Open questions:

- [ ] Reserve the `@bieberkit` npm scope, the `bieberkit` and `create-bieberkit` package names, and the GitHub organization.
- [ ] Confirm with the employer that BieberKit is a personal project and can be published, if any part is built during work time or for company projects.
- [x] Verify that Ant Design 6 ships a complete `vi_VN` locale, or plan to contribute one. Checked 2026-11-22 against antd 6.7.1: `vi_VN` lacks 2 of the 207 `en_US` keys (`global.clear`, `Input.otpCell`). The admin adapter overrides those two keys in its `vi` locale and offers them upstream.
- [x] Decide whether MariaDB is officially supported or best effort. Best effort (ADR 0005).
- [x] Choose the docs site generator and hosting. Starlight on Cloudflare Pages (ADR 0006).
- [x] Decide the default license for generated projects. `UNLICENSED`, changeable with `--license` (ADR 0007).
- [ ] Validate the performance targets in section 18 with Phase 1 benchmarks.

## Document history

| Version | Date | Changes |
| --- | --- | --- |
| 0.8.40 | 2026-11-28 | ADR 0040 (Proposed) and `docs/modules/plugin-admin.md`: a plugin ships its own admin UI in fixed slots and a project builds its admin from its plugins (UI-34 to UI-38); no `auth-ui` plugin, the account screens are of `users` (12, UI-26); UI-03, UI-04, UI-10, UI-11, UI-24 to UI-32, the CLI table, 11.1 and 11.3 follow. The code still follows ADR 0025 and 0037 until the items of M2.2 land |
| 0.8.39 | 2026-11-28 | UI-26 and `docs/modules/admin-account.md`: a second factor is optional unless it is asked for (AUTH-05), TOTP is always on (AUTH-03), a password set by a link ends the sessions (AUTH-06), the links lead to the admin (USR-10), `mfaRequired` (USR-12) and `requireMfa` of a system role (ROL-06) |
| 0.8.38 | 2026-11-27 | ADR 0039 and `docs/modules/admin-identity.md`: the colors `frame` and `accent` and the bundled font (UI-23), the order of the menu and the box that goes to a page (UI-24), and `admin.brand` (UI-33) |
| 0.8.37 | 2026-11-27 | ADR 0038: content is `{ version: 1, blocks }`, the HTML serializer and the React renderer draw one checked element tree, and there is no raw HTML block (CNT-01, CNT-03) |
| 0.8.36 | 2026-11-27 | M2.2: the identity of the admin, its frame, and the screens of the base plugins in a `blank` project (UI-23 to UI-32) |
| 0.8.35 | 2026-11-27 | ADR 0037: the `admin` key of a plugin, its modules served under the admin, the host that a module gets, and `extensions` in `_meta` (UI-04) |
| 0.8.34 | 2026-11-27 | ADR 0036: `f.file()` and `f.image()`, the check of a file on a write, the upload of the admin to the storage with a signed URL, and the origin of the bucket in the policy of the admin (UI-11, SEC-01) |
| 0.8.33 | 2026-11-27 | MOD-09: inline collections are in the body and the answer of a record, are saved in its transaction with the permissions of the line entity, and the form edits them as a table (UI-11) |
| 0.8.32 | 2026-11-27 | UI-11: the search of a list with `q` over the fields that are `searchable()` (folded, a prefix of the text), relation pickers with server search, the name of a related row in a list, and `include` with `fields` |
| 0.8.31 | 2026-11-27 | UI-11: `.admin({ visibleWhen, requiredWhen })` on a field, conditions as data that the server enforces on create, update and bulk update and that `_meta` carries to the form |
| 0.8.30 | 2026-11-27 | ADR 0035: the admin draws tables, forms and long lists with Ant Design and keeps their logic in pure functions of `admin-core`, so UI-01, UI-10 and UI-12 no longer name TanStack Table, Form and Virtual; axe is a dev dependency of the browser tests |
| 0.8.29 | 2026-11-27 | M2.2: the list (filters, views, bulk changes, moves of a state field, CSV, phone cards, `n` and `/`), the input of a transition in `_meta`, the check of a form, lazy languages, and the hashed files of the release before kept for a day, with `ADMIN_ASSETS_DIR` (UI-03, UI-12, UI-13, UI-16, UI-17, UI-22) |
| 0.8.28 | 2026-11-27 | M2.2 resilience: retry and backoff, the offline state, route error boundaries, lazy screens and the 400 kB budget check, the reload on a missing chunk, the unsaved-change guard, local drafts, Ctrl+S, the 412 view with a three-way merge, and the reports of UI-21 (UI-12, UI-17 to UI-19, UI-21, UI-22; parts) |
| 0.8.27 | 2026-11-27 | M2.2 languages: the dictionaries of en, vi and zh, the translator, the choice of a language, the formats of numbers, dates and money, and the language switch of the admin (UI-05) |
| 0.8.26 | 2026-11-27 | M2.2 tokens: the `theme` key of the config, `@bieberkit/tokens` with the defaults, the validation, the Ant Design, CSS variable and Tailwind compilers, and the theme in the page of the admin (UI-06, TOK-01 to TOK-03) |
| 0.8.25 | 2026-11-27 | M2.1 H2 (ADR 0033, ADR 0034): entity extensions, `extends` with `defineExtension` and a table of the extending plugin with one row for each row of the target (PLG-06); the example of 11.1 and the text of 11.3 |
| 0.8.24 | 2026-11-27 | M2.1 H3: `bieberkit plugins` shows the graph with its edges and what each plugin owns, `make:plugin`, and `remove` that changes nothing when pnpm fails or the question is cancelled (PLG-03) |
| 0.8.23 | 2026-11-27 | M2.1 H4: `check boundaries` for relative and `node_modules` paths into a plugin and for exports patterns (PLG-01), and the rule `plugin-tables` (PLG-02) |
| 0.8.22 | 2026-11-27 | M2.1 H5: `DEPLOY_ID` names a deploy for DATA-08, `bieberkit migrate --deploy-id`, `BK_MIGRATE_REFUSED` names the waiting steps, and `BK_STEP_CONTRACT_NO_AFTER` |
| 0.8.21 | 2026-11-27 | Base plugins S6, operations: section 12.10, OPS-01 to OPS-06; `Idempotency-Key` on `DELETE`, per-actor limits, settings export and import, download audit of media, indexes and the tests at 100 000 rows |
| 0.8.20 | 2026-11-27 | Base plugins S6, audit: section 12.9, AUD-07 to AUD-09; the audit mirror, `after=` for a SIEM, legal holds and `kept` in `audit:prune` (ADR 0032) |
| 0.8.19 | 2026-11-27 | Base plugins S6, managed identities: section 12.8, IDN-02, IDN-03, ROL-08 and ROL-09; `USERS_MANAGED_EXTERNALLY`, `upsertExternalUser`, `setExternalDisabled`, groups and roles limited to a group |
| 0.8.18 | 2026-11-27 | Base plugins S6, policies: section 12.7, POL-01 to POL-05; the `PolicyReader` port (ADR 0031), the `security.*` settings, `ipRestricted` roles, known devices and the `guard` of a setting declaration |
| 0.8.17 | 2026-11-27 | Base plugins S5: section 12.6, AUD-01 to AUD-06; audit-log filters, one entry with its actor, the export, the actions, tenant reads, and `bieberkit audit:prune` in section 5.2 |
| 0.8.16 | 2026-11-27 | Base plugins S4: section 12.5, MED-01 to MED-08; media files of a tenant with fixed visibility, read URLs, deletion after commit, folders, filters and limits; S-06 names the type that a ready file keeps |
| 0.8.15 | 2026-11-26 | Base plugins S3: section 12.4, NTF-01 to NTF-07; the notifier, preferences, retention and module schedules; the sync queue runs an outbox job after the transaction of the dispatcher (BPL-04) |
| 0.8.14 | 2026-11-26 | Base plugins S2: section 12.3, SET-01 to SET-07; settings are declared with `defineSetting` and contributed under `settings` (ADR 0030) |
| 0.8.13 | 2026-11-26 | Base plugins S1: section 12.2, USR-01 to USR-12 and ROL-01 to ROL-08; the user service, auth migration 0.6.0 (`lastSignInAt`, `deletedAt`, the `lower(name)` index), invitations, deletion by anonymizing, the self and last-administrator guards and the escalation guard |
| 0.8.12 | 2026-11-25 | Base-plugin platform S0: BPL-01 to BPL-04 and IDN-01; disabled users, identity columns, typed mail/queue/cache services, authentication mail, outbox subscriptions and test-app mailbox/outbox helpers. Other base-plugin slices remain open |
| 0.8.11 | 2026-11-24 | UI-14: the address of the admin is `ADMIN_URL`, a path or a host of its own, and the build does not know it |
| 0.8.10 | 2026-11-24 | DATA-28: every table of the framework and of first-party plugins starts with `bk_` (ADR 0027) |
| 0.8.9 | 2026-11-24 | M1.9: the base image of the generated Dockerfile is `node:26-slim` by digest until the hardened image can be pulled (ADR 0026), the files of section 19.2 (`.dockerignore`, `.env.production.example`, `deploy/`), and the first k6 results against section 18.1 |
| 0.8.8 | 2026-11-24 | M1.8: the lock of the migrate role (DATA-25), `migrate --allow-destructive` in section 5.2, the base plugins and their services, the first admin slice without TanStack Table, Form and Virtual (ADR 0025), and the policy of the admin (UI-14) |
| 0.8.7 | 2026-11-24 | M1.6 and M1.7 (the defaults of `--yes` and the missing flags in section 5.1): traces and metrics without an SDK (OBS-02 to OBS-04, ADR 0023), the log package (ADR 0022), and in section 5.2 the command `bieberkit generate`, the names of the rules of `bieberkit check` and the ignore directive |
| 0.8.6 | 2026-11-22 | Section 11.2: the codes raised by `definePlugin` and by the manifest check (`PLG_NAME`, `PLG_MANIFEST_NAME`, and the existing ones), and how the short name of a plugin is derived. Found while implementing M1.1 |
| 0.8.5 | 2026-11-22 | Section 23.5: changeset files are exempt from the header, because their text becomes the changelog. Found while adding the first changeset of M1.1 |
| 0.8.4 | 2026-11-22 | ADRs 0010 to 0014: queue drivers and outbox rules (Q-01, Q-05, Q-07, Q-11, MOD-18), plugin manifest, resolver and migration steps (PLG-07, PLG-08, DATA-08, DATA-24, DATA-27), Better Auth on MikroORM's Kysely (AUTH-01, AUTH-09 to AUTH-11), own authorization translator (AUTHZ-02, AUTHZ-05, AUTHZ-06), release pipeline (SEC-13, SEC-15, SEC-16, SEC-21, section 24.2) |
| 0.8.3 | 2026-11-22 | ADR 0009: `EntityDef<Name>` with a generated `EntityRegistry`, descriptors compiled by pure functions, `f.custom` takes schema values, ORM-free entity files, bulk write helpers for shadow columns, serializer wording, SCH-07, SCH-08, DATA-26 |
| 0.8.2 | 2026-11-22 | ADR 0008: MikroORM 7.2 pinned, tenant foreign keys on `UNIQUE (tenant_id, id)`, shadow columns only for `ci` and `ci_ai` (`đ` folds to `d`), safe integer limit for money, `BEGIN IMMEDIATE` through a driver override |
| 0.8.1 | 2026-11-22 | Phase 0 decisions from ADR 0002 to 0007: Oxfmt kept with a header rule for frontmatter, `@bieberkit/log` package, Tiptap, MariaDB best effort, Starlight on Cloudflare Pages, `--license` flag, three open questions closed |
| 0.8 | 2026-11-22 | Independent review fixes: private caching for session-rendered pages, versioned plugin migrations, per-request tenant and cross-tenant reference checks, separate cache Valkey, Better Auth integration rules, unordered outbox with versions, honest cache guarantees, static plugin manifests, collation semantics, integer money, Vietnamese search, crypto-shredded audit, supply-chain fixes, P12 narrowed, MySQL 8.4, 15 minor fixes. Scope kept as is |
| 0.7 | 2026-11-21 | Structure, part 2: write path and outbox flow, durable workflows, metadata contract, site composition, generated files. Fixes: commit before response, synchronous cache purge after commit, extension tables for plugin fields |
| 0.6 | 2026-11-21 | Structure: package layers, project configuration, request pipeline, app structure, tenant resolution, job context, standard columns, validator conformance, generated types, outbox ordering |
| 0.5 | 2026-11-21 | Foundation review: ports and adapters principle, schema pipeline with Ajv and Zod Mini, module structure and error model, BentoCache, Oxlint and Oxfmt, tsdown, Node.js 26 by default with 24.12 minimum |
| 0.4 | 2026-11-21 | Review fixes: concurrency control, bulk and aggregate APIs, money and sequences, import and export, personal data, backups, mobile admin, conflict handling, site forms and consent |
| 0.3 | 2026-11-21 | Headless admin core with UI adapters, design tokens, block content, read path performance, actions and state machines, realtime, search, webhooks |
| 0.2 | 2026-11-21 | Public site with server-side rendering and SEO |
| 0.1 | 2026-11-21 | First complete draft |

## References

Versions and dates in this specification were checked on 2026-11-21 and should be re-checked before each phase.

- [MikroORM: defining entities with defineEntity](https://mikro-orm.io/docs/define-entity)
- [Drizzle ORM: schema declaration per dialect](https://orm.drizzle.team/docs/sql-schema-declaration)
- [pnpm: working with Docker](https://pnpm.io/docker)
- [pnpm: deploy command](https://pnpm.io/cli/deploy)
- [Docker: free Docker Hardened Images](https://www.docker.com/blog/docker-hardened-images-for-every-developer/)
- [npm: trusted publishers](https://docs.npmjs.com/trusted-publishers)
- [TanStack advisory GHSA-g7cv-rxg3-hmpx (May 2026 compromise)](https://github.com/TanStack/router/security/advisories/GHSA-g7cv-rxg3-hmpx)
- [Anthropic: donating Agent Skills to the Agentic AI Foundation](https://www.anthropic.com/news/donating-agent-skills-to-the-agentic-ai-foundation)
- [Gloaguen et al., Evaluating AGENTS.md (arXiv 2602.11988)](https://arxiv.org/abs/2602.11988)
- [unstorage drivers](https://unstorage.unjs.io/drivers)
- [AdonisJS Drive on FlyDrive](https://docs.adonisjs.com/guides/digging-deeper/drive)
- [Apache License 2.0](http://www.apache.org/licenses/LICENSE-2.0)

* [TanStack Start 1.0 is stable](https://tanstack.com/blog/tanstack-start-1-0)
* [TanStack Start: SEO guide](https://tanstack.com/start/latest/docs/framework/react/guide/seo)
* [Astro 6 release](https://astro.build/blog/astro-6)

- [Vietnam Personal Data Protection Law 91/2025/QH15](https://thuvienphapluat.vn/van-ban/Cong-nghe-thong-tin/Luat-Bao-ve-du-lieu-ca-nhan-2025-91-2025-QH15-625628.aspx)
- [PwC: Decree 356/2025/ND-CP on personal data protection](https://www.pwc.com/vn/vn/publications/2026/20260128-new-rules-personal-data-protection.pdf)

* [Oxlint: type-aware linting stable](https://oxc.rs/blog/2026-07-22-type-aware-linting-stable)
* [BentoCache](https://www.npmjs.com/package/bentocache)
* [tsdown](https://socket.dev/npm/package/tsdown/overview/0.22.0)
* [CASL releases](https://github.com/stalniy/casl/releases)
