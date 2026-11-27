/**
 * BieberKit
 *
 * @file        packages/content/src/testing/sample-document.ts
 * @description A document with every built-in block and one custom block, shared by the tests of @bieberkit/content.
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
import { defineBlock } from '../index.ts';
import type { BlockDef, ResolvedImage } from '../index.ts';

export const MEDIA_ONE = '01890c5e-0000-7000-8000-000000000001';
export const MEDIA_TWO = '01890c5e-0000-7000-8000-000000000002';
export const YOUTUBE_ID = 'dQw4w9WgXcQ';

export const document = (...blocks: unknown[]): { version: 1; blocks: unknown[] } => ({ version: 1, blocks });

export const paragraph = (text: string, extra: Record<string, unknown> = {}): Record<string, unknown> => ({
  type: 'paragraph',
  content: [{ text, ...extra }],
});

const priceSchema = z.object({ plan: z.string(), amount: z.number() });

/** A block of a plugin, with a table so that the names of its attributes are exercised in React too. */
export const priceBlock: BlockDef = defineBlock({
  type: 'shop.price',
  schema: priceSchema,
  render(data, tools) {
    const { plan, amount } = z.parse(priceSchema, data);
    return {
      tag: 'section',
      attrs: { class: 'shop-price' },
      children: [
        {
          tag: 'table',
          children: [
            {
              tag: 'tbody',
              children: [
                {
                  tag: 'tr',
                  children: [
                    { tag: 'td', attrs: { colspan: '2' }, children: tools.inline([{ text: plan, marks: ['bold'] }]) },
                  ],
                },
              ],
            },
          ],
        },
        {
          tag: 'img',
          attrs: { src: '/price.png', alt: '', srcset: '/price.png 1x, /price@2x.png 2x', sizes: '100vw' },
        },
        { tag: 'br' },
        String(amount),
      ],
    };
  },
});

export const resolveMedia = (id: string): ResolvedImage | undefined =>
  id === MEDIA_ONE
    ? {
        src: '/media/one-800.webp',
        width: 800,
        height: 600,
        srcset: '/media/one-400.webp 400w, /media/one-800.webp 800w',
        sizes: '100vw',
      }
    : undefined;

export const everyBlock: readonly Record<string, unknown>[] = [
  { type: 'heading', level: 2, content: [{ text: 'Xin chào "thế giới" & \'bạn\' <3' }] },
  {
    type: 'paragraph',
    content: [
      { text: 'Plain ' },
      { text: 'marked', marks: ['code', 'italic', 'strike', 'bold'], href: 'https://example.test/a?x=1&y=2' },
    ],
  },
  {
    type: 'list',
    ordered: false,
    items: [{ content: [{ text: 'a' }], list: { ordered: true, items: [{ content: [{ text: 'b' }] }] } }],
  },
  { type: 'quote', content: [{ text: 'Said' }], cite: 'Someone' },
  { type: 'image', image: { alt: 'One', media: MEDIA_ONE }, caption: 'A caption' },
  {
    type: 'gallery',
    images: [
      { alt: 'Two', src: 'https://cdn.test/two.png' },
      { alt: '', src: '/three.png' },
    ],
  },
  { type: 'video', url: `https://youtu.be/${YOUTUBE_ID}`, title: 'A video' },
  { type: 'table', header: true, rows: [[[{ text: 'H' }]], [[{ text: 'C' }]]] },
  { type: 'cta', text: 'Ready?', label: 'Start', href: '/start' },
  { type: 'shop.price', data: { plan: 'Pro', amount: 10 } },
];
