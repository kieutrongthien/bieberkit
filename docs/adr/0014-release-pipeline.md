<!--
  BieberKit

  @file        docs/adr/0014-release-pipeline.md
  @description Proposed release pipeline: protected tags, three jobs, trusted publishing from tarballs only, and the checks that enforce it.
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

# 0014. Release pipeline: trusted publishing from tarballs

- Status: Accepted
- Date: 2026-11-22
- Deciders: Bieber Kieu
- Decision process: the maintainer reviewed the spike results and accepted this ADR on 2026-11-22.
- Requirements: SEC-11 to SEC-17, SEC-21, GOV-03, spec sections 17.3 and 24.2, roadmap M0.3

## Context

SEC-15 to SEC-17 and SEC-21 say packages are published only by npm trusted publishing from a dedicated workflow, on protected tags, with no shared cache, with `id-token: write` on the publish job only, and with no install, build or test in any job that holds that permission. The roadmap asks for the design before the workflow is written (M0.3, which is a maintainer-designed area, SEC-14).

This repository has no git remote, so a release cannot run end to end. This ADR proves what can be proven without a remote (the workflow's structure with linters, the tarballs, the publish loop against a local registry) and lists what cannot.

## Options

| Option                                                                                                                | For                                                                                                                | Against                                                               |
| --------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------- |
| A. Three jobs: `verify`, `build` (no `id-token`), `publish` (`id-token: write`, protected environment, tarballs only) | Meets SEC-21 exactly. A compromised build cannot reach the OIDC token. A rerun finishes a partly published release | Two more jobs and an artifact hand-off                                |
| B. One job that builds and publishes                                                                                  | Simplest                                                                                                           | Breaks SEC-21: attacker code in the build runs next to the OIDC token |
| C. Publish with a long-lived npm token from a secret                                                                  | Works from anywhere                                                                                                | Breaks SEC-15. A stolen token publishes without any workflow          |

## Decision

Option A.

1. **Trigger.** Only a push of a tag `v<major>.<minor>.<patch>`. A repository ruleset on `refs/tags/v*` limits creation to the maintainer and blocks update and deletion. Top-level `permissions: {}`. One concurrent release (`cancel-in-progress: false`).
2. **`verify` job** (`contents: read`). The tagged commit must be an ancestor of `origin/main` and the root `package.json` version must equal the tag.
3. **`build` job** (`contents: read`, no `id-token`). Frozen install, then `check`, `typecheck`, `lint`, `test` and `build`, then pack every package from inside the workspace, write `SHA256SUMS`, run `publint`, and upload one artifact. No cache. `pnpm/setup` runs with `cache: false` and `install: false`.
4. **`publish` job** (`contents: read`, `id-token: write`, `environment: release`). It downloads the artifact, checks `SHA256SUMS`, and publishes each tarball in layer order (foundation, contracts, product, tools). It skips a version that already exists, so a rerun after a partial failure completes the release. It runs `setup-node` without `registry-url` (that would set `NODE_AUTH_TOKEN`, which overrides the OIDC exchange). It installs, builds and tests nothing. Provenance is added by npm.
5. **Environment `release`.** Required reviewer is the maintainer, and deployments are limited to `v*` tags. With a single maintainer this is a deliberate pause, not a second pair of eyes, so "prevent self-review" stays off.
6. **Trusted publisher per package** on npmjs.com: owner and repository, workflow file `release.yml`, environment `release`. npm CLI 11.5.1 or later is required. Node.js 24.12 bundles npm 11.6.2 and Node.js 26.13.1 bundles 11.20.0.
7. **Pinning.** Every third-party action is pinned by commit SHA with the tag in a comment (SEC-13). Renovate keeps them current (`helpers:pinGitHubActionDigests`) and respects `minimumReleaseAge`.
8. **Checks in `pnpm check`.** `actionlint` and `zizmor` (versions pinned), and a small `tools/check-workflows.ts` for the rules they do not have: SEC-21 (a job with `id-token: write` has no install, build or test step and only allowed actions), SEC-16 (no cache in the release workflow, a protected environment on that job, no `pull_request_target`, empty top-level permissions) and SEC-15 (no `NODE_AUTH_TOKEN` or npm token, no `registry-url`).
9. **CI changes** (a maintainer-designed file): pin SHAs, and set `install: false` on `pnpm/setup`, whose default runs `pnpm install` before the explicit frozen install. Run `attw --profile esm-only`.
10. **Before the first release:** remove `private: true` from the packages (the spike's tarballs were refused until it was gone), and run a dry-run release of a throwaway package (roadmap M0.3).

## Evidence

Spike on 2026-11-22, Node.js 26.13.1, actionlint (current image), zizmor 1.32.0, publint, attw, Verdaccio 6. Drafts, the checker and the publish script are in `bieberkit-spikes/release-spike`. Nothing was installed in `.github/`.

**Linters on the workflows.**

| Workflow                              | actionlint              | zizmor                                                                                                                                                                   | `check-workflows.ts`                                                                                                                                                         |
| ------------------------------------- | ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Current `ci.yml`                      | clean                   | 2 high: `actions/checkout@v6` and `pnpm/setup@v1` not pinned to a hash                                                                                                   | clean                                                                                                                                                                        |
| Draft `ci.yml` and `release.yml`      | clean                   | no findings, also in pedantic mode after a comment on `id-token: write`                                                                                                  | clean                                                                                                                                                                        |
| A deliberately wrong release workflow | one: template injection | `unpinned-uses` (4), `cache-poisoning` (3), `template-injection`, `excessive-permissions`, `dangerous-triggers`, `secrets-outside-env`, `artipacked`, and two lower ones | 13 violations: `pull_request_target`, installs and builds in the `id-token` job, three caches, `registry-url`, an npm token, no environment, non-empty top-level permissions |

zizmor has no rule for SEC-21 (no install or build in the job that holds `id-token: write`), which is why the small own checker exists. The checker had no false positive on either draft.

**Actions pinned in the draft (2026-11-22).** `actions/checkout` v7.0.1, `actions/setup-node` v7.1.0, `actions/upload-artifact` v7.0.2, `actions/download-artifact` v8.0.2, `pnpm/setup` v3.2.0. Each tag was resolved to its commit with `git ls-remote`. The current CI uses `actions/checkout@v6`, which is not the latest major.

**`pnpm/setup`.** I could not confirm before that this action exists. It does (tags v1 to v3.2.0). Both v1 (the tag the current CI uses) and v3.2.0 accept `runtime` and `cache`. In v1 the `install` input defaults to true, so the action itself runs `pnpm install` before the repository's own `pnpm install --frozen-lockfile` step.

**Packaging, 18 packages.**

- `pnpm pack` run in a copy outside the workspace failed for 13 packages ("this dependency is not installed"). Run from inside the workspace, all 18 packed, and `workspace:*` became the real version (`@bieberkit/core` `0.0.0`).
- `publint`: 18 clean. `attw` with the default profile: 18 of 18 fail, because the packages are ESM only. With `--profile esm-only`: 18 of 18 pass.
- The tarballs still carry `private: true`, which npm refuses to publish.

**Publish from tarballs, against a local registry** (Verdaccio with a token, so this shows the loop, not OIDC): order was `core`, then the contract packages, then product packages, then `mcp`, `bieberkit`, `create-bieberkit`. Run 1 stopped before the 7th package (6 published). Run 2 published the 12 remaining and skipped 6. Run 3 skipped all 18. After one tarball was changed following the checksum step, `sha256sum --check` refused to continue.

**Not proven here:** the draft workflows were linted, not run on GitHub; the OIDC exchange and the provenance attestation, the ruleset on tags, the required-reviewer environment and its tag restriction, `npm trust` configuration, behavior when the npm CLI rejects a version, and how the release train treats a package whose version changed alone. These are the checks of the first dry-run release. SEC-17 describes a May 2026 incident, which I did not verify.

## Consequences

- Easier: the publish job is small enough to review in one reading, and a failed release is finished by rerunning it. Violations of SEC-15, SEC-16 and SEC-21 fail `pnpm check` before they merge.
- Harder: two more jobs, an artifact hand-off, and a maintained checker. A new action in the publish job needs an entry on the allow list.
- Constraint: the maintainer configures the ruleset, the environment and each package's trusted publisher by hand, because they live outside the repository.
- Ruled out: caches in the release workflow, `registry-url`, tokens, and building in the job that publishes.
- Dependency: `yaml` 2.9.1 (ISC, no install script, no dependencies) as a development dependency of the checker (P9). Maintainer to confirm.

## Spec changes

Made in spec 0.8.4, in the same pull request as these ADRs:

- SEC-13: say that Renovate also keeps the SHAs current and that the tag is kept in a comment.
- SEC-15 and SEC-16: the three job structure, the tag pattern, the ruleset and the environment.
- SEC-21: the allow list for the `id-token` job, and the checker that enforces it.
- Section 24.2: tarballs are packed once, checked by checksum, and published in layer order, and a rerun skips what exists.
- Section 3: `attw` runs with `--profile esm-only`.

## Follow-ups

- Roadmap M0.3 items for the CI changes, `check-workflows`, the release workflow and the dry run, all maintainer-designed.
- Reserve the `@bieberkit` scope and create the GitHub organization first (open [M] items in M0.2), since the trusted publisher binds to both.
- Decide whether the release also creates a GitHub release with the tarballs and checksums.
