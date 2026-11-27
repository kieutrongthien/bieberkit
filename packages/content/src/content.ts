/**
 * BieberKit
 *
 * @file        packages/content/src/content.ts
 * @description The content of a project: its blocks and providers, the strict check of a write and the lenient reading of what is stored (CNT-01, CNT-02).
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

import { drawBuiltIn, drawCustom } from './draw.ts';
import { ContentError } from './errors.ts';
import { toHtml, withBaseUrl } from './html.ts';
import { CONTENT_VERSION } from './types.ts';
import type {
  Block,
  BlockDef,
  BuiltInBlock,
  ContentDocument,
  ContentNode,
  ContentProblem,
  CustomBlock,
  DrawnBlock,
  EmbedProvider,
  ImageRef,
  RenderOptions,
} from './types.ts';
import { blockProblems, isRecord, MAX_BLOCKS } from './validate.ts';
import type { Rules } from './validate.ts';

export interface ContentOptions {
  /** The blocks of plugins and of the project. */
  readonly blocks?: readonly BlockDef[];
  /** The video providers that are allowed. It narrows the list, which is all of them by default. */
  readonly embeds?: readonly EmbedProvider[];
}

export interface Content {
  /** The document, or a `ContentError` with every problem. For a write. */
  parse(input: unknown): ContentDocument;
  /** The blocks of stored content that pass the checks, each with its drawing. It never throws. */
  blocks(input: unknown, options?: RenderOptions): DrawnBlock[];
  tree(input: unknown, options?: RenderOptions): ContentNode[];
  html(input: unknown, options?: RenderOptions): string;
  /** The ids of the media records that the content shows, each once, in the order of the document. */
  mediaIds(input: unknown): string[];
}

const BLOCK_TYPE = /^[a-z][a-z0-9-]*\.[a-z][a-z0-9-]*$/;

function definitions(blocks: readonly BlockDef[]): ReadonlyMap<string, BlockDef> {
  const found = new Map<string, BlockDef>();
  const problems: ContentProblem[] = [];
  for (const block of blocks) {
    if (!BLOCK_TYPE.test(block.type))
      problems.push({ path: block.type, message: 'The type of a block is <namespace>.<name> in lower case.' });
    else if (found.has(block.type)) problems.push({ path: block.type, message: 'This block is declared twice.' });
    else found.set(block.type, block);
  }
  if (problems.length > 0) throw new ContentError('CONTENT_BLOCK_INVALID', problems);
  return found;
}

/** Declares a block of a plugin or of a project. `createContent` checks the declaration. */
export function defineBlock(input: BlockDef): BlockDef {
  return Object.freeze({ type: input.type, schema: input.schema, render: input.render });
}

type Envelope =
  | { readonly blocks: readonly unknown[] }
  | { readonly code: 'CONTENT_INVALID' | 'CONTENT_VERSION'; readonly problem: ContentProblem };

const invalid = (path: string, message: string): Envelope => ({
  code: 'CONTENT_INVALID',
  problem: { path, message },
});

/** The version and the list of blocks of a document, before the blocks are checked. */
function envelope(input: unknown): Envelope {
  if (!isRecord(input)) return invalid('', 'The content must be an object with version and blocks.');
  if (input['version'] !== CONTENT_VERSION)
    return { code: 'CONTENT_VERSION', problem: { path: 'version', message: 'The version of the content must be 1.' } };
  const blocks: unknown = input['blocks'];
  return Array.isArray(blocks) ? { blocks } : invalid('blocks', 'This must be a list.');
}

function isCustom(block: Block): block is CustomBlock {
  return block.type.includes('.');
}

function imagesOf(block: Block): readonly ImageRef[] {
  if (isCustom(block)) return [];
  if (block.type === 'image') return [block.image];
  return block.type === 'gallery' ? block.images : [];
}

export function createContent(options: ContentOptions = {}): Content {
  const rules: Rules = {
    blocks: definitions(options.blocks ?? []),
    embeds: new Set(options.embeds ?? ['youtube', 'vimeo']),
  };

  function parse(input: unknown): ContentDocument {
    const found = envelope(input);
    if (!('blocks' in found)) throw new ContentError(found.code, [found.problem]);
    const problems: ContentProblem[] = Object.keys(isRecord(input) ? input : {})
      .filter((key) => key !== 'version' && key !== 'blocks')
      .map((key) => ({ path: key, message: 'This key is not part of the format.' }));
    if (found.blocks.length > MAX_BLOCKS)
      problems.push({ path: 'blocks', message: `A document holds at most ${MAX_BLOCKS} blocks.` });
    else found.blocks.forEach((block, index) => problems.push(...blockProblems(block, `blocks[${index}]`, rules)));
    if (problems.length > 0) throw new ContentError('CONTENT_INVALID', problems);
    // Every part of it was just checked.
    // oxlint-disable-next-line typescript/no-unsafe-type-assertion
    return input as ContentDocument;
  }

  /** The blocks that pass the checks, each with its place. The others are told to `report`. */
  function valid(input: unknown, report: (problem: ContentProblem) => void): { block: Block; path: string }[] {
    const found = envelope(input);
    if (!('blocks' in found)) {
      report(found.problem);
      return [];
    }
    return found.blocks.flatMap((value, index) => {
      const path = `blocks[${index}]`;
      try {
        const problems = blockProblems(value, path, rules);
        for (const problem of problems) report(problem);
        // A block with no problem has the form of its type.
        // oxlint-disable-next-line typescript/no-unsafe-type-assertion
        return problems.length === 0 ? [{ block: value as Block, path }] : [];
      } catch (error) {
        // A schema of a plugin may throw. One block must not take the page with it.
        report({ path, message: error instanceof Error ? error.message : 'The check of this block failed.' });
        return [];
      }
    });
  }

  function blocks(input: unknown, render: RenderOptions = {}): DrawnBlock[] {
    const report = (path: string, message: string): void => render.onProblem?.({ path, message });
    return valid(input, (problem) => render.onProblem?.(problem)).flatMap(({ block, path }) => {
      const drawing = { options: render, path, report };
      try {
        const definition = isCustom(block) ? rules.blocks.get(block.type) : undefined;
        const raw =
          isCustom(block) && definition !== undefined
            ? drawCustom(definition, block.data, drawing)
            : // A block that is not custom is one of the built-in ones.
              // oxlint-disable-next-line typescript/no-unsafe-type-assertion
              drawBuiltIn(block as BuiltInBlock, drawing);
        if (raw === undefined) return [{ block }];
        return [{ block, node: render.baseUrl === undefined ? raw : withBaseUrl(raw, render.baseUrl) }];
      } catch (error) {
        report(path, error instanceof Error ? error.message : 'The drawing of this block failed.');
        return [];
      }
    });
  }

  const tree = (input: unknown, render?: RenderOptions): ContentNode[] =>
    blocks(input, render).flatMap((drawn) => (drawn.node === undefined ? [] : [drawn.node]));

  return Object.freeze({
    parse,
    blocks,
    tree,
    html: (input: unknown, render?: RenderOptions): string => toHtml(tree(input, render)),
    mediaIds: (input: unknown): string[] => [
      ...new Set(
        valid(input, () => {}).flatMap(({ block }) =>
          imagesOf(block).flatMap((image) => ('media' in image ? [image.media] : [])),
        ),
      ),
    ],
  });
}
