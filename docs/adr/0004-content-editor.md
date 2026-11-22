<!--
  BieberKit

  @file        docs/adr/0004-content-editor.md
  @description Proposed choice of the block content editor engine, Tiptap or Lexical, with spike measurements.
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

# 0004. Content editor: Tiptap 3

- Status: Accepted
- Date: 2026-11-22
- Deciders: Bieber Kieu
- Decision process: the maintainer asked the implementing agent to choose the best option. The choice stands until the maintainer overrides it with a superseding ADR.
- Requirements: CNT-01 to CNT-05, UI-12, spec section 18.1 (admin initial JS under 400 KB), P9

## Context

CNT-04 asks for a Phase 0 spike that chooses between Lexical and Tiptap on four criteria: block support, collaboration readiness, Vietnamese input method handling and bundle size. Whichever engine wins, content is stored as BieberKit's own versioned block JSON (CNT-01), rendered by shared React components (CNT-02) and by a framework-free serializer (CNT-05). The editor is therefore an input surface that converts to and from our block schema, not the storage format.

## Options

| Option                    | For                                                                                                                             | Against                                                                                                                                                   |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A. Tiptap 3 (ProseMirror) | Document model is a typed node tree close to a block list. `@tiptap/html` renders on the server. 70+ MIT extensions. Stable 3.x | Run by a company that sells a cloud product. Collaboration and document history are sold as paid cloud features, so we would self-host Yjs and Hocuspocus |
| B. Lexical 0.x            | Maintained by Meta, MIT, no commercial product around it. `@lexical/yjs` for collaboration                                      | Pre-1.0 (0.53.0), so API changes are expected. Custom blocks are `DecoratorNode` classes, usually rendered with React                                     |
| C. Write our own          | Full control                                                                                                                    | Contenteditable and input method handling are the hard part. Not feasible for one maintainer                                                              |

## Decision

Tiptap 3 (option A). The Vietnamese input test below is a gate before the editor ships in M2.3 (CNT-04), not before this decision: the editor is not built until Phase 2, and storage is our own block JSON, so the choice is cheap to reverse. If Tiptap fails the test where Lexical passes, a new ADR supersedes this one.

Reasons: it is past 1.0, its document model maps onto the block schema with less glue, and the measured size is slightly lower. The main risk is commercial drift (see Consequences), not technical.

## Evidence

All measured on 2026-11-22 in a scratch project outside the repository, with esbuild, minified, production React 19, gzip level 9. Scripts are not committed because they were throwaway.

| Bundle                                                    | Minified  | Gzip         |
| --------------------------------------------------------- | --------- | ------------ |
| React 19 and react-dom, empty render                      | 222,731 B | 68,861 B     |
| Lexical 0.53.0 with rich text, list, link, table, history | 708,714 B | 227,102 B    |
| Tiptap 3.35.0 with StarterKit and table                   | 683,279 B | 214,104 B    |
| Editor only (bundle minus React), Lexical                 |           | about 158 KB |
| Editor only (bundle minus React), Tiptap                  |           | about 145 KB |

The difference is about 13 KB gzip. Either editor is a large share of the 400 KB admin budget in section 18.1 (the spec does not say whether that figure is gzip or raw), so the editor should load as a lazy chunk with either choice (UI-12).

Licenses and packages (`npm view`): `@tiptap/core`, `@tiptap/react`, `@tiptap/extension-collaboration`, `@tiptap/html`: MIT, 3.35.0. `lexical`, `@lexical/react`, `@lexical/yjs`, `@lexical/headless`, `@lexical/html`: MIT, 0.53.0. `yjs` 13.6.33: MIT.

Tiptap's own pages state that the editor is MIT and that collaboration and document history are paid Cloud features, with Hocuspocus (self-hosted) under MIT. See [tiptap.dev/pricing](https://tiptap.dev/pricing) and [tiptap.dev/open-source-to-platform](https://tiptap.dev/open-source-to-platform). In 2025 Tiptap moved 10 former Pro extensions to MIT.

Vietnamese input: not resolved. Searches for Telex or UniKey problems in Lexical, Tiptap and ProseMirror found no report either way. Telex rewrites already typed characters, so editors that react to every keystroke during composition can break it, and ProseMirror documents that cross-block edits and overridden text input can abort a composition. A headless browser cannot reproduce an operating system input method, so this needs a manual test.

Not evaluated: block support beyond the basics (custom blocks, galleries, embeds), and collaboration in practice. Both engines have a path, so neither is disqualified.

## Consequences

- Easier: server-side HTML for emails and RSS comes from our own serializer (CNT-05) either way. The editor can be replaced without a content migration because storage is our block JSON.
- Harder: a converter between editor state and block JSON must be written and tested for round trips.
- Risk accepted: Tiptap's company could move more features behind a paid plan. Mitigation: the core stays MIT and a fork is possible. Revisit if a feature we ship depends on a paid extension.
- Runtime dependency line (P9): `@tiptap/*`, reason: block editing. Maintainer: the ueberdosis organization on GitHub (to be confirmed). License: MIT.

## Vietnamese input test (gate before M2.3)

On a real machine with Telex and VNI (UniKey on Windows, macOS built-in Vietnamese, ibus-bamboo or ibus-unikey on Linux), type the same sentences in the minimal editors in each engine: "Tiếng Việt có dấu", "đường", "nguyễn", "thương mại", correct a tone in the middle of a word, and type inside a table cell and a list item. Record pass or fail per engine and input method in the new ADR or in a note appended here.

## Spec changes

Made in spec 0.8.1, in the same pull request as this ADR.

- Section 3, Content editor row: replace "Lexical or Tiptap" with the accepted engine.
- Section 16.5 (CNT-04): state the engine and remove "chosen by a spike".

## Follow-ups

- The maintainer runs the input test before M2.3 starts.
- A later spike (Phase 2, M2.3) covers custom blocks and the editor-to-block-JSON round trip.
