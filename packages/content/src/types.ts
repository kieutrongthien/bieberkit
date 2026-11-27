/**
 * BieberKit
 *
 * @file        packages/content/src/types.ts
 * @description The stored form of content, the element tree that it is drawn as, and the options of a render (CNT-01, CNT-02).
 * @author      Bieber Kieu <kieutrongthien@gmail.com>
 * @copyright   Copyright (c) 2026 Bieber Kieu
 * @license     Apache-2.0
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import type { core as zodCore } from 'zod/mini';

/** The version of the stored form. A change of the form needs a new number and a converter (ADR 0038). */
export const CONTENT_VERSION = 1 as const;

export type Mark = 'bold' | 'italic' | 'strike' | 'code';

/** A run of text with its marks and, at most, one link. */
export interface Inline {
  readonly text: string;
  readonly marks?: readonly Mark[];
  readonly href?: string;
}

export interface ListBody {
  readonly ordered: boolean;
  readonly items: readonly ListItem[];
}

export interface ListItem {
  readonly content: readonly Inline[];
  readonly list?: ListBody;
}

/** An image is an address or the id of a media record, never both. `alt` is empty for decoration. */
export type ImageRef =
  | { readonly alt: string; readonly src: string }
  | { readonly alt: string; readonly media: string };

export interface ParagraphBlock {
  readonly type: 'paragraph';
  readonly content: readonly Inline[];
}

export interface HeadingBlock {
  readonly type: 'heading';
  /** Level 1 is the title of the page. */
  readonly level: 2 | 3 | 4 | 5 | 6;
  readonly content: readonly Inline[];
}

export interface ListBlock extends ListBody {
  readonly type: 'list';
}

export interface QuoteBlock {
  readonly type: 'quote';
  readonly content: readonly Inline[];
  readonly cite?: string;
}

export interface ImageBlock {
  readonly type: 'image';
  readonly image: ImageRef;
  readonly caption?: string;
}

export interface GalleryBlock {
  readonly type: 'gallery';
  readonly images: readonly ImageRef[];
}

export interface VideoBlock {
  readonly type: 'video';
  readonly url: string;
  readonly title: string;
}

export interface TableBlock {
  readonly type: 'table';
  readonly header: boolean;
  readonly rows: readonly (readonly (readonly Inline[])[])[];
}

export interface CtaBlock {
  readonly type: 'cta';
  readonly label: string;
  readonly href: string;
  readonly text?: string;
}

/** A block of a plugin or a project. Its type is `<namespace>.<name>`. */
export interface CustomBlock {
  readonly type: `${string}.${string}`;
  readonly data: unknown;
}

export type BuiltInBlock =
  | ParagraphBlock
  | HeadingBlock
  | ListBlock
  | QuoteBlock
  | ImageBlock
  | GalleryBlock
  | VideoBlock
  | TableBlock
  | CtaBlock;

export type Block = BuiltInBlock | CustomBlock;

export interface ContentDocument {
  readonly version: typeof CONTENT_VERSION;
  readonly blocks: readonly Block[];
}

export interface ContentElement {
  readonly tag: string;
  readonly attrs?: Readonly<Record<string, string>>;
  readonly children?: readonly ContentNode[];
}

/** What both outputs are made from: text, or an element with the names that HTML uses. */
export type ContentNode = string | ContentElement;

export interface ContentProblem {
  /** Where the problem is, for example `blocks[2].level`. */
  readonly path: string;
  readonly message: string;
}

/** What `media` returns for the id of a media record. */
export interface ResolvedImage {
  readonly src: string;
  readonly width?: number;
  readonly height?: number;
  readonly srcset?: string;
  readonly sizes?: string;
}

export type EmbedProvider = 'youtube' | 'vimeo';

export interface RenderOptions {
  /** The image of a media record. It is not asynchronous: resolve the ids of `mediaIds` before. */
  readonly media?: (id: string) => ResolvedImage | undefined;
  /** Put before addresses that start with `/`, for mail and feeds. */
  readonly baseUrl?: string;
  /** `embed` frames a video. Mail and feeds cannot hold a frame and use `link`. Defaults to `embed`. */
  readonly video?: 'embed' | 'link';
  /** Added to external links, for text that visitors wrote. */
  readonly linkRel?: 'nofollow ugc';
  readonly onProblem?: (problem: ContentProblem) => void;
}

/** What a block of a plugin may use to draw itself. */
export interface BlockTools {
  /** Draws runs of text as the built-in blocks do. */
  inline(runs: readonly Inline[]): ContentNode[];
}

export interface BlockDef {
  readonly type: string;
  /** Checks the data of the block. A schema that must refuse unknown keys is a strict one. */
  readonly schema: zodCore.$ZodType;
  readonly render: (data: unknown, tools: BlockTools) => ContentNode;
}

/** A block of stored content that passed the checks, with its drawing. */
export interface DrawnBlock {
  readonly block: Block;
  /** Left out when there is nothing to draw, such as an image whose media record does not resolve. */
  readonly node?: ContentNode;
}
