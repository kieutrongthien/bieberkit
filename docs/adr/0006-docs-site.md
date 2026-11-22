<!--
  BieberKit

  @file        docs/adr/0006-docs-site.md
  @description Proposed documentation site generator and hosting, an open question in spec section 26.
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

# 0006. Documentation site generator and hosting

- Status: Accepted
- Date: 2026-11-22
- Deciders: Bieber Kieu
- Decision process: the maintainer asked the implementing agent to choose the best option. The choice stands until the maintainer overrides it with a superseding ADR.
- Requirements: spec section 22.1 (bundled docs, `llms.txt`), SEC-11 to SEC-14, SEC-21, spec section 26 (open question)

## Context

Docs source lives in `docs/` and is bundled into each package at build, with an `llms.txt` index that matches the installed version (spec 22.1). The public site needs versioned docs, search, and English with Vietnamese and Chinese as likely later languages (the admin supports en, vi and zh, UI-05). Every Markdown file starts with an HTML comment header, so the generator must ignore it.

The site is a build-time tool and is not shipped to users, so it carries no runtime dependency (P9). It still falls under the supply-chain rules (SEC-11, SEC-12). Deploying it must not put `id-token: write` on a job that installs or builds (AGENTS.md, SEC-21), and changing `.github/workflows/` is a maintainer-only area (SEC-14).

## Options

| Option                     | For                                                                                                                                                         | Against                                                                                                                |
| -------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| A. Starlight (Astro)       | Built-in i18n and search. Plugins exist for `llms.txt` (`starlight-llms-txt` 0.12.0) and versioning (`starlight-versions` 0.10.2). Starlight 0.43.1, active | Astro is a third front-end toolchain beside the admin (Vite and React) and the site (TanStack Start). Starlight is 0.x |
| B. VitePress               | Simple, fast, stable 1.6.4                                                                                                                                  | Vue-based. No first-party versioning or `llms.txt` plugin was checked                                                  |
| C. Docusaurus              | Versioning and i18n are core features. React. 3.10.2                                                                                                        | Heavy, with a large dependency tree to keep under `minimumReleaseAge`                                                  |
| D. Nextra                  | React                                                                                                                                                       | Last published 2025-12-04, so it is the least active of the five                                                       |
| E. Build on TanStack Start | One stack for everything                                                                                                                                    | We would write search, versioning and sidebar ourselves, which is a project by itself                                  |

Hosting is a second choice:

| Host                                  | For                                                                                       | Against                                                                                                                         |
| ------------------------------------- | ----------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| GitHub Pages                          | Free, same place as the code                                                              | Deploy needs a workflow, and its deploy step uses `id-token: write`. Allowed only if the build and the deploy are separate jobs |
| Cloudflare Pages with Git integration | No GitHub workflow and no token in the repository. The build runs on the host. Global CDN | Another vendor and account                                                                                                      |

## Decision

Starlight on Cloudflare Pages through its Git integration. Starlight covers the needs with plugins instead of our own code. The Git integration avoids any new workflow and any `id-token: write`, which keeps this decision out of the maintainer-only area. The output is static files, so the host can be changed later without touching the content.

## Evidence

`npm view` on 2026-11-22 (all MIT): `@astrojs/starlight` 0.43.1, modified 2026-11-13. `vitepress` 1.6.4, modified 2026-10-25. `@docusaurus/core` 3.10.2, modified 2026-11-14. `nextra` 4.6.1, modified 2025-12-04. `starlight-llms-txt` 0.12.0, modified 2026-09-15. `starlight-versions` 0.10.2, modified 2026-10-30.

Not tested: building our `docs/` with any of them, the HTML comment header in Markdown, or how the plugins behave with our version scheme. Not checked: Cloudflare Pages limits and terms.

## Consequences

- Easier: search, versioning and `llms.txt` come from plugins.
- Harder: Astro and its plugins are new dependencies for the docs workspace, covered by the same pinning and release age rules. Starlight is 0.x, so upgrades may need work.
- Ruled out: docs hosted on a path of the product site.

## Spec changes

Made in spec 0.8.1, in the same pull request as this ADR.

- Section 3 or 22.1: name the generator and host.
- Section 26: tick the open question.

## Follow-ups

- A short spike when docs work starts (roadmap M3.3): build `docs/` with Starlight, check the header comment, versions and `llms.txt`.
