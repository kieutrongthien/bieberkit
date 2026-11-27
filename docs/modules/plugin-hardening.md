<!--
  BieberKit

  @file        docs/modules/plugin-hardening.md
  @description Proposed slices, acceptance tests and release dependencies for Phase 2 plugin system hardening.
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

# Plugin system hardening

- Packages: `@bieberkit/core`, `@bieberkit/server`, `bieberkit`, `create-bieberkit`, and first-party plugins.
- Layers: existing foundation, contract, runtime, tools and plugin layers; imports continue to point downward.
- Spec sections: 11, 12, DATA-08, PLG-01, PLG-02, PLG-03, PLG-06, PLG-07; ADR 0011.
- Status: H1 design approved by the maintainer on 2026-11-24. The maintainer approved the tests and implementation plan in the same session; H1 is implemented and locally verified on 2026-11-25. The first M2.1 roadmap item is complete; later slices remain proposals. Later slices and public API changes remain proposals.
- Baseline: commit `9481b42`, including the `bk_` table prefix. Work happens on `feat/phase-2` in a separate worktree.

## Purpose and delivery order

Make independently built plugins safe to resolve, extend, install, remove and upgrade. Begin with the existing manifest contract; design entity extensions separately instead of treating a manifest change as permission to change `definePlugin` or `defineEntity`.

The maintainer requested Phase 2 first, npm publication after verification, and M1.10 Pilot afterwards. Phase 1's production gate remains open. Complete M2.1 through M2.7 as independently reviewed changes; prepare the release only after the dialect matrix and template flows pass. A pre-1.0 release does not certify production readiness or complete the Pilot gate. A release version and distribution tag are selected when the release artifact is ready for review.

## Existing implementation

| Area                                     | Evidence at the baseline                                                                                                            | Remaining work                                                                                      |
| ---------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| Manifest format and canonical comparison | `packages/core/src/plugins/manifest.ts`: `toManifest`, `canonicalText`, `checkManifest`                                             | Wire generation and verification into plugin builds; validate emitted package metadata              |
| Manifest key collectors                  | `packages/server/src/manifest.ts`: `COLLECTORS` collects entity tables and explicit routes                                          | Audit coverage against the actual plugin contributions; cover omitted keys with tests               |
| First-party index                        | `packages/create/src/scaffold/templates.ts`: `BUILTIN_PLUGIN_INDEX`; `tools/templates.test.ts` compares it with runtime definitions | Derive the bundled entries from the same generated manifests instead of maintaining a second copy   |
| Plugin graph                             | `packages/cli/src/commands/plugins.ts` returns ordered plugins and dependencies                                                     | Verify that human and JSON output represent the same graph; retain the existing resolver            |
| Removal                                  | `packages/cli/src/commands/plugin.ts` checks dependents, prompts for owned tables and writes a drop migration                       | Test extension ownership when extension tables exist; preserve cancellation before mutation         |
| Plugin boundaries                        | `packages/cli/src/check/rules/` and the documented `boundaries` rule                                                                | Audit PLG-01 and add ownership checks for PLG-02 without claiming they form a sandbox               |
| Expand/contract                          | Existing migration runner, CLI mapping and production migrate role; `docs/modules/cli.md` slice C7                                  | Prove the production path refuses a contract in the same deploy; do not replace the existing runner |

A roadmap row is not ticked merely because part of its implementation already exists.

## Baseline verification note

On a fresh worktree at `d65727d`, `pnpm test` failed during setup for all 208 suites with `Failed to resolve entry for package "@bieberkit/core"`. The packages had no `dist` output. Supplying the Node source condition alone did not resolve it. After `pnpm build`, the focused plugin and template tests passed (32 tests). This exposes a bootstrap dependency despite the comment in `vitest.config.ts` that tests need no build; it is not fixed by this design. Treat it as a separate baseline defect and do not claim that building proves source resolution works on a clean checkout.

The worktree was then fast-forwarded to `9481b42` and rebuilt before the full checks. Passing local tests with absent service URLs does not establish PostgreSQL, MySQL, Redis or S3 integration coverage.

## Approaches considered

1. **Finish the existing static manifest pipeline, then extend it. Recommended.** Reuse ADR 0011, the resolver and stable errors. Each slice has a separate test and review boundary. This avoids designing migrations and UI extensions before the package contract is reliable.
2. **Implement all of M2.1 in one change.** This brings manifest generation, entity storage, CLI and migration behavior together, but prevents reviewing or reverting them independently and immediately reaches maintainer-owned APIs.
3. **Resolve plugins by importing them at creation time.** This removes the need to ship static metadata, but executes plugin code before dependency and collision checks and violates PLG-07. Rejected.

## Slice H1: static manifests (PLG-07)

This is the first proposed implementation slice. It adds no runtime dependency and leaves the public signatures of `definePlugin`, `defineEntity`, `Manifest`, `toManifest`, `checkManifest` and `resolve` intact.

### Behavior

1. Plugin builds write the canonical `bieberkit` field in the plugin's own `package.json`. They derive it from the plugin definition through `toManifest` with the appropriate collectors. Unrelated package metadata is preserved.
2. Building a plugin is distinct from starting an application: no kernel boot, database connection, migrations, seeds, worker or scheduler is started. Importing a trusted plugin definition at build time is permitted; resolving static metadata before installation never imports it.
3. Validation compares the committed field with a newly derived manifest without writing files. A missing field, stale field, name mismatch or version mismatch fails with the existing `PLG_MANIFEST_*` code. Reordered object keys and key lists do not create a false difference.
4. A successful build is idempotent. Repeating it without a definition change produces no metadata diff. A name or version mismatch is an error; the generator must not silently rewrite either identity.
5. Tables, routes, permissions and admin contributions that the framework actually mounts must be represented consistently for collision detection. Test the contribution types currently supported; a future extension must update its collector and tests in the same change.
6. The index bundled in `create-bieberkit` uses the first-party package identities and generated manifest fields. The scaffolder can resolve it with no network access, no installed first-party plugin code and no application environment.
7. The check runs within the repository's existing checks/tests invoked by CI. Add a workflow change only through the separate maintainer review gate if the existing job cannot exercise it.
8. The packed plugin includes the generated field. The packed scaffolder includes the generated index. A test of source constants alone is insufficient to establish this acceptance criterion.

### Components and data flow

- Core keeps the pure manifest format, normalization, validation and resolver.
- The runtime layer owns collectors for typed runtime contributions. It cannot introduce a dependency from core on data, HTTP or admin packages.
- The CLI's plugin build path uses the same derivation and writes package metadata; it retains the existing application build path.
- Repository build tooling applies that path to first-party plugins, then bundles the resulting static entries into `create-bieberkit`.
- The checker independently derives expected metadata and fails on drift. Generation is never invoked from the check to hide a stale committed field.
- The generated index carries `@generated` and the mandatory header. Changes go through the generator, never direct edits to the generated output.

### Errors

| Code                   | Meaning                                  | Recovery                                    |
| ---------------------- | ---------------------------------------- | ------------------------------------------- |
| `PLG_MANIFEST_NAME`    | Definition and package names disagree    | Correct the definition or package name      |
| `PLG_MANIFEST_VERSION` | Definition and package versions disagree | Update the release version consistently     |
| `PLG_MANIFEST_MISSING` | No static field is committed             | Regenerate it through the plugin build path |
| `PLG_MANIFEST_STALE`   | Static field differs from the definition | Regenerate and review the metadata diff     |

`BK_PLUGIN_IMPORT` reports a definition import failure, including the affected entry path and the original cause. A failed import leaves the package unchanged. These are build/check diagnostics, not new HTTP endpoints. Filesystem failures must identify the affected file and preserve the existing package metadata.

### Acceptance tests

- `PLG-07 plugin build writes the manifest and preserves unrelated package fields`: use a temporary plugin fixture and compare the generated value with `toManifest`.
- `PLG-07 plugin build does not boot runtime contributions`: a fixture with a seed that fails if called builds successfully without an application config.
- `PLG-07 rebuilding a plugin produces identical metadata`: compare the complete file after two builds.
- `PLG-07 checking a missing or stale manifest fails without changing files`: assert the stable code and byte-for-byte unchanged package text.
- `PLG-07 checking reordered metadata passes`: permute keys and supported lists without changing their meaning.
- `PLG-07 a mismatched name or version is not repaired silently`: assert each existing error code and unchanged identity.
- `PLG-07 supported runtime contributions participate in collision checks`: two fixtures with a table, route or admin path collision fail through the existing resolver.
- `PLG-07 first-party generated manifests and the bundled index agree`: compare every first-party entry, including `bk_` table names.
- `PLG-07 the scaffolder resolves bundled manifests on all dialects without importing plugin code`: exercise PostgreSQL, MySQL and SQLite graph resolution; these are pure resolver tests, not database integration tests.
- `PLG-07 packed plugins and scaffolder retain static metadata`: build and pack fixtures, inspect their artifacts, and resolve the bundled graph from the packed scaffolder.

Tests are written before the implementation and named after the requirement. The implementation plan is `docs/superpowers/plans/2026-11-24-plugin-manifests.md`. The maintainer reviewed the concrete tests before implementation (AGENTS.md Workflow 2).

## Remaining M2.1 slices

- **H2: entity extensions (PLG-06).** Present a separate design for the public extension declaration and its data-layer representation. Prove extending-plugin ownership of a 1:1 extension table, automatic reads and API/admin exposure, safe removal and upgrade behavior. Include all three real dialects. Public entity/plugin APIs and tenant isolation require maintainer design and test review before implementation.
- **H3: plugin CLI (PLG-03).** Complete `make:plugin` and graph output on the existing command registry; preserve removal prompts and dependent-plugin checks. A generated plugin must build and resolve through H1. Removal must list all owned extension tables before writing a migration.
- **H4: ownership checks (PLG-01, PLG-02).** Build on the current import checker, the static graph and ownership metadata. Define supported query forms and explicit findings in its own slice spec. Plugins run in-process with full trust; a static checker is not isolation.
- **H5: production upgrade guard (DATA-08).** Add integration tests through the actual migrate role for one-deploy refusal, a subsequent-deploy contract, skipped-version upgrades, locking and final backfill. Reuse the current ledger and error mapping.

Each slice updates the relevant roadmap row only after its acceptance tests and the required checks pass. A changeset accompanies behavior or public API changes.

## Slice H5: production guard for expand then contract (implemented)

The guard of the runner already refused a contract step in the deploy of its expand step, but only a test of the runner proved it, and a **deploy was one run, not one release**: a retry, or a second migrate role that waited for the lock, got a new random id and finished the contract that the first had refused. Now `DEPLOY_ID` (a core env key) or `bieberkit migrate --deploy-id` names the deploy, and `runMigrations` uses it for the ledger. Without it the id stays random, which is right for a release that is run once.

`packages/server/src/migrations.test.ts` proves it through the migrate role: refusal with `BK_MIGRATE_REFUSED` and the project files not run, the next deploy finishing the contract, the backfill of a row that the old version wrote between the two deploys (and the failure of a contract without one), a retry with the same id, `DEPLOY_ID` of the environment, and two migrate roles of one release. `plugin-migrate.dialects.test.ts` adds the retry case on the three dialects. `bieberkit check plugin-steps` warns about a contract step with no `after` (`BK_STEP_CONTRACT_NO_AFTER`), because the guard cannot protect it. The backfill stays a convention of the step: no code can tell whether a contract step repairs the rows that the old version wrote.

## Phase 2 integration and npm release

M2.2 consumes the verified plugin metadata; M2.3 adds content and the public site; M2.4 supplies realtime, workflows, search and other shared features. M2.5 composes those capabilities into templates, M2.6 distributes editable source, and M2.7 proves the full matrix and upgrade paths. Keep integration coverage during development; do not postpone all dialect tests until M2.7.

Before npm publication, verify at least:

- Every intended package, including `plugins/*`, is in the release inventory and dependency order. The current workflow packs only `packages/*`; this must be addressed by the maintainer-owned release design.
- Publishable packages have reviewed versions, metadata, exports, README and license files. Root `private: true` remains; package privacy is changed only for selected release artifacts.
- The release tag/version comparison works: the current workflow reads a root `version` that does not exist at this baseline.
- The first-publication bootstrap and the npm Trusted Publisher setup are proven, with the organization and package publishing rights in place. No bypass of SEC-15 is implied.
- Required checks, package checks, API reports, Playwright flows and the PostgreSQL/MySQL/SQLite matrix pass with the required services present. Skips are not evidence for the Phase 2 gate.
- M1.9's unverified image build, SBOM, provenance and scan requirements are tracked explicitly and completed before production claims.
- Publishing is through the reviewed workflow and protected environment; agents never merge into or push to `main`.

After publication, M1.10 selects a real project in a separate repository, deploys all process roles behind a load balancer, and verifies rolling deployment and restoration from backup. The real project and hosting environment remain maintainer choices when that work starts.

## H1 CLI clarification

`bieberkit build` detects a plugin package by its standard plugin name or the `bieberkit-plugin` keyword and writes its static manifest without loading an application. `bieberkit build --check` verifies a plugin manifest without writing. Application builds retain their existing behavior, and reject `--check` rather than silently treating it as a normal build. Plugin entry selection uses the package exports/source entry instead of assuming a fixed folder.

## Implementation notes

H1 uses an internal CLI manifest helper shared with repository tooling. `@bieberkit/server/plugins` provides the existing collectors and loader without importing the process runtime; the original server exports remain available. This avoids loading all adapter dependencies in each manifest-only command. No runtime dependency was added.

Repository-level artifact checks use `vitest.artifacts.config.ts` through `pnpm test:artifacts` after build; they are explicitly excluded from the source-only test command. The tarball test initially caught the old `0.1.0` bundled index against the actual `0.0.0` package versions, then passed after rebuilding from generated data.

The baseline S3 network error was reproduced with a counter-based regression test: `diskContractSuite` called `subject.make()` during collection, even under `describe.skip`. Moving creation into `beforeAll` fixes the test helper without changing the network guard or runtime storage behavior. The TOTP timeout passed when rerun with two workers; no auth behavior or timeout was changed.

## Verification on 2026-11-25

- `pnpm build`: 26 package builds passed, including each plugin manifest step.
- `pnpm check`, `pnpm typecheck`, `pnpm lint`: passed, including read-only verification of all six plugin packages and the bundled index.
- `pnpm test --maxWorkers=2`: 211 files passed, one file skipped; 3,166 tests passed and 305 skipped. Service-dependent integration cases were not proven locally; 12 skips belong to the regression fixture that intentionally verifies skipped-suite collection.
- `pnpm test:artifacts --maxWorkers=2`: both tests passed, covering six real plugin tarballs and an isolated packed scaffolder's graph resolution on the three dialects.
- `pnpm check:api`: 56 reports matched.
- `pnpm check:packages`: 20 framework tarballs passed publint and attw. The tool notes that these 20 packages still have `private: true`; plugin tarballs are covered separately by the artifact checks. This is not publication readiness.
- `pnpm format:check` and `git diff --check`: passed.

No package was published, no production Pilot was deployed, and no Phase 1 or Phase 2 gate was ticked. CI enforcement is wired through the existing `pnpm check` job; no remote GitHub run is claimed by these local results.
