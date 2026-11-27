/**
 * BieberKit
 *
 * @file        packages/content/src/html.test.ts
 * @description Tests of the HTML serializer and of the lenient reading of stored content (CNT-02, CNT-05).
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
import { createContent, defineBlock } from './index.ts';
import type { ContentProblem, RenderOptions } from './index.ts';
import { document, MEDIA_ONE, MEDIA_TWO, paragraph, resolveMedia, YOUTUBE_ID } from './testing/sample-document.ts';

const content = createContent();
const html = (block: Record<string, unknown>, options?: RenderOptions): string =>
  content.html(document(block), options);
const run = (text: string) => [{ text }];

function problemsOf(input: unknown, using = content): { html: string; paths: string[] } {
  const problems: ContentProblem[] = [];
  const output = using.html(input, { onProblem: (problem) => problems.push(problem) });
  return { html: output, paths: problems.map((problem) => problem.path) };
}

describe('CNT-05 the HTML of each block', () => {
  it('CNT-05 a paragraph, and a heading', () => {
    expect(html(paragraph('x'))).toBe('<p>x</p>');
    expect(html({ type: 'heading', level: 3, content: run('x') })).toBe('<h3>x</h3>');
  });

  it('CNT-05 marks nest in one order, whatever order they are written in', () => {
    expect(html(paragraph('x', { marks: ['code', 'strike', 'italic', 'bold'], href: '/a' }))).toBe(
      '<p><a href="/a"><strong><em><s><code>x</code></s></em></strong></a></p>',
    );
  });

  it('CNT-05 nested lists', () => {
    expect(
      html({
        type: 'list',
        ordered: false,
        items: [{ content: run('a'), list: { ordered: true, items: [{ content: run('b') }] } }],
      }),
    ).toBe('<ul><li>a<ol><li>b</li></ol></li></ul>');
  });

  it('CNT-05 a quote with and without its source', () => {
    expect(html({ type: 'quote', content: run('q'), cite: 'c' })).toBe(
      '<figure class="bk-quote"><blockquote><p>q</p></blockquote><figcaption>c</figcaption></figure>',
    );
    expect(html({ type: 'quote', content: run('q') })).toBe(
      '<figure class="bk-quote"><blockquote><p>q</p></blockquote></figure>',
    );
  });

  it('CNT-05 an image with a caption, and a gallery', () => {
    expect(html({ type: 'image', image: { alt: 'a', src: '/a.png' }, caption: 'c' })).toBe(
      '<figure class="bk-image"><img src="/a.png" alt="a" loading="lazy"><figcaption>c</figcaption></figure>',
    );
    expect(html({ type: 'gallery', images: [{ alt: '', src: '/a.png' }] })).toBe(
      '<div class="bk-gallery"><figure><img src="/a.png" alt="" loading="lazy"></figure></div>',
    );
  });

  it('CNT-05 a table with a header row', () => {
    expect(html({ type: 'table', header: true, rows: [[run('h')], [run('c')]] })).toBe(
      '<table><thead><tr><th scope="col">h</th></tr></thead><tbody><tr><td>c</td></tr></tbody></table>',
    );
  });

  it('CNT-05 a table has no empty part', () => {
    expect(html({ type: 'table', header: false, rows: [[run('c')]] })).toBe(
      '<table><tbody><tr><td>c</td></tr></tbody></table>',
    );
    expect(html({ type: 'table', header: true, rows: [[run('h')]] })).toBe(
      '<table><thead><tr><th scope="col">h</th></tr></thead></table>',
    );
  });

  it('CNT-05 a call to action with and without its text', () => {
    expect(html({ type: 'cta', text: 't', label: 'l', href: '/s' })).toBe(
      '<div class="bk-cta"><p>t</p><a href="/s">l</a></div>',
    );
    expect(html({ type: 'cta', label: 'l', href: '/s' })).toBe('<div class="bk-cta"><a href="/s">l</a></div>');
  });

  it('CNT-05 blocks are written one after the other, and an empty document is empty', () => {
    expect(content.html(document(paragraph('a'), paragraph('b')))).toBe('<p>a</p><p>b</p>');
    expect(content.html(document())).toBe('');
  });

  it('CNT-05 every text and attribute value is escaped', () => {
    expect(html({ type: 'image', image: { alt: '"><img src=x>\'&', src: '/a.png?a=1&b="2"' } })).toBe(
      '<figure class="bk-image"><img src="/a.png?a=1&amp;b=&quot;2&quot;" ' +
        'alt="&quot;&gt;&lt;img src=x&gt;&#39;&amp;" loading="lazy"></figure>',
    );
  });

  it('CNT-05 the tree and the HTML say the same', () => {
    expect(content.tree(document(paragraph('x', { marks: ['bold'] })))).toEqual([
      { tag: 'p', children: [{ tag: 'strong', children: ['x'] }] },
    ]);
  });
});

describe('CNT-05 output for mail and feeds', () => {
  const baseUrl = 'https://site.test/';

  it('CNT-05 baseUrl is put before every address that starts with a slash, and makes no link external', () => {
    expect(html(paragraph('x', { href: '/a' }), { baseUrl })).toBe('<p><a href="https://site.test/a">x</a></p>');
    expect(html({ type: 'image', image: { alt: '', media: MEDIA_ONE } }, { baseUrl, media: resolveMedia })).toContain(
      'srcset="https://site.test/media/one-400.webp 400w, https://site.test/media/one-800.webp 800w"',
    );
    expect(html({ type: 'image', image: { alt: '', media: MEDIA_ONE } }, { baseUrl, media: resolveMedia })).toContain(
      'src="https://site.test/media/one-800.webp"',
    );
  });

  it('CNT-05 baseUrl leaves other addresses alone', () => {
    expect(html(paragraph('x', { href: '#a' }), { baseUrl })).toBe('<p><a href="#a">x</a></p>');
    expect(html(paragraph('x', { href: 'mailto:a@b.test' }), { baseUrl })).toContain('href="mailto:a@b.test"');
  });

  it.each([
    [`https://youtu.be/${YOUTUBE_ID}`, `https://www.youtube.com/watch?v=${YOUTUBE_ID}`],
    ['https://player.vimeo.com/video/76979871', 'https://vimeo.com/76979871'],
  ])('CNT-05 with video link, %s is a link to its page', (url, page) => {
    expect(html({ type: 'video', url, title: 'T' }, { video: 'link' })).toBe(
      `<p class="bk-video"><a href="${page}" rel="noopener noreferrer">T</a></p>`,
    );
  });
});

const media = (id: string) => ({ type: 'image', image: { alt: 'a', media: id } });

describe('CNT-02 images', () => {
  it('CNT-02 a media record is drawn with the address, the size and the variants that media returns', () => {
    expect(html(media(MEDIA_ONE), { media: resolveMedia })).toBe(
      '<figure class="bk-image"><img src="/media/one-800.webp" alt="a" width="800" height="600" ' +
        'srcset="/media/one-400.webp 400w, /media/one-800.webp 800w" sizes="100vw" loading="lazy"></figure>',
    );
  });

  it('CNT-02 an image that does not resolve is left out, and is a problem', () => {
    expect(problemsOf(document(media(MEDIA_TWO))).html).toBe('');
    expect(problemsOf(document(media(MEDIA_TWO))).paths).toHaveLength(1);
  });

  it('CNT-02 a gallery with no image left draws nothing', () => {
    expect(html({ type: 'gallery', images: [{ alt: '', media: MEDIA_TWO }] }, { media: resolveMedia })).toBe('');
  });

  it('CNT-02 a gallery keeps the images that resolve', () => {
    const images = [
      { alt: '', media: MEDIA_TWO },
      { alt: '', media: MEDIA_ONE },
    ];
    expect(html({ type: 'gallery', images }, { media: resolveMedia }).match(/<img/g)).toHaveLength(1);
  });

  it('CNT-03 the address that media returns follows the rules of an image', () => {
    expect(html(media(MEDIA_ONE), { media: () => ({ src: 'javascript:alert(1)' }) })).toBe('');
    expect(html(media(MEDIA_ONE), { media: () => ({ src: '/a.png', srcset: 'javascript:x 1x' }) })).toBe(
      '<figure class="bk-image"><img src="/a.png" alt="a" loading="lazy"></figure>',
    );
  });
});

describe('CNT-02 reading stored content', () => {
  it('CNT-02 blocks lists each valid block with its drawing, and leaves out the others', () => {
    const missing = { type: 'image', image: { alt: '', media: MEDIA_TWO } };
    expect(content.blocks(document(paragraph('a'), { type: 'gone' }, missing))).toEqual([
      { block: paragraph('a'), node: { tag: 'p', children: ['a'] } },
      { block: missing },
    ]);
  });

  it.each([[null], ['<p>x</p>'], [{ version: 2, blocks: [] }], [{ version: 1, blocks: 'x' }]])(
    'CNT-02 %j draws nothing and does not throw',
    (input) => {
      const result = problemsOf(input);
      expect(result.html).toBe('');
      expect(result.paths).toHaveLength(1);
      expect(content.tree(input)).toEqual([]);
      expect(content.mediaIds(input)).toEqual([]);
    },
  );

  it('CNT-02 a block that is not valid is left out, and the others are drawn', () => {
    const input = document(paragraph('a'), { type: 'gone.block', data: {} }, paragraph('b'));
    expect(problemsOf(input)).toEqual({ html: '<p>a</p><p>b</p>', paths: ['blocks[1].type'] });
  });

  it('CNT-02 a block whose own code throws is left out, and the others are drawn', () => {
    const broken = defineBlock({
      type: 'x.broken',
      schema: z.object({}),
      render() {
        throw new Error('boom');
      },
    });
    const input = document({ type: 'x.broken', data: {} }, paragraph('b'));
    expect(problemsOf(input, createContent({ blocks: [broken] }))).toEqual({
      html: '<p>b</p>',
      paths: ['blocks[0]'],
    });
  });

  it('CNT-02 a media function that throws leaves its block out', () => {
    const input = document({ type: 'image', image: { alt: '', media: MEDIA_ONE } }, paragraph('b'));
    const output = content.html(input, {
      media() {
        throw new Error('boom');
      },
    });
    expect(output).toBe('<p>b</p>');
  });
});
