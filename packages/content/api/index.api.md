<!--
  BieberKit

  @file        packages/content/api/index.api.md
  @description API report of @bieberkit/content: its public surface, checked in CI and reviewed in pull requests.
  @author      Bieber Kieu <kieutrongthien@gmail.com>
  @generated   pnpm api:update
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

# API report: @bieberkit/content

Generated from the built declaration files by `pnpm api:update`. Do not edit by hand. A change here is a change to the public API and needs a changeset (spec section 22.3).

```ts
import { A as ResolvedImage, C as ListBlock, D as ParagraphBlock, E as Mark, M as VideoBlock, O as QuoteBlock, S as Inline, T as ListItem, _ as EmbedProvider, a as Block, b as ImageBlock, c as BuiltInBlock, d as ContentElement, f as ContentNode, g as DrawnBlock, h as CustomBlock, i as defineBlock, j as TableBlock, k as RenderOptions, l as CONTENT_VERSION, m as CtaBlock, n as ContentOptions, o as BlockDef, p as ContentProblem, r as createContent, s as BlockTools, t as Content, u as ContentDocument, v as GalleryBlock, w as ListBody, x as ImageRef, y as HeadingBlock } from "./content-ssMgeg54.js";
import { BkError } from "@bieberkit/core/errors";
type ContentErrorCode = "CONTENT_INVALID" | "CONTENT_VERSION" | "CONTENT_BLOCK_INVALID";
export declare class ContentError extends BkError {
  readonly problems: readonly ContentProblem[];
  constructor(code: ContentErrorCode, problems: readonly ContentProblem[]);
}
export declare const packageName = "@bieberkit/content";
export { type Block, type BlockDef, type BlockTools, type BuiltInBlock, CONTENT_VERSION, type Content, type ContentDocument, type ContentElement, type ContentErrorCode, type ContentNode, type ContentOptions, type ContentProblem, type CtaBlock, type CustomBlock, type DrawnBlock, type EmbedProvider, type GalleryBlock, type HeadingBlock, type ImageBlock, type ImageRef, type Inline, type ListBlock, type ListBody, type ListItem, type Mark, type ParagraphBlock, type QuoteBlock, type RenderOptions, type ResolvedImage, type TableBlock, type VideoBlock, createContent, defineBlock };
```
