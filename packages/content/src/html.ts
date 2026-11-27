/**
 * BieberKit
 *
 * @file        packages/content/src/html.ts
 * @description The serializer of the element tree as HTML text, with no framework and no DOM (CNT-05).
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

import { element } from './elements.ts';
import type { ContentNode } from './types.ts';
import { parseSrcset } from './urls.ts';

const VOID: ReadonlySet<string> = new Set(['br', 'hr', 'img']);

const ENTITIES: Readonly<Record<string, string>> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
};

const escape = (text: string): string => text.replace(/[&<>"']/g, (character) => ENTITIES[character] ?? character);

function write(node: ContentNode): string {
  if (typeof node === 'string') return escape(node);
  // Tags and attribute names come from the blocks of this package or passed its allowlist, so only values are escaped.
  const attrs = Object.entries(node.attrs ?? {})
    .map(([name, value]) => ` ${name}="${escape(value)}"`)
    .join('');
  const open = `<${node.tag}${attrs}>`;
  return VOID.has(node.tag) ? open : `${open}${toHtml(node.children ?? [])}</${node.tag}>`;
}

export const toHtml = (nodes: readonly ContentNode[]): string => nodes.map(write).join('');

/** The tree with `baseUrl` before every address that starts with `/`. */
export function withBaseUrl(node: ContentNode, baseUrl: string): ContentNode {
  if (typeof node === 'string') return node;
  const base = baseUrl.replace(/\/+$/, '');
  const absolute = (address: string): string => (address.startsWith('/') ? `${base}${address}` : address);
  const attrs = node.attrs === undefined ? undefined : { ...node.attrs };
  if (attrs !== undefined) {
    for (const name of ['href', 'src']) {
      const value = attrs[name];
      if (value !== undefined) attrs[name] = absolute(value);
    }
    const srcset = attrs['srcset'] === undefined ? undefined : parseSrcset(attrs['srcset']);
    if (srcset !== undefined)
      attrs['srcset'] = srcset
        .map(({ url, descriptor }) => `${absolute(url)}${descriptor === '' ? '' : ` ${descriptor}`}`)
        .join(', ');
  }
  return element(
    node.tag,
    node.children?.map((child) => withBaseUrl(child, base)),
    attrs,
  );
}
