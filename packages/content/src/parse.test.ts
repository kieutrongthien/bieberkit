/**
 * BieberKit
 *
 * @file        packages/content/src/parse.test.ts
 * @description Tests of the stored format of content: versions, strict checks, limits and the blocks of plugins (CNT-01).
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

import * as z from 'zod/mini';
import { describe, expect, it } from 'vitest';
import { CONTENT_VERSION, ContentError, createContent, defineBlock } from './index.ts';
import { document, everyBlock, MEDIA_ONE, MEDIA_TWO, paragraph, priceBlock } from './testing/sample-document.ts';

const content = createContent({ blocks: [priceBlock] });

function failure(run: () => unknown): ContentError {
  try {
    run();
  } catch (error) {
    if (error instanceof ContentError) return error;
    throw error;
  }
  throw new Error('Expected a ContentError.');
}

const paths = (input: unknown): string[] => failure(() => content.parse(input)).problems.map((problem) => problem.path);

const text = (length: number): string => 'a'.repeat(length);
const item = { content: [{ text: 'x' }] };

/** A list nested `depth` levels deep. */
function nested(depth: number): Record<string, unknown> {
  let list: Record<string, unknown> = { ordered: false, items: [item] };
  for (let level = 1; level < depth; level += 1) list = { ordered: false, items: [{ ...item, list }] };
  return { type: 'list', ...list };
}

const table = (rows: number, cells: number): Record<string, unknown> => ({
  type: 'table',
  header: false,
  rows: Array.from({ length: rows }, () => Array.from({ length: cells }, () => [{ text: 'c' }])),
});

const gallery = (count: number): Record<string, unknown> => ({
  type: 'gallery',
  images: Array.from({ length: count }, () => ({ alt: '', src: '/x.png' })),
});

describe('CNT-01 the stored format', () => {
  it('CNT-01 the version of the format is 1', () => {
    expect(CONTENT_VERSION).toBe(1);
  });

  it('CNT-01 parse returns a document with every kind of block', () => {
    const input = document(...everyBlock);
    expect(content.parse(input)).toEqual(input);
  });

  it('CNT-01 parse reports every problem with its path', () => {
    const input = document(
      paragraph('ok'),
      { type: 'heading', level: 1, content: [{ text: 'x' }] },
      { type: 'paragraph', content: [{ text: 5 }] },
    );
    const error = failure(() => content.parse(input));
    expect(error.code).toBe('CONTENT_INVALID');
    expect(error.status).toBe(400);
    expect(error.fix).not.toBe('');
    expect(error.problems.map((problem) => problem.path)).toEqual(['blocks[1].level', 'blocks[2].content[0].text']);
  });

  it.each([[null], ['text'], [[]], [{ version: 1 }], [{ version: 1, blocks: {} }]])(
    'CNT-01 %j is CONTENT_INVALID',
    (input) => {
      expect(failure(() => content.parse(input)).code).toBe('CONTENT_INVALID');
    },
  );

  it.each([[{ blocks: [] }], [{ version: 2, blocks: [] }], [{ version: '1', blocks: [] }]])(
    'CNT-01 %j is CONTENT_VERSION',
    (input) => {
      expect(failure(() => content.parse(input)).code).toBe('CONTENT_VERSION');
    },
  );

  it.each([
    ['the document', { ...document(), extra: 1 }, 'extra'],
    ['a block', document({ ...paragraph('x'), style: 'big' }), 'blocks[0].style'],
    ['a run', document(paragraph('x', { html: '<b>' })), 'blocks[0].content[0].html'],
    ['an image', document({ type: 'image', image: { alt: '', src: '/a.png', onload: 'x' } }), 'blocks[0].image.onload'],
    ['a list item', document({ type: 'list', ordered: false, items: [{ ...item, id: 1 }] }), 'blocks[0].items[0].id'],
  ])('CNT-01 an unknown key of %s is a problem', (_where, input, path) => {
    expect(paths(input)).toEqual([path]);
  });

  it.each([['html'], ['raw'], ['constructor'], ['__proto__'], ['seo.faq']])(
    'CNT-01 a block of the unknown type %s is a problem',
    (type) => {
      expect(paths(document({ type }))).toEqual(['blocks[0].type']);
    },
  );

  it('CNT-01 an unknown mark is a problem', () => {
    expect(paths(document(paragraph('x', { marks: ['blink'] })))).toEqual(['blocks[0].content[0].marks[0]']);
  });

  it.each([[7], [0], ['2'], [2.5]])('CNT-01 the heading level %j is a problem', (level) => {
    expect(paths(document({ type: 'heading', level, content: [{ text: 'x' }] }))).toEqual(['blocks[0].level']);
  });

  it.each([
    ['both addresses', { alt: '', src: '/a.png', media: MEDIA_ONE }],
    ['no address', { alt: '' }],
    ['no alt', { src: '/a.png' }],
    ['a media id that is not a UUID', { alt: '', media: '../secret' }],
  ])('CNT-01 an image with %s is a problem', (_case, image) => {
    expect(failure(() => content.parse(document({ type: 'image', image }))).code).toBe('CONTENT_INVALID');
  });

  it.each([
    ['a video with an empty title', { type: 'video', url: 'https://vimeo.com/1', title: '' }, 'blocks[0].title'],
    ['a call to action with an empty label', { type: 'cta', label: '', href: '/a' }, 'blocks[0].label'],
  ])('CNT-01 %s is a problem, because it would have no accessible name', (_case, block, path) => {
    expect(paths(document(block))).toEqual([path]);
  });

  it.each([
    ['501 blocks', document(...Array.from({ length: 501 }, () => paragraph('x')))],
    ['an empty list', document({ type: 'list', ordered: false, items: [] })],
    ['501 list items', document({ type: 'list', ordered: false, items: Array.from({ length: 501 }, () => item) })],
    ['lists 4 deep', document(nested(4))],
    ['a run of 20001 characters', document(paragraph(text(20_001)))],
    ['a cite of 2001 characters', document({ type: 'quote', content: [{ text: 'q' }], cite: text(2001) })],
    ['an empty gallery', document(gallery(0))],
    ['a gallery of 51', document(gallery(51))],
    ['a table with no row', document(table(0, 1))],
    ['201 rows', document(table(201, 1))],
    ['a row with no cell', document(table(1, 0))],
    ['21 cells', document(table(1, 21))],
    [
      'rows of different widths',
      document({
        type: 'table',
        header: false,
        rows: [[[{ text: 'a' }]], [[{ text: 'b' }], [{ text: 'c' }]]],
      }),
    ],
  ])('CNT-01 %s is over a limit', (_case, input) => {
    expect(failure(() => content.parse(input)).code).toBe('CONTENT_INVALID');
  });

  it.each([
    ['500 blocks', document(...Array.from({ length: 500 }, () => paragraph('x')))],
    ['lists 3 deep', document(nested(3))],
    ['a run of 20000 characters', document(paragraph(text(20_000)))],
    ['a gallery of 50', document(gallery(50))],
    ['200 rows of 20 cells', document(table(200, 20))],
  ])('CNT-01 %s is inside the limits', (_case, input) => {
    expect(() => content.parse(input)).not.toThrow();
  });

  it('CNT-01 mediaIds lists each media record once, in the order of the document', () => {
    const input = document(
      { type: 'gallery', images: [{ alt: '', media: MEDIA_TWO }] },
      { type: 'image', image: { alt: '', media: MEDIA_ONE } },
      { type: 'image', image: { alt: '', media: MEDIA_TWO } },
      { type: 'image', image: { alt: '', src: '/x.png' } },
    );
    expect(content.mediaIds(input)).toEqual([MEDIA_TWO, MEDIA_ONE]);
  });
});

const define = (type: string) => defineBlock({ type, schema: z.object({}), render: () => 'x' });

describe('CNT-01 blocks of plugins', () => {
  it('CNT-01 the data of a custom block passes its schema', () => {
    expect(paths(document({ type: 'shop.price', data: { plan: 'Pro', amount: 'ten' } }))).toEqual([
      'blocks[0].data.amount',
    ]);
  });

  it('CNT-01 a custom block is unknown to content that does not register it', () => {
    const input = document({ type: 'shop.price', data: { plan: 'Pro', amount: 1 } });
    expect(failure(() => createContent().parse(input)).code).toBe('CONTENT_INVALID');
  });

  it.each([['price'], ['Shop.price'], ['shop.'], ['.price'], ['shop.price.more'], ['shop price.x']])(
    'CNT-01 the type %j is CONTENT_BLOCK_INVALID',
    (type) => {
      expect(failure(() => createContent({ blocks: [define(type)] })).code).toBe('CONTENT_BLOCK_INVALID');
    },
  );

  it('CNT-01 two definitions of one type are CONTENT_BLOCK_INVALID', () => {
    expect(failure(() => createContent({ blocks: [define('a.b'), define('a.b')] })).code).toBe('CONTENT_BLOCK_INVALID');
  });
});
