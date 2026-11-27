/**
 * BieberKit
 *
 * @file        packages/content/src/index.ts
 * @description Public API of @bieberkit/content: the block format, its checks and the HTML serializer. It imports no framework.
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

/** npm name of this package. */
export const packageName = '@bieberkit/content';

export { createContent, defineBlock } from './content.ts';
export type { Content, ContentOptions } from './content.ts';
export { ContentError } from './errors.ts';
export type { ContentErrorCode } from './errors.ts';
export { CONTENT_VERSION } from './types.ts';
export type {
  Block,
  BlockDef,
  BlockTools,
  BuiltInBlock,
  ContentDocument,
  ContentElement,
  ContentNode,
  ContentProblem,
  CtaBlock,
  CustomBlock,
  DrawnBlock,
  EmbedProvider,
  GalleryBlock,
  HeadingBlock,
  ImageBlock,
  ImageRef,
  Inline,
  ListBlock,
  ListBody,
  ListItem,
  Mark,
  ParagraphBlock,
  QuoteBlock,
  RenderOptions,
  ResolvedImage,
  TableBlock,
  VideoBlock,
} from './types.ts';
