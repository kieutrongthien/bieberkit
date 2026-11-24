<!--
  BieberKit

  @file        docs/ROADMAP.md
  @description Phase by phase checklist from the scaffold to 1.0, derived from spec section 25, ticked by agents as work lands.
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

# BieberKit roadmap

Derived from `docs/spec/SPEC.md` section 25 (spec 0.8). The spec stays the source of truth: when this file and the spec disagree, the spec wins and this file is fixed in the same pull request.

## How agents use this file

1. Pick the first unticked milestone whose dependencies are ticked. Work inside one milestone at a time.
2. Follow the skill `bieberkit-implement-task` for every item. It runs the Superpowers skills in order (brainstorming into an ADR or module spec, writing-plans, test-driven-development, verification-before-completion) and ends with `pnpm check`, `pnpm typecheck`, `pnpm lint`, `pnpm test` and a signed commit.
3. Tick an item (`- [x]`) in the same commit that lands its work. Tick only when its evidence exists: a merged test named after the requirement ID, an accepted ADR, or a command that passes. Never tick from memory.
4. Items tagged **[M]** are the maintainer's call. Agents prepare them (propose an ADR as `Proposed`, show tests, open a pull request) and never tick them or merge them.
5. Items tagged **[D]** are maintainer-designed areas (AGENTS.md, Workflow): use plan mode, propose, never merge. Applies to the public API of `defineEntity` and `definePlugin`, authentication, authorization, tenant isolation and the release pipeline.
6. A phase gate is ticked only by the maintainer. A milestone is done when every item is ticked and its "Done when" line holds.
7. If a requirement turns out wrong or missing, stop and write an ADR or a spec change. Do not work around it (P1).
8. Add a new item here only when the spec gains the requirement behind it. Do not invent scope.

Legend: **[M]** maintainer only, **[D]** maintainer-designed area, `ID` a spec requirement (for example `MOD-16`), `§` a spec section.

## Status

| Phase                    | Gate                     | State                      |
| ------------------------ | ------------------------ | -------------------------- |
| 0. Foundations           | ADRs accepted            | In progress, scaffold done |
| 1. Core MVP              | Pilot live in production | Not started                |
| 2. Plugins and templates | All three dialects green | Not started                |
| 3. Hardening and 1.0     | 1.0 released             | Not started                |

Order inside Phase 1 follows the package layers (PKG-01): foundation, contracts, product, tools. Each milestone only depends on earlier ones.

---

## Phase 0. Foundations

Goal: decisions recorded, repository and release pipeline proven. No framework code beyond stubs.

### M0.1 Repository scaffold

- [x] Monorepo with 18 package folders, pnpm workspace, Turborepo, shared tsconfig (§4.1)
- [x] Header checker `tools/check-headers.ts` (HDR-01 to HDR-05, §23.6)
- [x] Layer checker `tools/check-layers.ts` (PKG-01)
- [x] Skill sync `tools/sync-skills.ts` and four repository skills in `.agents/skills/`
- [x] `AGENTS.md`, `CLAUDE.md`, `GEMINI.md`, CODEOWNERS (SEC-14)
- [x] `LICENSE`, `NOTICE`, `SECURITY.md`, `CONTRIBUTING.md`, `CODE_OF_CONDUCT.md`, issue and PR templates (§24.4)
- [x] pnpm supply-chain settings in `pnpm-workspace.yaml` (SEC-11)
- [x] Git hooks `pre-commit` and `commit-msg` (DCO, Conventional Commits)
- [x] Changesets config and Renovate config
- [x] ADR 0001 and the ADR and module spec templates

Done when: `pnpm install && pnpm check` passes on a clean clone.

### M0.2 Spikes and ADRs

Each ADR is written as `Proposed` with the spike result attached. The maintainer accepts (§22.3, `docs/adr/README.md`).

- [x] **[M]** ADR: ORM and dialects. ADR 0008 accepted. Spike: MikroORM 7 `defineEntity` on PostgreSQL 15, MySQL 8.4 and SQLite with one entity set, UUIDv7 key storage (DATA-14), collation and integer money (MOD-11)
- [x] **[M][D]** ADR: plugin manifest, static `package.json` field, resolution, collisions, per-plugin migrations (PLG-07, DATA-24, §11.2) ADR 0011 accepted.
- [x] **[M][D]** ADR: `defineEntity` API and field DSL, compilation to MikroORM metadata, JSON Schema, Zod 4 Mini and CASL, escape hatches to raw MikroORM (§10.6, SCH-01 to SCH-06, P12) ADR 0009 accepted.
- [x] **[M][D]** ADR: authentication. Spike: Better Auth 1.7.16+ through a MikroORM adapter that joins the request transaction, on all three dialects (AUTH-09, AUTH-10) ADR 0012 accepted.
- [x] **[M][D]** ADR: authorization. Spike: `@ucast/sql` on MikroORM 7, otherwise an own CASL to ORM translator with a small operator set and generated permission tests (AUTHZ-02, §26) ADR 0013 accepted.
- [x] **[M]** ADR: queue drivers. Spike: BullMQ on Valkey and the `database` driver behind one contract, outbox dispatch with SKIP LOCKED (Q-05, MOD-18) ADR 0010 accepted.
- [x] **[M][D]** ADR: release pipeline, npm trusted publishing, protected tags, no shared cache, `id-token: write` on the publish job only (SEC-15, SEC-16, SEC-21) ADR 0014 accepted.
- [x] **[M]** ADR: content editor, Lexical or Tiptap, judged on block support, Vietnamese input, bundle size (CNT-04). ADR 0004 picks Tiptap 3. The Vietnamese input test is a gate before M2.3
- [x] **[M]** ADR: formatter, Oxfmt or Biome fallback (§3). ADR 0002 keeps Oxfmt
- [x] **[M]** ADR: where pino binds given `@bieberkit/core` has no runtime dependency (PKG-04, OBS-01). ADR 0003: `Logger` port in core, pino in `@bieberkit/log/pino`
- [x] **[M]** Decide the open questions in spec §26: MariaDB support level, docs site generator and hosting, default license of generated projects, Ant Design 6 `vi_VN` locale check. ADR 0005, 0006, 0007, and the locale check in spec §26
- [ ] **[M]** Reserve the `@bieberkit` npm scope, the `bieberkit` and `create-bieberkit` names and the GitHub organization; confirm the employer question (§26)
- [x] Update `docs/adr/README.md` index for every ADR added. ADRs 0001 to 0014 are listed

Done when: every ADR above has status `Accepted` and the spec §3 table matches them.

### M0.3 CI and release pipeline

- [ ] **[D]** `.github/workflows/ci.yml` runs `pnpm install --frozen-lockfile`, `check`, `typecheck`, `lint`, `format:check`, `test`, `build` on Node.js 26 and 24 (SEC-12, §3). Written, pinned and linted, and the same commands pass locally on Node.js 24.12 and 26. Tick after the first run on GitHub
- [x] Third-party Actions pinned by commit SHA (SEC-13). Every SHA was checked against its tag with `git ls-remote`, and zizmor reports no unpinned action
- [x] `publint` and `attw` run per package in CI (§3). `attw` runs with `--profile esm-only` (ADR 0014). `pnpm check:packages` passes on the 18 tarballs, and the `packages` job runs it
- [x] `tools/check-workflows.ts` runs in `pnpm check`, and `actionlint` and `zizmor` run in CI as containers pinned by digest (SEC-13, SEC-15, SEC-16, SEC-21, ADR 0014). Tests and negative controls pass
- [x] API report per package committed, diff shows in pull requests, changeset required on change (§22.3 step 4). `pnpm check:api`, `pnpm api:update` and the `changeset` job, with tests and a negative control
- [ ] **[D]** Release workflow: protected tags, manual approval environment, trusted publishing with provenance, no PR cache sharing, no install or build in the job holding `id-token: write` (SEC-15, SEC-16, SEC-21). Three jobs (`verify`, `build`, `publish`), tarballs packed once and checked by checksum, layer order, a rerun skips existing versions (ADR 0014). Written and linted, and its publish script ran against a local registry (partial run, rerun, tamper check). Tick after the dry run on GitHub
- [ ] **[D]** Dry-run release publishes a throwaway package end to end. The steps are in `docs/releasing.md` and need the organization, the npm scope and the trusted publishers, which the maintainer sets up
- [ ] Renovate rules: 7 day release age, fast path for Better Auth and TanStack Start advisories (AUTH-08, SITE-06). `renovate.json` is written and valid against the published schema. Tick after the Renovate app runs on the repository. Renovate keeps the action SHAs current (ADR 0014)
- [ ] Database service containers (PostgreSQL, MySQL, Valkey) available to CI for later phases (TST, §9.1). The `services` job is written with the images pinned by digest. Tick after the first run on GitHub. The job `integration` now starts them with `tools/test-services.sh` and runs the whole suite; tick after its first run on GitHub
- [x] Format the repository once with Oxfmt in its own commit, list it in `.git-blame-ignore-revs`, and let the header checker accept blank lines after Markdown frontmatter, with a test named `HDR-01`. `pnpm format:check` must pass before the CI item above can be ticked (HDR-01, ADR 0002)

Done when: the header checker and trusted publishing work end to end (spec §25 gate text).

### Phase 0 gate **[M]**

- [ ] **[M]** All ADRs accepted, header checker green in CI, dry-run trusted publish succeeded

---

## Phase 1. Core MVP

Goal: a `blank` project that a real pilot can run in production with web, worker and scheduler roles behind a load balancer. Dialect focus is PostgreSQL first; SQLite and MySQL run in CI from the start (§26 mitigation) but may carry known gaps until Phase 2.

### M1.1 Foundation: `@bieberkit/core`

Depends on: Phase 0 gate. Only Node.js built-ins (PKG-04).

- [x] **[D]** `defineModule`, `definePlugin`, `defineConfig` with the manifest fields of §11.1 (MOD-01, MOD-02, CFG-08, CFG-09)
- [x] `defineEnv` and merged env schema with secret redaction, native `.env` loading, precedence of real env (CFG-01 to CFG-06)
- [x] `Logger` port, dependency-free default JSON logger and request context on `AsyncLocalStorage` in core (OBS-01, PKG-04, ADR 0003)
- [x] Core env keys of §8.2 with defaults and the production safety checks (CFG-07, APP_SINGLE_NODE)
- [x] `process.env` read only in `packages/core/src/config/` (P8, `check` rule: `tools/check-env-access.ts`)
- [x] `BkError` base and subclasses with stable code, HTTP status, safe message (MOD-17)
- [x] Container: singleton, request and transient scopes, name resolution with inferred types, cycle and missing service fail at boot (§7.3)
- [x] Lifecycle: boot, ready, stop, reverse shutdown order, `onShutdown` hooks (§7.2, §19.4 steps 6 and 7)
- [x] Event bus with typed payloads (MOD-03, MOD-05)
- [x] **[D]** Plugin resolver: `core` range, `requires`, `conflicts`, `dialects`, topological sort, collision detection, shared with scaffolder and CLI (§11.2, PLG-07), with stable error codes and a dependency-free range matcher that is tested against `semver` (PLG-08, ADR 0011)
- [x] Process role selection from argv for `web`, `worker`, `scheduler`, `migrate` (§7.1)
- [x] Unit coverage at least 90% lines (TST-01): `pnpm test:coverage`, threshold 90% lines for `packages/core/src` in `vitest.config.ts`
- [x] **[D]** Run `pnpm test:coverage` in `ci.yml` (proposed: replace `pnpm test` in the `check` job, so the threshold fails the build). Done in the job `integration`, which starts the services and runs the whole suite with the thresholds on Node.js 26; the first run on GitHub is the proof

Done when: a test app boots a module and a plugin graph, fails on a missing env key with a stable code, and stops in reverse order. Proven by `packages/core/src/kernel.test.ts` (2026-11-22).

### M1.2 Data: `@bieberkit/data`

Depends on: M1.1.

- [x] **[D]** Field DSL `f.*`: id, string, email, oneOf, decimal, money, sequence, createdAt, updatedAt, belongsTo, hasMany, hasOne, state, computed (§10.1, MOD-08, MOD-11, MOD-12)
- [x] **[D]** `defineEntity` compiling to JSON Schema 2020-12, Zod 4 Mini and TypeScript types (SCH-01 to SCH-04)
- [x] **[D]** `defineEntity` compiling to MikroORM metadata (SCH-01, ADR 0009)
- [x] Unicode NFC normalization at the validation boundary; code point length semantics; shared fixtures through Ajv and Zod Mini fail CI on disagreement (SCH-03, SCH-05)
- [ ] Write helpers that add shadow column values for bulk writes (done: `bulkInsert`, `bulkUpdate`, and a runtime guard `DATA_SHADOW_STALE`), and a `bieberkit check` rule that flags direct `nativeUpdate` or `insert` on entities with compared fields (waits for the CLI of M1.8) (DATA-21, ADR 0009)
- [x] `f.custom` takes schema values only, with a bundle size test that fails when a whole validator library is pulled into the client (SCH-07, ADR 0009)
- [x] Standalone Ajv and fast-json-stringify modules emitted at build (SCH-06, PERF-06). `bieberkit build` writes them to `apps/server/dist/standalone/`; the web role loads them from M1.9
- [x] Standard columns and entity options: `version`, `created_by`, `updated_by`, `deleted_at`, `deleted_token` (DATA-18)
- [x] UUIDv7 keys, native storage per dialect (DATA-03, DATA-14)
- [x] UTC timestamps (DATA-04); request context per request and per job (DATA-05)
- [x] Pagination limits, keyset cursor, `withTotal` (DATA-06, DATA-11); index required for filter and sort fields (DATA-07)
- [x] Read-only query path with batched relations (DATA-10, PERF-04)
- [x] Soft delete with unique indexes including `deleted_token` (DATA-16)
- [x] `.localized()` translation table and `?locale=` fallback (DATA-17)
- [x] **[D]** Tenant model: `tenant: true`, global filter, `asSystem()` audited, unique constraints include `tenant_id`, tenant resolution per request (DATA-09, DATA-15, DATA-19, CFG-11)
- [x] **[D]** Cross-tenant reference checks on writes (spec 0.8 review fix)
- [x] Optimistic concurrency by `version` and `If-Match` (API-13)
- [x] Migrations: snapshot diff per dialect, `make`, `up`, `down` and `status` of `openMigrator`, destructive statement detection, expand then contract (DATA-08, §9.3). The `migrate` commands are in the CLI of M1.8
- [x] Plugin migration runner with `bk_plugin_migrations` and portable schema builder (DATA-24): step format, `deploy_id` guard, `uuidType` and `setNotNull` helpers, SQLite rebuilds with foreign keys off (DATA-08, DATA-27, ADR 0011). The `bieberkit check` rules are the functions `findStepRisks` and `detectDestructive`, and wait for the CLI of M1.8
- [x] `MIGRATE_DATABASE_URL` used only by the migrate role (DATA-25)
- [x] Outbox table, same-transaction write, dispatcher with SKIP LOCKED batches of 100, versioned events, per-subscriber processed ids, 7 day cleanup, lag numbers (MOD-18, §7.5). `LISTEN/NOTIFY` and the metric export wait for M1.5 and the observability package
- [x] Outbox dispatcher on MySQL and MariaDB deletes rows one at a time by primary key and retries on deadlock. The publisher gets the transaction of the claim, which is how the `database` queue driver of M1.5 joins it (MOD-18, ADR 0010)
- [x] Audit log table, append-only for the app role, written in the same transaction (OBS-05, AUTHZ-05)
- [x] Features `attachments`, `comments`, `timeline`, `tags` as generic tables (MOD-13). The storage of the files is M1.5, and the tabs of the admin are M1.8
- [x] State machines: `f.state` transitions validated on the server, never through plain update (MOD-06, MOD-07). The routes `POST .../actions/<name>` wait for M1.3
- [x] Document numbers: `f.sequence` numbered by the server in the saving transaction, gap free per tenant (MOD-12)
- [ ] Upgrade MikroORM from 7.2.9 to 7.2.11 after 2026-11-27 (`minimumReleaseAge`) and rerun the dialect suites
- [x] Integration tests green on PostgreSQL, MySQL and SQLite (§9.1). Green on all three, and on Valkey and an S3 server, in every run of this work with `BK_REQUIRE_DIALECTS=all` (`sh tools/test-services.sh start`); CI runs them in the job `integration`

Done when: one sample entity round-trips on all three dialects, generates a migration, enforces tenant isolation and a stale-version 412.

### M1.3 HTTP: `@bieberkit/http`

Depends on: M1.2.

- [x] Fastify 5 server and the 12-stage request pipeline with named plugin hook stages only (§13.4, REQ-01, REQ-02). Authentication, tenants and authorization are ports until M1.4; CSRF (stage 6) and ETag (stage 11) are named places that slices 2 and 5 fill
- [x] RFC 9457 errors with `code` and `traceId`, validation `errors[]` (MOD-17, SEC-07)
- [x] Generated entity routes from `api` settings: list, get, create, update, delete (§10.2, §13.1)
- [x] Filtering, sorting, `include`, `fields`, only on declared fields (§13.1)
- [x] Every route declares schemas and a permission or `public: true`; response serialized through schema (API-01, API-02). The `bieberkit check` rule on the source waits for the CLI of M1.8
- [x] Body limit, timeouts, `x-request-id`, trace headers (API-03 to API-05)
- [x] ETag and conditional GET; cache headers for public cacheable routes (API-08, API-09)
- [x] Action and transition routes `POST .../actions/<name>` with audit and event (MOD-06). Transitions are done. A custom `actions` handler needs a declared result schema in `ActionDef`, which is a change of the DSL
- [x] Bulk endpoints with per-row results and version conflicts (API-14, API-17). Up to 100 rows run in one request, and 101 to 500 wait for the queue (M1.5)
- [x] Aggregate endpoint for `aggregatable()` fields (API-15). Money sums (one for each currency) and groups by an instant (a bucket) are later work
- [x] Idempotency-Key for `idempotent: true` routes (§13.1). The store is in memory, for one process, until the cache of M1.5
- [x] Deprecation and Sunset headers (API-16). The list in OpenAPI comes with slice 4
- [x] OpenAPI 3.1 generation, served in development and gated in production (API-06). The client generator (API-07) is the build of M1.8
- [x] Security headers, CORS allowlist, CSRF with Fetch Metadata plus signed token, `http.fetch` with SSRF guard, timeouts and circuit breaker (SEC-01 to SEC-04, SEC-06, WH-04). The CSP of the admin and of the site, and the service token of API-12, are set where they are served
- [x] `/api/v1/_meta` with `schemaVersion`, per tenant and role, ETag (UI-02, META-01 to META-05). Menus and dashboards are empty until the plugin system fills them, and a cache by role set belongs to `@bieberkit/auth`
- [x] Health endpoints `/health/live`, `/ready`, `/startup` and graceful shutdown sequence (§19.3, §19.4)
- [x] Test: a generated list endpoint that issues one query per row fails (PERF-04)

Done when: entity routes, OpenAPI and `_meta` are generated for a sample entity and a request passes every pipeline stage in order.

### M1.4 Auth: `@bieberkit/auth`

Depends on: M1.3.

- [x] **[D]** Better Auth adapter on MikroORM sharing the request transaction; auth tables as versioned migration steps (AUTH-09): Kysely adapter over `em.getKysely()` through a request-scoped proxy, nested transactions join, with the flow tests of ADR 0012. `requestKysely`, `runInTransaction` and `applyPluginMigrations` are in `@bieberkit/data/orm`, the five tables are steps 0.2.0 of `@bieberkit/auth`, and the flows pass on the three dialects. Better Auth is 1.7.25 until 2026-11-27, when 1.7.27 passes the release age
- [x] **[D]** Better Auth configuration: client IP from `TRUST_PROXY`, rate-limit counters in shared store, snake_case, UUID ids, organization set per request from the tenant (AUTH-10). The client IP, the counters in the database, snake_case and UUID ids are done. The organization plugin waits for its spike, and the tenant comes from `X-Tenant` and the roles until then. The organization plugin is not loaded and the tenant is never in the session (ADR 0021): the spike ended in a decision
- [x] CI job compares Better Auth's expected schema with BieberKit entities and fails on drift (AUTH-10). It is a test (`drift.test.ts`) that the existing test job runs, and it covers the options of this package and a plugin that is added to them
- [x] **[D]** Session cookie `__Host-bk_session` without `useSecureCookies`, trusted `x-bk-client-ip` header, UUID type that rejects invalid strings, Better Auth pinned exactly with telemetry off (AUTH-01, AUTH-10, AUTH-11, ADR 0012). `useSecureCookies` is set to `false`, because Better Auth turns it on for an https base URL
- [x] Server-side sessions, `__Host-` cookie, database or Valkey storage (AUTH-01, AUTH-02). The database storage and the cookie are done (every cookie of Better Auth is a `__Host-` cookie), and Valkey comes with the cache of M1.5. Valkey storage is `createAuth({ secondaryStorage })` with `redisSecondaryStorage` of `@bieberkit/cache/bentocache`, with the database still holding every session
- [x] Email and password with ASVS rules (AUTH-04); magic link, TOTP and passkeys (AUTH-03). OAuth and OIDC providers are not in this item, and wait for a project that needs one
- [x] MFA required for roles flagged `requireMfa` (AUTH-05). The second factor is TOTP; a passkey is not counted as one yet, because a session does not say how it began
- [x] Per-IP and per-account limits on login, OTP, magic link and reset (AUTH-06, SEC-10)
- [x] **[D]** CASL ability per request from role data; permissions in code, roles in database (AUTHZ-01, §14.2). Roles are per tenant, a condition is code attached to a permission string (`scopedPermissions`), and the ability lives for one request
- [x] **[D]** CASL to ORM condition translator; lists return only permitted rows (AUTHZ-02): own translator with a small operator set that fails closed with `AUTHZ_UNSUPPORTED_CONDITION` (ADR 0013)
- [x] `bieberkit check` rule: condition operators outside the supported set, dotted paths and unknown fields (AUTHZ-06, ADR 0013). Done: `checkScopedPermissions` (and `explainCondition`) in `@bieberkit/auth`, which is the rule. The rule is `bieberkit check scoped-permissions` (M1.8)
- [x] **[D]** Field masks on read and write, default deny (AUTHZ-03, AUTHZ-04)
- [x] Audit of role changes, `asSystem()`, impersonation, failed authorization (AUTHZ-05). `asSystem()`, failed authorization (a denial, an unsupported condition, a write of a masked field) and role changes (the service of roles) are done. Impersonation waits for its design. There is no impersonation feature yet: `recordImpersonationStart` and `recordImpersonationEnd` are what one must call, and they are tested
- [x] API keys primitive: shown once, hashed, scoped, expiring (AUTH-07)
- [x] `encrypted: true` fields with key rotation through `APP_KEY_PREVIOUS`; `pii: true` log redaction (SEC-08, SEC-09). Crypto-shredding of audit data (PDP-06) waits for the `privacy` plugin

Done when: generated permission and tenant tests pass for the sample entity and an unpermitted row never leaves the database.

### M1.5 Contracts: queue, cache, storage, mail

Depends on: M1.2. Can run in parallel with M1.4 (no shared files).

- [x] **[M]** Queue contract, `defineJob`, `sync`, `database` and `redis` (BullMQ) drivers under `@bieberkit/queue` subpaths (PKG-02, PKG-03, §15.1). The contract, `defineJob`, the `sync` and `database` drivers, the worker, the outbox glue, the scheduler and the contract suite are slice Q1. The `redis` driver on BullMQ is slice Q2, and installs under the denial of `msgpackr-extract` (ADR 0020). Ticked on 2026-11-24 at the request of the maintainer, who owns this item
- [x] Queues `critical`, `default`, `reports`; dead-letter list; input validated on dispatch and execution; stable `jobId` (Q-01 to Q-04). On the `sync` and `database` drivers; the `redis` driver is the first item
- [x] Bulk requests of 101 to 500 rows as a queued job, with the result kept for the client (API-14, PERF-05). The job runs as the principal that sent the call and asks the authorizer again (Q-10); the result is read at `GET /api/v1/_jobs/:id` by its owner
- [x] A shared store for `Idempotency-Key` on the cache contract (§13.1). `createCacheIdempotencyStore(cache)` implements the `IdempotencyStore` port on `atomic` keys, and `@bieberkit/http` exports the port and its memory store
- [x] After-commit dispatch through the outbox (Q-06): the `OutboxPublisher` of each driver, with the `database` driver inserting its job in the transaction of the claim, and a `LISTEN/NOTIFY` wake on PostgreSQL (needs `pg` as a dependency and its ADR line, P9); job carries tenant and actor and restores them (Q-10). Done: the publisher of the `database` driver, the context that a job restores, and the wake by `LISTEN/NOTIFY` (`@bieberkit/queue/postgres`, ADR 0019)
- [x] Scheduler under a distributed lock per tick (Q-07). `createScheduler` with cron expressions, a lock row for each tick and a job id that names the tick, tested with two contenders on the three dialects
- [x] `worker_threads` pool for CPU-heavy work (Q-09). `createWorkerPool` in `@bieberkit/queue`, with no dependency; the PDF, spreadsheet and image tasks themselves come with their features
- [x] Cache contract on BentoCache: `get`, `set`, `remember`, `forget`, `tags`, `lock`; prefix and tenant namespacing; stampede lock (C-01 to C-03). The drivers are `memory`, `file` and `redis`; the engine contract and the libraries are in ADR 0016 (Accepted)
- [x] Tag generations bumped right after commit; 5 s memory TTL; read-your-write window; failed purge only warns (DATA-13). `afterCommit`, `flushAfterCommit`, the 5 s layered engine, a failed purge only warns, and the read-your-write window (`useReadYourWrites`, `createCacheReadYourWrites`)
- [x] Separate cache instance through `CACHE_REDIS_URL` (Q-08). `createCacheFromConfig` reads it, and `checkRedisInstances` (the policy of the queue and of the cache, and one instance for both) is what `bieberkit doctor` will call
- [x] Storage contract on FlyDrive: local and S3-compatible, signed upload URLs, private by default, content sniffing (S-01 to S-04). The `local` disk has no signed URLs: there the API receives the file and calls `put`. Libraries are in ADR 0017 (Accepted)
- [x] Mail contract with `log` and `smtp`, sent through the queue (M-01). Templates (M-02) come with the admin. Library in ADR 0018 (Accepted)
- [x] Error-reporter contract with an optional Sentry-compatible driver (OBS-06). The port is in `@bieberkit/core` with a driver for Sentry, GlitchTip and Bugsink that has no SDK, and it is wired into `@bieberkit/http` (5xx), `@bieberkit/queue` (a job that failed for good) and the process handlers
- [x] Contract test suite run against every driver; each driver imported only in `src/adapters/<driver>/` (PKG-03, `check:layers`). Includes the nine queue contract tests of ADR 0010 (Q-11). Queue (`sync`, `database`, `redis`), cache engines, storage disks and mail transports each have a suite. The `redis` queue driver is on the branch `feat/queue-redis` and needs ADR 0020 first

Done when: each contract passes its shared driver tests, and switching `QUEUE_DRIVER` or `CACHE_DRIVER` changes no application code.

### M1.6 Observability and testing

Depends on: M1.3, M1.4, M1.5.

- [x] `@bieberkit/log`: pino adapter under `@bieberkit/log/pino` with SEC-09 redaction, JSON logs with the fields of OBS-01, and a shared contract test run against it and the core default logger (OBS-01, SEC-09, PKG-02, PKG-03, ADR 0003). Done: `createPinoLogger` redacts with the sanitizer of core (ADR 0022), and `loggerContractSuite` passes on both loggers
- [x] OpenTelemetry traces over HTTP, database, cache, queue, jobs with context carried into jobs (OBS-02). Done without an SDK (ADR 0023): OTLP over HTTP from core, a span for each request, ORM query, cache call, dispatch and delivery, and the `traceparent` kept in the outbox row and the job row. `@bieberkit/server` builds the tracer from the config at boot (M1.7)
- [x] Prometheus metrics on `METRICS_PORT`, not routed publicly (OBS-03, OBS-04). Done: the registry and the server in core (a request that a proxy touched is refused), and the figures of http, data, queue and cache. The boot of `@bieberkit/server` starts the server (M1.7)
- [x] `@bieberkit/testing`: `createTestApp`, entity factories, `actingAs`, `withTenant` (TST-02). Done on real databases, with `describeDialects` for every dialect and the module contributions `entities` and `routes`
- [x] Generated contract tests per entity: permissions, field masks, tenant isolation, validation, pagination limits (§21). Generated from the `permissions` block, with a mutation job that proves they catch six known faults (ADR 0013). The permission part is done in `@bieberkit/auth/testing` (M1.4); validation and pagination limits are `describeEntityContracts` of `@bieberkit/testing`. Done
- [x] Testcontainers setup for PostgreSQL, MySQL and Valkey; network calls outside containers fail tests (TST-03). Done with `tools/test-services.sh` and the `services` of CI (ADR-free: the containers are plain Docker), `describeDialects` and `BK_REQUIRE_DIALECTS=all`, and a guard on `net.Socket#connect` that every test file installs
- [x] Coverage gates: 90% core, data, http, auth; 80% elsewhere (TST-01). Done in `vitest.config.ts`: 90 for core, data, http, auth, cache, storage and mail, and 80 for everything else; `pnpm test:coverage` fails below them

### M1.7 CLI and scaffolder

Depends on: M1.1 to M1.6 (can start the resolver and flags earlier).

- [x] Stable error codes, `--json` on every command, exit codes 0, 1, 2, 3 (§5.3, AI-02, AI-03). Done in the framework of commands (slice C1): each command that follows inherits them
- [x] `create-bieberkit` with every flag and prompt equivalent; resolves the plugin graph before writing anything (§5.1, §6 steps 1 to 5). Done (slice C4); `bieberkit create` is the alias
- [x] Scaffold writes `bieberkit.config.ts`, headers with the project author, `.env` with generated secrets, `.env.example`, `compose.yaml`, git commit (§6 steps 6 to 12, §23.7). Done (slice C4); the admin and site apps and the seed come with the base plugins
- [x] Commands: `dev`, `build`, `start <role>`, `migrate:make`, `migrate`, `db:seed`, `env:check`, `env:example`, `routes`, `openapi`, `client:generate`, `doctor`, `test` (§5.2). Done (slices C1, C3, C5) but `build`, `migrate:make` and `migrate`, which are the first item of M1.8: they need `openMigrator` and `writeStandalone`
- [x] `make:entity`, `make:module`, `make:job` from official recipes (§5.2). Done (slice C3); the recipes are in the CLI until `registry/` has them
- [x] `bieberkit check` rules: boundaries, headers, env access, route permissions, destructive migrations, `http.fetch` or queue calls inside transactions, string-built SQL, stale generated files (WP-01, SEC-05, GEN-01, DATA-07). Done (slices C2 and C3). DATA-07 needs no rule, because a filter or a sort on a field with no index is refused by the query
- [x] `bieberkit check` rule: ORM imports in entity files, and use of `orm` overrides or hand-written ORM entities (SCH-08, ADR 0009)
- [x] Deterministic generators writing `.bieberkit/*` and `packages/client` (GEN-01 to GEN-03, API-07, SCH-04). Done (slice C3): `generate`, `client:generate`, `openapi`, `routes`
- [x] Oxlint plugin with BieberKit rules used by `check` (§3). Done (slice C6): `bieberkit/oxlint` runs the rules of `check` that read one file, through Oxlint (alpha JS plugins), and a test compares the two
- [x] `bieberkit add` and `remove` with data ownership prompt (PLG-03, DATA-02). Done (slice C6)

Done when: `pnpm create bieberkit@latest demo --yes` boots, migrates, seeds an admin and `bieberkit dev` serves the API.

State on 2026-11-24: a project made by `create` starts through its `main.ts` (a test runs it in a real process), `dev` makes the framework tables and serves the API, and `db:seed` runs the seeders. The administrator is seeded by the base plugins (M1.8): a test creates a blank project, migrates, seeds, boots the web role and signs the administrator in, and the browser test does it again through the admin. Only the `pnpm create bieberkit@latest` form needs the first release.

### M1.8 Blank template and base plugins

Depends on: M1.7. Built and hardened first, as every other template relies on them (§12).

- [x] CLI commands `migrate:make` and `migrate` (`--status`, `--rollback`, `--allow-destructive`, as the spec has them) over `openMigrator`, `bieberkit build` over `writeStandalone` (regenerate, `tsc --noEmit`, the standalone files; the bundle of the server comes with the image of M1.9), a lock so that one migrate run is guaranteed (`bk_migration_lock`, on the three dialects), and the `bieberkit check` rules from `detectDestructive` (`migrations`) and `findStepRisks` (`plugin-steps`) (DATA-08, DATA-25, DATA-27). The migrate role runs the same in production
- [x] Plugins: `users`, `roles`, `settings`, `audit-log`, `notifications`, `media` (`docs/modules/plugins.md`). `auth-ui` is a set of screens, so it comes with the admin slice below
- [ ] `templates/blank/template.ts` with plugin list, seeders and menu order; administrator account and base roles seeded (§12). Done: the blank template lists the base plugins in the scaffolder (`BUILTIN_TEMPLATES`, with the bundled manifests), `create` writes the password of the administrator, and `blank.test.ts` migrates, seeds, boots and signs the administrator in. Open: the menu order (the admin lists the entities that the user may read, and no plugin fills the menu of the metadata yet)
- [x] Thin admin slice: `@bieberkit/admin-core` metadata loading, routing, permissions; `@bieberkit/admin-antd` login, generic list and form, no more (UI-01, UI-02, UI-10). The login is the `auth-ui` of the plugin list. What it leaves out is in `docs/modules/admin.md`
- [x] Admin served under `/admin/` with its own CSP (UI-14, SEC-01)
- [x] Playwright flow: login and CRUD in the admin (§21). `pnpm test:e2e` after `pnpm build`; the CI job that runs it is a change of `.github/workflows/`, which waits for the maintainer

### M1.9 Deployment and benchmarks

Depends on: M1.7, M1.8.

- [x] Generated `Dockerfile`, `.dockerignore`, `compose.yaml`, `compose.prod.yaml` with proxy, roles, database, Valkey (§19.1, §19.2, DEP-01 to DEP-06). The compose files and the Dockerfile are checked by Docker, and the image is not built to the end until `@bieberkit/*` can be installed from a registry (`docs/modules/deploy.md`)
- [ ] Hardened runtime image: non-root, read-only root, digest pinned, SBOM and provenance, Trivy gate (SEC-18, SEC-19). Done: non-root, read only, no capability, digests pinned (ADR 0026). Open: the hardened base image (needs a login), the SBOM, the provenance and the Trivy gate, which are CI steps (`.github/workflows/`, the maintainer)
- [x] Rollout order and `scheduler` stop-then-start documented in the generated files (§19.5)
- [x] Backup service and `backup:verify` (DEP-07, DEP-09). Verified by hand against PostgreSQL 15
- [x] `NODE_OPTIONS` heap sizing in compose (PERF-03)
- [x] k6 benchmarks for the reference endpoints; record results against §18.1 and update the targets in the spec (open question in §26). `pnpm bench`; the first results are in `docs/modules/deploy.md`: two targets missed (get p95, memory at rest) on a laptop that is not the reference setup, and the targets are kept; the CI run on release candidates waits for the maintainer

### M1.10 Pilot

Deferred by the maintainer until Phase 2 and a verified pre-1.0 npm release. The Pilot tasks and Phase 1 production gate remain open.

- [ ] **[M]** Pick the pilot project and keep it in a separate repository
- [ ] Pilot built on the `blank` template, defect list fed back as issues
- [ ] Pilot runs web, worker and scheduler behind a load balancer
- [ ] Pilot survives a rolling deploy and a restore from backup

### Phase 1 gate **[M]**

- [ ] **[M]** Pilot live in production

---

## Phase 2. Plugins and templates

Goal: `cms`, `crm`, `saas` templates, the full admin renderer, the public site and the registry, green on all three dialects.

Execution order: M2.1 through M2.7, then the reviewed npm release, then M1.10 Pilot (spec section 25). M2.1 starts with the static manifest pipeline; its proposed slices and acceptance tests are in `docs/modules/plugin-hardening.md`. This sequencing change does not complete any phase gate.

### M2.1 Plugin system hardening

- [x] Static manifests generated at plugin build and checked in CI; first-party manifests bundled in `create-bieberkit` (PLG-07). H1: `bieberkit build` in a plugin writes the field, `build --check` verifies without writing, `pnpm check:manifests` runs inside the existing CI check, and `pnpm test:artifacts` verifies the six plugin tarballs and the packed scaffolder graph after build (`docs/modules/plugin-hardening.md`)
- [ ] Extension tables and `extends` for fields on other plugins' entities (PLG-06, §11.3)
- [ ] `bieberkit plugins` graph, `make:plugin`, `remove` with migration prompt (PLG-03)
- [ ] `check` rules for plugin imports and cross-plugin table queries (PLG-01, PLG-02)
- [ ] Expand then contract guard in the migrate role (DATA-08)

### M2.2 Admin renderer

- [ ] Generic list with filters, saved views, bulk actions, export; form with `visibleWhen`, `requiredWhen`, inline child tables, relation pickers, file fields; detail with tabs (UI-03, UI-11)
- [ ] Lazy chunks per route, per-language translations, virtualized lists, prefetch, optimistic updates (UI-12, UI-13, UI-15)
- [ ] Mobile layout to 360 px, unsaved-change guard, local drafts, shortcuts, 412 conflict view, error boundaries, offline banner (UI-16 to UI-19)
- [ ] Languages en, vi, zh; font stack; theme tokens (UI-05, UI-06, TOK-01 to TOK-03)
- [ ] Hashed assets kept 24 hours after deploy; reload on chunk error (UI-22)
- [ ] Custom widgets, replacement pages, plugin pages and dashboard widgets (UI-04)
- [ ] `@bieberkit/tokens` compiling to Ant Design theme and CSS variables
- [ ] Second small adapter as a test fixture to prove the contract (§26)
- [ ] Axe checks on generic screens at WCAG 2.2 AA, admin initial JS under 400 KB (UI-07, §18.1)
- [ ] Client errors and web vitals to the error-reporter contract (UI-21)

### M2.3 Content and public site

- [ ] `@bieberkit/content`: block schema, shared React renderers, sanitization, framework-free HTML serializer (CNT-01 to CNT-03, CNT-05)
- [ ] Editor integrated per the accepted ADR (CNT-04)
- [ ] `apps/site` on TanStack Start with SSR on by default, same-origin routing, no data store credentials (SITE-01 to SITE-04, SITE-09)
- [ ] `@bieberkit/site-kit`: `seoHead()`, sitemap, preview tokens, cache helpers (SEO-01, SEO-05, SITE-05)
- [ ] Composition endpoints and `site.fragment` with tag purging (API-10, API-12, COMP-01 to COMP-03)
- [ ] Locale routing, hreflang, per-locale slugs, redirects, JSON-LD (SEO-02 to SEO-04, SEO-06)
- [ ] Private caching for session-rendered pages and the generated test for it (SITE-18)
- [ ] CDN purge driver contract with webhook and Cloudflare drivers (SEO-07)
- [ ] Image variants in the worker, `srcset` (SEO-08)
- [ ] Forms with honeypot and rate limit; consent banner; 404, 500 and maintenance pages (SITE-15 to SITE-17)
- [ ] Streaming and Suspense for slow sections; client JS under 100 KB on content pages (SITE-11, SITE-13)
- [ ] Lighthouse CI on `cms` home and article pages (SEO-09)
- [ ] Site Dockerfile and image (§19.7)

### M2.4 Cross-cutting features

- [ ] Realtime: SSE `/api/v1/events`, Valkey fan-out, heartbeat, shutdown hint (RT-01 to RT-05)
- [ ] Workflows with persistence, compensation, wait on event or timer, admin view (WF-01 to WF-06)
- [ ] Search contract with `database` driver and Vietnamese normalization (SR-01, SR-02)
- [ ] Import and export with dry run, error file and formula escaping (IO-01 to IO-04)
- [ ] PDF documents rendered in the worker (MOD-14)
- [ ] `webhooks` plugin with signed, retried deliveries (WH-01 to WH-03)
- [ ] `privacy` plugin: consent, data subject requests, retention, crypto-shredded audit, PII inventory in `check` (PDP-01 to PDP-06)
- [ ] `custom-fields` plugin (MOD-10)
- [ ] Mail templates in en, vi, zh with block rendering (M-02)

### M2.5 Template plugins

- [ ] `cms`: pages, posts, categories, tags, menus, seo, theme, redirects, with the seeded home page, sample post and main menu
- [ ] `crm`: contacts, companies, deals, pipelines, activities, tasks, imports, with the default pipeline
- [ ] `saas`: tenants, teams, invitations, plans, subscriptions, api-keys, usage, payment driver contract and manual-invoice driver, with demo tenant and plans
- [ ] `template.ts` for each template; adding one needs no scaffolder change (§12)
- [ ] One Playwright flow per template (§21)

### M2.6 Registry

- [ ] `registry/` with dashboards, approval forms, import wizard, shadcn/ui site components, module recipes (UI-09, SITE-08)
- [ ] `bieberkit add` installs registry blocks as owned source with the BieberKit header kept (§23.7)

### M2.7 Dialect matrix

- [ ] Full suite, generated permission and tenant tests green on PostgreSQL for every first-party plugin
- [ ] Same on MySQL 8.4
- [ ] Same on SQLite (no load tests)
- [ ] Upgrade tests on `examples/` apps for each template (§21)

### Phase 2 gate **[M]**

- [ ] **[M]** All three dialects green

---

## Phase 3. Hardening and 1.0

Goal: security review, documentation and upgrade path. No estimate until Phase 2 ends.

### M3.1 Security

- [ ] **[M]** Review against §17 and OWASP ASVS 5.0 Level 2; findings fixed or recorded
- [ ] **[M]** Independent review of tenant isolation, authorization and release pipeline
- [ ] Supply-chain audit of dependency list, licenses and ADR lines for each runtime dependency (P9)
- [ ] `SECURITY.md` process exercised once with a test report (SEC-20)

### M3.2 Performance

- [ ] k6 runs on release candidates and fails on a regression above 10% (PERF-08)
- [ ] All §18.1 targets met on the reference setup

### M3.3 Developer experience for agents and humans

- [ ] `@bieberkit/mcp` and `bieberkit mcp`: localhost only, off in production (AI-04, §22.1)
- [ ] Shipped skills: `bieberkit-add-entity`, `bieberkit-add-module`, `bieberkit-add-workflow`, `bieberkit-write-tests`, `bieberkit-upgrade` (§22.1)
- [ ] Bundled docs in each package and `llms.txt`, matching the installed version (§22.1)
- [ ] Short hand-written `AGENTS.md` and one-line `CLAUDE.md` in generated projects (AI-01)
- [ ] User documentation site on the chosen generator (§26)

### M3.4 Deployment and upgrades

- [ ] `bieberkit deploy:helm` chart with probes, preStop, migrate job, autoscaling (§19.2)
- [ ] `bieberkit docker:init`
- [ ] `bieberkit upgrade` moves all `@bieberkit/*` to one version and runs codemods, tested on `examples/` from the previous minor and major (P11, §24.2)
- [ ] Deployment guide with recovery figures and bucket versioning notes (DEP-08, DEP-10)

### M3.5 Release 1.0

- [ ] Release candidates pass upgrade, load, accessibility and Lighthouse checks
- [ ] Changelog generated from changesets
- [ ] **[M]** Publish 1.0 through the trusted publishing workflow

### Phase 3 gate **[M]**

- [ ] **[M]** 1.0 released

---

## Parking lot

Not scheduled. Items move into a phase only after a spec change.

- GraphQL plugin, other admin adapters (shadcn/ui, MUI), schema-per-tenant (§1.3, §9.4), pg_trgm search driver (§15.7), other site renderers as headless clients (SITE-07)
