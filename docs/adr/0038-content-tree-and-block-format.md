<!--
  BieberKit

  @file        docs/adr/0038-content-tree-and-block-format.md
  @description Decision record: content is a flat list of versioned blocks, and the React renderer and the HTML serializer both draw one checked element tree.
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

# 0038. Content is versioned blocks, drawn through one element tree

- Status: Accepted
- Date: 2026-11-27
- Deciders: Bieber Kieu
- Requirements: CNT-01, CNT-02, CNT-03, CNT-05, FE-01, SITE-14, P1, P9

## Context

CNT-02 asks for React renderers that the admin preview and the site share, so that preview matches production. CNT-05 asks for an HTML serializer with no framework, for mail, feeds and headless renderers. CNT-03 asks for sanitized output from both. Stored content outlives the code that wrote it, so its format is expensive to change. `@bieberkit/content` runs in the browser and on the server.

## Options

| Option                                                                                                                          | For                                                                                                     | Against                                                                                |
| ------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| A. Every block builds a plain element tree; the HTML serializer writes it as text and the React renderer turns it into elements | One place checks URLs and tags; both outputs match by construction; a plugin writes a custom block once | The tree is one more type to keep; a block that needs state in React needs an override |
| B. React components and a separate HTML function for every block                                                                | Each side is idiomatic                                                                                  | Two copies of every block and of every safety rule, which drift apart                  |
| C. React only, and the HTML comes from `renderToStaticMarkup`                                                                   | One copy                                                                                                | The serializer needs React and `react-dom` on the server, against CNT-05               |

## Decision

Option A. The stored form is `{ version: 1, blocks: [...] }`, a flat list in which only lists nest. Text is a list of runs with marks and an optional link. No block holds HTML, and there is no raw HTML block. A block of a plugin is declared with `defineBlock`, its type is `<namespace>.<name>`, and the tree it returns is checked against an allowlist of tags and attributes before either output sees it.

Dependencies of `@bieberkit/content` (P9). None of them is new to the repository.

| Dependency         | Version                  | Reason                                                                    | Maintainer              | License    |
| ------------------ | ------------------------ | ------------------------------------------------------------------------- | ----------------------- | ---------- |
| `zod` (`zod/mini`) | 4.6.7                    | The data of a custom block is checked by a schema value, as in `f.custom` | colinhacks              | MIT        |
| `react`            | optional peer, `^19.2.4` | The renderers of the subpath `@bieberkit/content/react` (ADR 0025)        | Meta and the React team | MIT        |
| `@bieberkit/core`  | workspace                | `BkError` (MOD-17)                                                        | this repository         | Apache-2.0 |

`@bieberkit/core` gains the subpath `@bieberkit/core/errors`. Its main entry loads Node.js built-ins, which a browser bundle cannot load, and `errors.ts` imports nothing.

## Evidence

Read in the repository on 2026-11-27: `packages/core/src/errors/errors.ts` has no imports; `@bieberkit/core` exports only `.`; the browser packages `admin-core` and `tokens` do not depend on it. No spike was run.

## Consequences

- Easier: the editor (CNT-04) only converts to and from this format; a theme replaces the drawing of one block without touching content (SITE-14).
- Harder: a new tag or attribute needs a change of the allowlist and a name mapping for React. A change of the stored form needs a new `version` and a converter.
- Ruled out: HTML pasted into content, `iframe` from a custom block, and a new video provider without a change of this package.
- A block that a theme or a plugin overrides in React is no longer the same as its HTML output. The override is for behavior, and its author keeps the two alike.

## Spec changes

Made in spec 0.8.37, with the implementation: CNT-01 names `version: 1` and the flat list, and CNT-03 says that there is no raw HTML block, in place of "raw HTML blocks are off by default". The maintainer agreed to the change of meaning on 2026-11-27.

## Follow-ups

- A field of an entity that stores a document, with validation on write, in the slice that first stores content.
- Plugins that contribute blocks through `definePlugin`. That is a maintainer-only API, so a project passes the blocks to `createContent` until then.
- Image variants and `srcset` come from the `image` option of the renderer (SEO-08).
