<!--
  BieberKit

  @file        packages/content/api/content.api.md
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
import { core } from "zod/mini";
declare const CONTENT_VERSION: 1;
type Mark = "bold" | "italic" | "strike" | "code";
interface Inline {
  readonly text: string;
  readonly marks?: readonly Mark[];
  readonly href?: string;
}
interface ListBody {
  readonly ordered: boolean;
  readonly items: readonly ListItem[];
}
interface ListItem {
  readonly content: readonly Inline[];
  readonly list?: ListBody;
}
type ImageRef = {
  readonly alt: string;
  readonly src: string;
} | {
  readonly alt: string;
  readonly media: string;
};
interface ParagraphBlock {
  readonly type: "paragraph";
  readonly content: readonly Inline[];
}
interface HeadingBlock {
  readonly type: "heading";
  readonly level: 2 | 3 | 4 | 5 | 6;
  readonly content: readonly Inline[];
}
interface ListBlock extends ListBody {
  readonly type: "list";
}
interface QuoteBlock {
  readonly type: "quote";
  readonly content: readonly Inline[];
  readonly cite?: string;
}
interface ImageBlock {
  readonly type: "image";
  readonly image: ImageRef;
  readonly caption?: string;
}
interface GalleryBlock {
  readonly type: "gallery";
  readonly images: readonly ImageRef[];
}
interface VideoBlock {
  readonly type: "video";
  readonly url: string;
  readonly title: string;
}
interface TableBlock {
  readonly type: "table";
  readonly header: boolean;
  readonly rows: readonly (readonly (readonly Inline[])[])[];
}
interface CtaBlock {
  readonly type: "cta";
  readonly label: string;
  readonly href: string;
  readonly text?: string;
}
interface CustomBlock {
  readonly type: `${string}.${string}`;
  readonly data: unknown;
}
type BuiltInBlock = ParagraphBlock | HeadingBlock | ListBlock | QuoteBlock | ImageBlock | GalleryBlock | VideoBlock | TableBlock | CtaBlock;
type Block = BuiltInBlock | CustomBlock;
interface ContentDocument {
  readonly version: typeof CONTENT_VERSION;
  readonly blocks: readonly Block[];
}
interface ContentElement {
  readonly tag: string;
  readonly attrs?: Readonly<Record<string, string>>;
  readonly children?: readonly ContentNode[];
}
type ContentNode = string | ContentElement;
interface ContentProblem {
  readonly path: string;
  readonly message: string;
}
interface ResolvedImage {
  readonly src: string;
  readonly width?: number;
  readonly height?: number;
  readonly srcset?: string;
  readonly sizes?: string;
}
type EmbedProvider = "youtube" | "vimeo";
interface RenderOptions {
  readonly media?: (id: string) => ResolvedImage | undefined;
  readonly baseUrl?: string;
  readonly video?: "embed" | "link";
  readonly linkRel?: "nofollow ugc";
  readonly onProblem?: (problem: ContentProblem) => void;
}
interface BlockTools {
  inline(runs: readonly Inline[]): ContentNode[];
}
interface BlockDef {
  readonly type: string;
  readonly schema: core.$ZodType;
  readonly render: (data: unknown, tools: BlockTools) => ContentNode;
}
interface DrawnBlock {
  readonly block: Block;
  readonly node?: ContentNode;
}
interface ContentOptions {
  readonly blocks?: readonly BlockDef[];
  readonly embeds?: readonly EmbedProvider[];
}
interface Content {
  parse(input: unknown): ContentDocument;
  blocks(input: unknown, options?: RenderOptions): DrawnBlock[];
  tree(input: unknown, options?: RenderOptions): ContentNode[];
  html(input: unknown, options?: RenderOptions): string;
  mediaIds(input: unknown): string[];
}
declare function defineBlock(input: BlockDef): BlockDef;
declare function createContent(options?: ContentOptions): Content;
export { ResolvedImage as A, ListBlock as C, ParagraphBlock as D, Mark as E, VideoBlock as M, QuoteBlock as O, Inline as S, ListItem as T, EmbedProvider as _, Block as a, ImageBlock as b, BuiltInBlock as c, ContentElement as d, ContentNode as f, DrawnBlock as g, CustomBlock as h, defineBlock as i, TableBlock as j, RenderOptions as k, CONTENT_VERSION as l, CtaBlock as m, ContentOptions as n, BlockDef as o, ContentProblem as p, createContent as r, BlockTools as s, Content as t, ContentDocument as u, GalleryBlock as v, ListBody as w, ImageRef as x, HeadingBlock as y };
```
