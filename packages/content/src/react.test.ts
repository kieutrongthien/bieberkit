/**
 * BieberKit
 *
 * @file        packages/content/src/react.test.ts
 * @description Tests of the React renderer: the same output as the HTML serializer, overrides of a block, and no React in the main entry (CNT-02).
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

import { createElement, Fragment } from 'react';
import type { ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createContent } from './index.ts';
import { renderContent } from './react.ts';
import { document, everyBlock, MEDIA_TWO, paragraph, priceBlock, resolveMedia } from './testing/sample-document.ts';

const content = createContent({ blocks: [priceBlock] });
const options = { media: resolveMedia };

const markup = (node: ReactNode): string => renderToStaticMarkup(createElement(Fragment, null, node));

/** The hint that React 19 adds on the server for an image that is not lazy. It loads early what is drawn, and draws nothing. */
const PRELOAD = /<link rel="preload" as="image"[^>]*>/g;

const ENTITIES: Readonly<Record<string, string>> = {
  '&amp;': '&',
  '&lt;': '<',
  '&gt;': '>',
  '&quot;': '"',
  '&#39;': "'",
  '&#x27;': "'",
};
const decode = (text: string): string =>
  text.replace(/&(?:amp|lt|gt|quot|#39|#x27);/g, (entity) => ENTITIES[entity] ?? '');

/** HTML reduced to elements, attributes and text, so that two writers of the same page compare equal. */
function reduced(html: string): string[] {
  return (html.replace(PRELOAD, '').match(/<[^>]*>|[^<]+/g) ?? []).map((token) => {
    if (!token.startsWith('<')) return decode(token);
    if (token.startsWith('</')) return token.toLowerCase();
    const name = /^<([a-z0-9]+)/i.exec(token)?.[1]?.toLowerCase() ?? '';
    const attributes = [...token.slice(name.length + 1).matchAll(/([^\s=/>]+)="([^"]*)"/g)]
      .map(([, key = '', value = '']) => `${key.toLowerCase()}=${decode(value)}`)
      .toSorted();
    return `<${name} ${attributes.join(' ')}>`;
  });
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('CNT-02 React draws what the HTML serializer writes', () => {
  it.each(everyBlock.map((block) => [String(block['type']), block] as const))(
    'CNT-02 the %s block is the same in both',
    (_type, block) => {
      const errors = vi.spyOn(console, 'error');
      const react = markup(renderContent(content, document(block), options));
      expect(reduced(react)).toEqual(reduced(content.html(document(block), options)));
      expect(react).not.toBe('');
      // React says here that a name such as `class` or a list without keys is wrong.
      expect(errors).not.toHaveBeenCalled();
    },
  );

  it('CNT-02 a whole document is the same in both, with the options of a render', () => {
    const settings = { ...options, baseUrl: 'https://site.test', video: 'link', linkRel: 'nofollow ugc' } as const;
    const input = document(...everyBlock);
    expect(reduced(markup(renderContent(content, input, settings)))).toEqual(reduced(content.html(input, settings)));
  });

  it('CNT-02 React adds a preload hint for an image that is not lazy, and the HTML has none', () => {
    const input = document({ type: 'shop.price', data: { plan: 'Pro', amount: 1 } });
    expect(markup(renderContent(content, input)).match(PRELOAD)).toHaveLength(1);
    expect(content.html(input)).not.toContain('<link');
    const lazy = document({ type: 'image', image: { alt: '', src: '/a.png' } });
    expect(markup(renderContent(content, lazy))).not.toContain('<link');
  });

  it('CNT-03 an address that is refused is not in the React output', () => {
    const input = document(paragraph('x', { href: 'javascript:alert(1)' }), paragraph('ok'));
    expect(markup(renderContent(content, input))).toBe('<p>ok</p>');
  });
});

describe('SITE-14 a theme draws a block its own way', () => {
  it('SITE-14 a component gets the checked block and the default drawing', () => {
    const output = markup(
      renderContent(content, document(paragraph('a'), { type: 'cta', label: 'Go', href: '/go' }), {
        components: {
          cta: ({ block, children }) => createElement('aside', { 'data-type': block.type }, children),
        },
      }),
    );
    expect(output).toBe('<p>a</p><aside data-type="cta"><div class="bk-cta"><a href="/go">Go</a></div></aside>');
  });

  it('SITE-14 a component replaces the drawing of a plugin block', () => {
    const output = markup(
      renderContent(content, document({ type: 'shop.price', data: { plan: 'Pro', amount: 3 } }), {
        components: { 'shop.price': () => createElement('b', null, 'own') },
      }),
    );
    expect(output).toBe('<b>own</b>');
  });

  it('SITE-14 a valid block with nothing to draw reaches its component, which may draw it itself', () => {
    const input = document({ type: 'image', image: { alt: 'a', media: MEDIA_TWO } });
    expect(markup(renderContent(content, input))).toBe('');
    const output = renderContent(content, input, {
      components: { image: ({ children }) => createElement('p', null, children === null ? 'no image' : 'image') },
    });
    expect(markup(output)).toBe('<p>no image</p>');
  });

  it('SITE-14 a block that is not valid reaches no component', () => {
    const component = vi.fn<() => string>(() => 'drawn');
    const input = document({ type: 'cta', label: 'Go', href: 'javascript:alert(1)' });
    expect(markup(renderContent(content, input, { components: { cta: component } }))).toBe('');
    expect(component).not.toHaveBeenCalled();
  });
});

describe('CNT-05 no framework', () => {
  it('CNT-05 the main entry imports no React, itself or through another module', async () => {
    vi.resetModules();
    vi.doMock('react', () => {
      throw new Error('react was imported');
    });
    try {
      await expect(import('./index.ts')).resolves.toHaveProperty('createContent');
    } finally {
      vi.doUnmock('react');
      vi.resetModules();
    }
  });
});
