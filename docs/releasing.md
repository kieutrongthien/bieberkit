<!--
  BieberKit

  @file        docs/releasing.md
  @description Maintainer runbook for releases: the one-time setup of GitHub and npm, the first dry run, cutting a release and the security fast path.
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

# Releasing BieberKit

Design: [ADR 0014](adr/0014-release-pipeline.md). Rules: SEC-13, SEC-15, SEC-16, SEC-21 and section 24.2 of the spec. The workflows are `.github/workflows/ci.yml` and `.github/workflows/release.yml`.

The workflow files are in the repository. The settings below live on GitHub and npm, outside it, so only the maintainer can make them. Do them in this order. Each step ends with a check.

## What runs where

| Job                         | File          | Holds `id-token`? | Purpose                                                                                                 |
| --------------------------- | ------------- | ----------------- | ------------------------------------------------------------------------------------------------------- |
| `check` (Node.js 26 and 24) | `ci.yml`      | no                | `pnpm check`, format, lint, types, build, tests                                                         |
| `packages`                  | `ci.yml`      | no                | API reports match the build, `publint` and `attw --profile esm-only` on every tarball                   |
| `changeset` (pull requests) | `ci.yml`      | no                | An API report that changed needs a changeset                                                            |
| `workflows`                 | `ci.yml`      | no                | `actionlint` and `zizmor`, as containers pinned by digest                                               |
| `services`                  | `ci.yml`      | no                | PostgreSQL 15, MySQL 8.4 and Valkey 8 start and answer, for the integration tests of later phases       |
| `verify`, `build`           | `release.yml` | no                | Tag on `main`, version equals tag, then build, test and pack once, with checksums and the publish order |
| `publish`                   | `release.yml` | **yes**           | Publishes the tarballs. Installs, builds and tests nothing                                              |

`pnpm check` also runs `tools/check-workflows.ts`, which enforces SEC-15, SEC-16 and SEC-21 on every workflow file.

## One-time setup

1. **GitHub organization and repository.** Create the organization (an open item of roadmap M0.2), push the repository, and keep `CODEOWNERS` pointing at the maintainer. Check: the `check`, `packages`, `workflows` and `services` jobs run on the first pull request.
2. **Branch rules on `main`.** Require the CI jobs above, signed commits and pull requests. Check: a direct push to `main` is refused.
3. **Tag ruleset.** A ruleset on `refs/tags/v*` that restricts creation to the maintainer and blocks updates and deletion. Check: another account cannot create `v0.0.1`.
4. **Environment `release`.** Settings, Environments. Required reviewer: the maintainer. Deployment branches and tags: only tags matching `v*`. Leave "prevent self-review" off, since there is one maintainer: the approval is a deliberate pause before publishing, not a second reviewer. Check: a run of `release.yml` stops at the `publish` job and waits.
5. **npm names.** Reserve the `@bieberkit` scope and the names `bieberkit` and `create-bieberkit` (an open item of roadmap M0.2). Check: you can publish under all three.
6. **Trusted publisher, once per package** (26: the 20 in `packages/` and the 6 in `plugins/`). On npmjs.com, for each package: provider GitHub Actions, the organization and repository, workflow file `release.yml`, environment `release`. See npm's documentation on trusted publishers, and verify the current steps there, because they are outside this repository. npm CLI 11.5.1 or later is required, and Node.js 24.12 and 26 both bundle a newer one. Check: the package settings page lists the publisher.
7. **`private: true`** is removed from the 26 manifests, which also carry `repository`, `homepage` and `bugs` (npm checks `repository.url` against the repository of the provenance statement, so it must be `https://github.com/kieutrongthien/bieberkit`) and ship `LICENSE`, `NOTICE` and `README.md` (`pnpm check:packages` fails when a tarball lacks one). Done for the first beta; a new package starts with the same fields.
8. **Renovate.** Install the Renovate app on the repository. `renovate.json` is already in place. Check: it opens a "Configure" or dependency dashboard issue.
9. **Repository setting (optional).** In Actions settings, require that actions are pinned to a full commit SHA. The workflows already comply (SEC-13).

## The first dry run

Do this before the first real release, and tick "Dry-run release publishes a throwaway package end to end" in roadmap M0.3 only after it works.

1. Create a throwaway repository under the same organization with a copy of `release.yml` and one package, for example `@bieberkit/dry-run` version `0.0.1`. A throwaway package keeps a failed first attempt away from the real names.
2. Configure a trusted publisher for it as in step 6 above, pointing at the throwaway repository.
3. Push the tag `v0.0.1`, approve the `release` environment, and watch `publish`.
4. Check that: the run used OIDC and no token, the npm page shows the provenance statement, `npm audit signatures` passes for it, a second run of the job publishes nothing, and a tag created by someone else is refused by the ruleset.
5. Deprecate or unpublish the throwaway package. Registry rules limit unpublishing, so deprecate if it is too late.

## Beta releases (0.x)

Until 1.0.0 (roadmap M3.5) every package is released as `0.<minor>.0`, and the whole set shares that one number.

- **The version has no suffix.** `0.1.0`, `0.2.0` and so on. The resolver of plugins accepts `major.minor.patch` only (PLG-08), so a `-beta.1` suffix is not used.
- **The npm tag is `beta`.** `release.yml` publishes every `0.x` version with `--tag beta` and `1.0.0` or later with `latest`. A request without a tag does not get a beta. Install with `pnpm add @bieberkit/core@beta` or `pnpm create bieberkit@beta`.
- **A minor version may break.** Use `minor` in a changeset for a breaking change and `patch` for a fix. The caret range of `0.1.0` stays inside `0.1.x`.
- **After the first publish of a package**, run `npm dist-tag ls <name>` and check what `latest` points at. If the registry set it to the beta, move it as the maintainer decides. This is the one thing about the first publish that has not been seen yet.
- **A project made from a fresh release waits.** The generated `pnpm-workspace.yaml` has `minimumReleaseAge: 10080` (SEC-11), so a version younger than 7 days cannot be installed. `pnpm create bieberkit` works for a beta only seven days after its publication. The setting is not relaxed for first-party packages without a decision of the maintainer.
- **Changelogs.** `pnpm changeset version` writes a `CHANGELOG.md` in each package, and the header rule (HDR-01) rejects it, since the tool puts its entries after the first line of the file. The first beta ships without them. Decide before the second release: exempt `CHANGELOG.md` from the header rule, or turn changelogs off in `.changeset/config.json` and use release notes.

## Cutting a release

1. Merge the pull request that versions the packages (`pnpm changeset version`). All `@bieberkit/*`, `bieberkit` and `create-bieberkit` share one version (section 24.2).
2. Create a signed tag on `main`: `git tag -s v0.1.0 -m "v0.1.0"` and `git push origin v0.1.0` (the tag is `v` and the version in the root `package.json`, which must match).
3. Open the `Release` run and approve the `release` environment when `verify` and `build` are green.
4. After `publish`, check one package on npmjs.com for the provenance statement and the right version.

If the job fails halfway, run it again. It publishes in layer order and skips every version that already exists, so the release finishes without double publishing. `SHA256SUMS` is checked first, so a changed tarball stops the run.

## Security fast path (AUTH-08, SITE-06, SEC-11)

Better Auth and TanStack Start have shipped security fixes within days of a release, and `pnpm` refuses a version younger than seven days (`minimumReleaseAge`).

1. Renovate opens a pull request labelled `security` or `watched` at once.
2. Add the exact fixed version to `minimumReleaseAgeExclude` in `pnpm-workspace.yaml`, for example `better-auth@1.7.28`. That file is protected (SEC-14) and Renovate cannot edit it, so the maintainer does it by hand.
3. Run `pnpm install`, check the diff of the lockfile, and merge once CI is green.
4. After seven days remove the exclusion in a follow-up pull request. Never lower `minimumReleaseAge` and never add a blanket exclusion.

## Updating the linter images

`actionlint` and `zizmor` run in CI as containers pinned by digest, so no third-party action is added to `ci.yml`. Renovate does not see the digests inside `run:` steps. Update them by hand every quarter, or when a linter releases a rule you need:

1. Pull the new image and read its digest: `docker pull rhysd/actionlint:latest`, then `docker inspect --format '{{index .RepoDigests 0}}' rhysd/actionlint:latest`. The same for `ghcr.io/zizmorcore/zizmor`.
2. Put the digest and the version in the comment above the step in `ci.yml`.
3. Run both linters on `.github/workflows/` (as the `workflows` job does) and fix what they report.

## Troubleshooting

| Symptom                                 | Cause                                                                                                                         |
| --------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| `EPRIVATE` on publish                   | A package still has `private: true` (setup step 7)                                                                            |
| `ENEEDAUTH` or an OIDC error on publish | `NODE_AUTH_TOKEN` is set, or `setup-node` got a `registry-url`. Both override the OIDC exchange. `check-workflows` flags them |
| 404 or "not found" on the OIDC exchange | The trusted publisher of that package does not match the repository, `release.yml` or the environment name (setup step 6)     |
| `publish` is skipped                    | `build` failed, or the environment `release` waits for approval                                                               |
| `check:api` fails in CI                 | The built output differs from `packages/*/api`. Run `pnpm build` and `pnpm api:update`, commit the reports, add a changeset   |
| `changeset` job fails                   | An existing API report changed and no file was added to `.changeset/`. Run `pnpm changeset`                                   |

## Not yet proven

The workflows were checked with `actionlint`, `zizmor`, `tools/check-workflows.ts`, the same commands on Node.js 24.12 and 26, and the publish script against a local registry. They have not run on GitHub, so the OIDC exchange, the provenance statement, the ruleset, the environment approval and Renovate's behavior are unproven until the dry run above.
