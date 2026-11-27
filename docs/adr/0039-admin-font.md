<!--
  BieberKit

  @file        docs/adr/0039-admin-font.md
  @description Decision on the font of the admin: Be Vietnam Pro, bundled in the built application from the Fontsource package.
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

# 0039. The admin bundles the font Be Vietnam Pro

- Status: Proposed
- Date: 2026-11-27
- Deciders: Bieber Kieu
- Requirements: UI-23, UI-05, UI-14, TOK-03, SEC-01, P9

## Context

The identity that the maintainer chose for the admin (UI-23, `docs/modules/admin-identity.md`) is drawn with Be Vietnam Pro, a typeface made for the marks of Vietnamese. The policy of the admin lets no font come from another origin (`font-src 'self' data:`, UI-14), so the font is either in the built application or not used. P9 asks for a reason, a maintainer and a license for a dependency whose files the package publishes.

**The license is the point that needs the maintainer.** The font is under the SIL Open Font License 1.1 (OFL-1.1), which is not the license of the project. It allows to bundle and to redistribute the font with software under any license, asks that its copyright and license travel with the files, and forbids to sell the font alone. The Apache Software Foundation lists OFL-1.1 in its category B (may be included in binary form with a notice). AGENTS.md asks for "Apache-2.0 compatible licenses only".

## Options

| Option                                                                                                        | For                                                                                                                                                          | Against                                                                                               |
| ------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------- |
| A. `@fontsource/be-vietnam-pro` as a dev dependency of `@bieberkit/admin-antd`, weights 400, 500, 600 and 700 | The files come from the registry with an integrity hash, split by script with `unicode-range`, so a browser reads only what the page needs. No binary in git | A license that is not Apache or MIT. The font files make the package larger                           |
| B. The system fonts (the stack of today)                                                                      | No dependency and no new license                                                                                                                             | The identity looks different on every system, and several draw Vietnamese marks poorly at small sizes |
| C. The `.woff2` files committed in the repository                                                             | No dependency                                                                                                                                                | The same license, binaries in git, and updates by hand                                                |

## Decision

Option A. `@fontsource/be-vietnam-pro` 5.3.0, pinned exactly, a dev dependency of `@bieberkit/admin-antd`: Vite copies the files into `dist/app/assets`, and nothing of the package is needed at run time.

| Package                      | Version | Reason                                                                                         | Maintainer, license                                                        |
| ---------------------------- | ------- | ---------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| `@fontsource/be-vietnam-pro` | 5.3.0   | The typeface of the identity of the admin (UI-23), served from the origin of the admin (UI-14) | Fontsource (packaging); the Be Vietnam Pro Project Authors (font), OFL-1.1 |

The font goes first in the default stack of `@bieberkit/tokens`. Chinese is not in the font, so the families of the system that follow it draw it (TOK-03). A font of the config still goes in front.

The `NOTICE` of `@bieberkit/admin-antd` names the font, its copyright and its license, and the text of the license is published with the package.

If the maintainer does not accept OFL-1.1, option B follows by removing the dependency and its import. Nothing else depends on it.

## Evidence

Figures from the build of this change are in `docs/modules/admin-identity.md`, section Tests. The font is read by CSS and is not in the initial JavaScript that the budget of section 18.1 measures.

## Consequences

- Easier: the admin looks the same on every system.
- Harder: a second license is in a published package, and its notice has to stay with the files.
- Ruled out: fonts from a font service.

## Spec changes

- UI-23: the font that the adapter bundles.

## Follow-ups

- A check of the licenses of bundled files in the supply chain audit (roadmap M3.1).
