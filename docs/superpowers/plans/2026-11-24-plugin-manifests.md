<!--
  BieberKit

  @file        docs/superpowers/plans/2026-11-24-plugin-manifests.md
  @description Implementation plan for the approved H1 static plugin manifest pipeline and its test-first review gates.
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

# Static Plugin Manifests Implementation Plan

> **For agentic workers:** Use `superpowers:executing-plans` in this worktree. Work task by task, following `bieberkit-implement-task`. The maintainer reviews the tests before production implementation.

**Goal:** Complete H1 of M2.1: canonical package manifests generated at plugin build, read-only verification, a generated bundled first-party index and package artifact checks.

**Architecture:** Reuse `toManifest`, `checkManifest`, `resolvePlugins` and runtime collectors. Detect plugin packages before the existing application build path. Generate first-party static data through repository tooling and keep the scaffolder independent of runtime plugin imports.

**Tech Stack:** Existing TypeScript, Node.js >=24.12, pnpm >=12, Vitest, tsdown; no new runtime dependency.

**Spec:** `docs/modules/plugin-hardening.md`, H1; spec section 11; ADR 0011. H1 design approved by the maintainer in this session on 2026-11-24. The other M2.1 slices remain proposals.

## Global constraints

- `@bieberkit/core`: Node.js built-ins only, no runtime dependencies (PKG-04).
- ESM, erasable TypeScript, `.ts` relative imports, type-only imports, no `any`.
- Retain public `definePlugin`, `defineEntity` and manifest signatures.
- Every new file needs its Apache-2.0 header. Generate files through their generator.
- Run `pnpm check`, `pnpm typecheck`, `pnpm lint`, `pnpm test` in that order before completion, and `pnpm build`, `pnpm check:api`, `pnpm check:packages` for artifact validation.
- No edits to workflow files, release permissions, supply-chain settings or maintainer-owned APIs as part of H1.
- Sign off commits; keep the feature branch, never merge into or push to `main`.

## Task 1: Write and review CLI manifest tests

**Files:** Create `packages/cli/src/plugin-manifest.test.ts`; modify `tools/templates.test.ts`.

**Consumes:** Existing `buildCommand`, `createRunner`, `makeProject`, `checkManifest`, `COLLECTORS`, `BUILTIN_PLUGIN_INDEX`.

**Produces:** Executable acceptance tests for H1. The new CLI tests define `bieberkit build --check` as read-only plugin verification; ordinary application build behavior remains covered by `build.test.ts`.

- [x] Write a real plugin fixture with no application config, a definition with unordered permission/dialect lists, a failing seed hook and unrelated package metadata.
- [x] Assert a literal canonical manifest after `build`, idempotence, stale-field repair, preservation on import failure and name/version mismatches.
- [x] Assert `build --check` succeeds for current/reordered manifests, emits existing stable diagnostics for missing/stale/mismatched metadata, and leaves package bytes unchanged.
- [x] Assert every first-party package passes `checkManifest` and its bundled entry matches the committed package metadata and version.
- [x] Run `pnpm test packages/cli/src/plugin-manifest.test.ts tools/templates.test.ts --maxWorkers=2`; confirm failure is missing plugin build/check behavior and missing/mismatched package manifests.
- [x] Show the test diff and failure output for maintainer review, before production changes (AGENTS.md Workflow 2). Approved in this session on 2026-11-24.

The canonical fixture result is explicitly:

```json
{
  "core": "*",
  "dialects": ["mysql", "postgres", "sqlite"],
  "requires": {},
  "conflicts": [],
  "env": ["DEMO_LABEL"],
  "tables": [],
  "routes": [],
  "permissions": ["demo.read", "demo.write"],
  "admin": []
}
```

## Task 2: Plugin package build and read-only verification

**Files:** Create `packages/cli/src/plugin-manifest.ts`; modify `packages/cli/src/commands/build.ts`; cover core manifest comparison through the real CLI acceptance tests and update `packages/core/src/plugins/manifest.ts` if key-list normalization needs it.

**Consumes:** Package root and JSON metadata; `importFile` from the server; `toManifest`, `checkManifest` and `COLLECTORS`.

**Produces:** Internal CLI helper `buildPluginManifest(cwd: string, check: boolean)` returning a plugin outcome when the nearest package is a plugin, otherwise no outcome so the existing application build continues. Keep this helper internal to the CLI package, with an explicit return type.

- [x] Detect the nearest package before `loadApp`. Recognize standard plugin package names or the existing `bieberkit-plugin` keyword. Resolve its declared main export/source entry; do not assume every plugin has the same source layout.
- [x] Derive metadata without application boot or env validation. Verify package name/version before writing; reuse the existing error codes and `CliError` boundary. Preserve unrelated JSON fields and do not write on check mode or any failure.
- [x] Add the boolean `check` flag to `build`. An application invocation of `build --check` must produce a usage error instead of silently performing a normal build.
- [x] Add focused tests for malformed package identity/entry, missing entry, application `--check`, supported contribution collisions and normalized list comparison. Check mode must not mask duplicate or changed values as harmless reordering.
- [x] Run the Task 1 tests plus `packages/cli/src/build.test.ts` and the core plugin tests; require green without changing assertions to match missing behavior.

## Task 3: Generate and verify first-party metadata

**Files:** Create `tools/plugin-manifests.ts` and a focused library/test under `tools/lib/`; generate `packages/create/src/scaffold/plugin-index.ts`; modify `packages/create/src/scaffold/templates.ts`, plugin build configs/scripts as needed, and root `package.json` scripts.

**Consumes:** First-party package metadata, plugin definitions, `describeEnv`, and the Task 2 manifest derivation. Package versions are the authoritative release identity.

**Produces:** Deterministic committed `bieberkit` fields in `plugins/*/package.json` and a generated `PluginIndex` with version, manifest and env descriptions. Existing `BUILTIN_PLUGIN_INDEX` exports keep their type and meaning.

- [x] Write tests that run generation twice on a temporary repository fixture, compare complete output bytes, and make check mode fail on stale index/package metadata without repairing it.
- [x] Discover first-party plugin folders rather than hardcoding a second list. Reject missing definitions and duplicate names. Establish an explicit generation order that works before the scaffolder is built and does not introduce a build cycle.
- [x] Resolve the existing baseline identity mismatch (`package.json` is `0.0.0`, plugin definitions are `0.1.0`) by making definitions use the authoritative package version. Do not silently rewrite identities during manifest generation.
- [x] Generate the index with the mandatory header and `@generated` marker; re-export the generated value from the existing module. Do not edit generated output by hand.
- [x] Add repository write/check scripts. The read-only check participates in existing CI through `pnpm check` or tests; it must never repair stale files.
- [x] Verify plugin build commands regenerate static manifests and generated data stays deterministic. Include generation inputs/outputs in Turbo cache configuration where the build depends on them.
- [x] Run template graph tests for every dialect and demonstrate a drifted package/index fails its checker.

## Task 4: Verify packed artifacts and document the behavior

**Files:** Add artifact tests in `tools/lib/` or the CLI test file; update `docs/modules/cli.md`, `docs/modules/plugins.md`, the H1 module spec, `docs/ROADMAP.md` and one changeset.

**Consumes:** Built plugin and scaffolder output, pnpm tarballs, the existing static resolver.

**Produces:** Evidence that publication artifacts contain matching package manifests and bundled index data, not just correct source constants.

- [x] Write artifact tests using temporary copies/build output. Pack with pnpm, inspect `package/package.json`, and assert literal manifest/identity fields. Do not alter tracked package privacy just to run a test.
- [x] Load the packed scaffolder's exports and resolve the bundled first-party graph without plugin modules on its module search path. Inspect all three dialect results and stable collision diagnostics.
- [x] Document package recognition, plugin entry selection, build/check commands, generation commands, error recovery and unchanged application build behavior.
- [x] Add the changeset for changed package behavior. Tick the first M2.1 roadmap row only after all H1 acceptance criteria, including artifact tests and verification, pass.
- [x] Run the required checks and artifact validation, review the diff, then commit with `git commit -s` on `feat/phase-2`. Report baseline failures/skips explicitly; do not claim all dialects or npm publication without evidence.

## Baseline issues to retain

Fresh-checkout tests fail to resolve core until a build has populated output. Full baseline at `9481b42` after build: 3,134 passed, 293 skipped, one TOTP timeout at 5,000 ms, plus `TEST_NETWORK_BLOCKED` from the skipped FlyDrive S3 suite. With two workers, the two affected suites have 37 passed and 22 skipped; the AWS connection rejection remains. Do not disable the network guard, whitelist AWS, weaken assertions or increase timeouts to hide these findings. Track any baseline fix as an explicit test-supported change.

## Execution record

The CLI and first-party tests were observed RED before implementation. The maintainer approved the tests before production edits. Generator tests were observed RED before the generator existed; their initially expensive runtime import was replaced with the lightweight server/plugins subpath instead of raising timeouts. The artifact test was observed RED on a stale packed scaffolder index before the workspace rebuild, then both artifact checks passed. A separate regression test proved the disk contract helper opened a client during collection before the beforeAll fix.

Final verification on 2026-11-25: all required checks passed; the full suite had 3,166 passed / 305 skipped, artifact checks had two passed, API check matched 56 reports, package check validated 20 framework tarballs with publint/attw and retained the private-package warning, and formatting passed. No remote CI run or npm publication is claimed. The first M2.1 row is ticked; the remaining rows and phase gates stay open.
