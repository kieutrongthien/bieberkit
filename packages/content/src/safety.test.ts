/**
 * BieberKit
 *
 * @file        packages/content/src/safety.test.ts
 * @description Tests of the safety rules of content: addresses, rel values, the allowlist of embeds and the tree of a plugin block (CNT-03).
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
import type { ContentNode, ContentProblem } from './index.ts';
import { document, paragraph, YOUTUBE_ID } from './testing/sample-document.ts';

const content = createContent();

const link = (href: string) => document(paragraph('go', { href }));
const image = (src: string) => document({ type: 'image', image: { alt: '', src } });
const video = (url: string) => document({ type: 'video', url, title: 'T' });
const accepts = (input: unknown): boolean => {
  try {
    content.parse(input);
    return true;
  } catch {
    return false;
  }
};

describe('CNT-03 addresses', () => {
  it.each([
    ['https://example.test/a?b=1#c'],
    ['http://example.test'],
    ['mailto:an@example.test'],
    ['tel:+84901234567'],
    ['/gioi-thieu?x=1#y'],
    ['/'],
    ['#top'],
  ])('CNT-03 the link %s is kept', (href) => {
    expect(accepts(link(href))).toBe(true);
    expect(content.html(link(href))).toContain('<a href="');
  });

  it.each([
    ['javascript:alert(1)'],
    ['JavaScript:alert(1)'],
    [' javascript:alert(1)'],
    ['java\tscript:alert(1)'],
    ['java\nscript:alert(1)'],
    ['\u0000javascript:alert(1)'],
    ['data:text/html,<script>alert(1)</script>'],
    ['vbscript:msgbox(1)'],
    ['file:///etc/passwd'],
    ['ftp://example.test'],
    ['https:example.test'],
    ['//evil.test/x'],
    ['/\\evil.test'],
    ['/\t/evil.test'],
    ['https://example.test/a b'],
    ['relative/path'],
    [''],
  ])('CNT-03 the link %j is refused when written and never drawn', (href) => {
    expect(accepts(link(href))).toBe(false);
    expect(content.html(link(href))).not.toContain('<a');
  });

  it('CNT-03 the address of a call to action follows the same rules', () => {
    expect(accepts(document({ type: 'cta', label: 'x', href: 'javascript:alert(1)' }))).toBe(false);
  });

  it.each([['https://cdn.test/a.png'], ['/media/a.png']])('CNT-03 the image %s is kept', (src) => {
    expect(accepts(image(src))).toBe(true);
  });

  it.each([
    ['http://cdn.test/a.png'],
    ['data:image/svg+xml,<svg onload=alert(1)>'],
    ['mailto:a@b.test'],
    ['//cdn.test/a.png'],
    ['#a'],
    ['a.png'],
  ])('CNT-03 the image %j is refused when written and never drawn', (src) => {
    expect(accepts(image(src))).toBe(false);
    expect(content.html(image(src))).not.toContain('<img');
  });
});

describe('CNT-03 rel values', () => {
  it('CNT-03 an external link has noopener noreferrer and no target', () => {
    const html = content.html(link('https://example.test'));
    expect(html).toBe('<p><a href="https://example.test" rel="noopener noreferrer">go</a></p>');
  });

  it('CNT-03 linkRel adds nofollow ugc for text that visitors wrote', () => {
    expect(content.html(link('http://example.test'), { linkRel: 'nofollow ugc' })).toContain(
      'rel="noopener noreferrer nofollow ugc"',
    );
  });

  it.each([['/about'], ['#top'], ['mailto:a@b.test'], ['tel:+84901234567']])(
    'CNT-03 the link %s has no rel',
    (href) => {
      expect(content.html(link(href), { linkRel: 'nofollow ugc' })).toBe(`<p><a href="${href}">go</a></p>`);
    },
  );
});

const frame = (src: string): string =>
  `<figure class="bk-video"><iframe src="${src}" title="T" loading="lazy" ` +
  'sandbox="allow-scripts allow-same-origin allow-presentation" ' +
  'referrerpolicy="strict-origin-when-cross-origin" allowfullscreen=""></iframe></figure>';

it.each([
  [`https://www.youtube.com/watch?v=${YOUTUBE_ID}`],
  [`https://youtube.com/watch?v=${YOUTUBE_ID}&t=10&autoplay=1`],
  [`https://m.youtube.com/watch?v=${YOUTUBE_ID}`],
  [`https://youtu.be/${YOUTUBE_ID}?si=abc`],
  [`https://www.youtube.com/shorts/${YOUTUBE_ID}`],
  [`https://www.youtube.com/embed/${YOUTUBE_ID}`],
  [`https://www.youtube-nocookie.com/embed/${YOUTUBE_ID}`],
])('CNT-03 %s is framed from its id alone, without cookies', (url) => {
  expect(accepts(video(url))).toBe(true);
  expect(content.html(video(url))).toBe(frame(`https://www.youtube-nocookie.com/embed/${YOUTUBE_ID}`));
});

describe('CNT-03 embeds', () => {
  it.each([['https://vimeo.com/76979871'], ['https://player.vimeo.com/video/76979871?autoplay=1']])(
    'CNT-03 %s is framed from its id alone, with do not track',
    (url) => {
      expect(content.html(video(url))).toBe(frame('https://player.vimeo.com/video/76979871?dnt=1'));
    },
  );

  it.each([
    [`https://evil.test/watch?v=${YOUTUBE_ID}`],
    [`https://youtube.com.evil.test/watch?v=${YOUTUBE_ID}`],
    [`https://notyoutube.com/watch?v=${YOUTUBE_ID}`],
    [`https://youtube.com@evil.test/watch?v=${YOUTUBE_ID}`],
    [`http://www.youtube.com/watch?v=${YOUTUBE_ID}`],
    ['https://www.youtube.com/watch?v=short'],
    ['https://youtu.be/dQw4w9WgXc%22'],
    ['https://vimeo.com/abc'],
    ['javascript:alert(1)'],
  ])('CNT-03 %s is not an allowed video', (url) => {
    expect(accepts(video(url))).toBe(false);
    expect(content.html(video(url))).toBe('');
  });

  it('CNT-03 embeds narrows the providers, when written and when drawn', () => {
    const narrow = createContent({ embeds: ['vimeo'] });
    const input = video(`https://youtu.be/${YOUTUBE_ID}`);
    expect(() => narrow.parse(input)).toThrow(/YouTube|youtube/);
    expect(narrow.html(input)).toBe('');
    expect(() => narrow.parse(video('https://vimeo.com/76979871'))).not.toThrow();
  });

  it('CNT-03 an empty list of providers allows no video', () => {
    expect(createContent({ embeds: [] }).html(video('https://vimeo.com/76979871'))).toBe('');
  });
});

describe('CNT-03 raw HTML', () => {
  it('CNT-03 there is no raw HTML block', () => {
    expect(accepts(document({ type: 'html', html: '<b>x</b>' }))).toBe(false);
  });

  it('CNT-03 text that looks like HTML stays text', () => {
    expect(content.html(document(paragraph('<script>alert(1)</script>')))).toBe(
      '<p>&lt;script&gt;alert(1)&lt;/script&gt;</p>',
    );
  });
});

/** Content whose one custom block returns `node`, whatever its types say. */
function drawn(node: unknown): { html: string; problems: ContentProblem[] } {
  const block = defineBlock({
    type: 'x.any',
    schema: z.object({}),
    // A plugin written in JavaScript, or one with a bug, may return anything.
    // oxlint-disable-next-line typescript/no-unsafe-type-assertion
    render: () => node as ContentNode,
  });
  const problems: ContentProblem[] = [];
  const html = createContent({ blocks: [block] }).html(document({ type: 'x.any', data: {} }), {
    onProblem: (problem) => problems.push(problem),
  });
  return { html, problems };
}

describe('CNT-03 the tree of a plugin block', () => {
  it.each([
    ['script'],
    ['style'],
    ['iframe'],
    ['object'],
    ['embed'],
    ['form'],
    ['input'],
    ['svg'],
    ['base'],
    ['meta'],
    ['link'],
    ['SCRIPT'],
    ['img src=x onerror=alert(1)'],
  ])('CNT-03 the tag %s is removed with its children', (tag) => {
    const result = drawn({ tag: 'div', children: ['a', { tag, children: ['inside'] }, 'b'] });
    expect(result.html).toBe('<div>ab</div>');
    expect(result.problems).toHaveLength(1);
  });

  it.each([['onclick'], ['onError'], ['style'], ['id'], ['target'], ['srcdoc'], ['formaction'], ['x"><script>']])(
    'CNT-03 the attribute %s is removed',
    (name) => {
      const result = drawn({ tag: 'div', attrs: { class: 'k', [name]: 'v' }, children: ['t'] });
      expect(result.html).toBe('<div class="k">t</div>');
      expect(result.problems).toHaveLength(1);
    },
  );

  it('CNT-03 an attribute is kept only on its own tags', () => {
    expect(drawn({ tag: 'div', attrs: { href: '/a', src: '/b' }, children: [] }).html).toBe('<div></div>');
  });

  it('CNT-03 a refused link address is removed, and the text stays', () => {
    expect(drawn({ tag: 'a', attrs: { href: 'javascript:alert(1)' }, children: ['t'] }).html).toBe('<a>t</a>');
  });

  it('CNT-03 the rel of a link is the one of the rules, whatever the block says', () => {
    expect(drawn({ tag: 'a', attrs: { href: 'https://a.test', rel: 'opener' }, children: ['t'] }).html).toBe(
      '<a href="https://a.test" rel="noopener noreferrer">t</a>',
    );
  });

  it('CNT-03 an image with a refused address is removed', () => {
    expect(drawn({ tag: 'div', children: [{ tag: 'img', attrs: { src: 'javascript:x', alt: '' } }] }).html).toBe(
      '<div></div>',
    );
  });

  it('CNT-03 a srcset with one refused entry is removed whole', () => {
    const result = drawn({ tag: 'img', attrs: { src: '/a.png', alt: '', srcset: '/a.png 1x, javascript:x 2x' } });
    expect(result.html).toBe('<img src="/a.png" alt="">');
  });

  it.each([
    ['attributes that are not an object', { tag: 'p', attrs: 'onclick=x', children: ['t'] }],
    ['children that are not a list', { tag: 'div', children: [{ tag: 'p', children: '<script>' }] }],
  ])('CNT-03 %s are removed, and are a problem', (_case, node) => {
    const result = drawn(node);
    expect(result.html).not.toMatch(/onclick|script/);
    expect(result.problems).toHaveLength(1);
  });

  it.each([[null], [5], [{}], [{ tag: 5 }]])('CNT-03 a child that is not a node, %j, is removed', (child) => {
    expect(drawn({ tag: 'p', children: ['t', child] }).html).toBe('<p>t</p>');
  });

  it('CNT-03 an attribute value that is not text is removed', () => {
    expect(drawn({ tag: 'p', attrs: { class: ['a'] }, children: [] }).html).toBe('<p></p>');
  });
});
