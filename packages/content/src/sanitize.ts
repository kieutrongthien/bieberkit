/**
 * BieberKit
 *
 * @file        packages/content/src/sanitize.ts
 * @description The allowlist that the tree of a plugin block passes before either output sees it (CNT-03).
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

import { element, relOf } from './elements.ts';
import type { ContentNode, RenderOptions } from './types.ts';
import { isSafeImage, isSafeLink, parseSrcset } from './urls.ts';
import { isRecord } from './validate.ts';

const TAGS: ReadonlySet<string> = new Set(
  (
    'a br blockquote cite code div em figcaption figure h2 h3 h4 h5 h6 hr img li ol p pre s section span strong ' +
    'table tbody td th thead tr ul'
  ).split(' '),
);

const VOID: ReadonlySet<string> = new Set(['br', 'hr', 'img']);

type Allowed = (value: string) => boolean;
const any: Allowed = () => true;

/** The attributes of each tag, besides `class`, which every tag takes. */
const ATTRIBUTES: ReadonlyMap<string, ReadonlyMap<string, Allowed>> = new Map([
  ['a', new Map([['href', isSafeLink]])],
  [
    'img',
    new Map([
      ['src', isSafeImage],
      ['alt', any],
      ['width', any],
      ['height', any],
      ['loading', any],
      ['srcset', (value: string) => parseSrcset(value) !== undefined],
      ['sizes', any],
    ]),
  ],
  [
    'th',
    new Map([
      ['colspan', any],
      ['rowspan', any],
      ['scope', any],
    ]),
  ],
  [
    'td',
    new Map([
      ['colspan', any],
      ['rowspan', any],
    ]),
  ],
]);

function attributesOf(tag: string, given: unknown, options: RenderOptions, report: (message: string) => void) {
  const kept: Record<string, string> = {};
  if (given === undefined) return kept;
  if (!isRecord(given)) {
    report(`The attributes of ${tag} are not an object.`);
    return kept;
  }
  for (const [name, value] of Object.entries(given)) {
    // The rel of a link is decided here, and `tools.inline` writes one of its own.
    if (tag === 'a' && name === 'rel') continue;
    const allowed = name === 'class' ? any : ATTRIBUTES.get(tag)?.get(name);
    if (allowed === undefined || typeof value !== 'string' || !allowed(value)) {
      report(`The attribute ${name} of ${tag} was removed.`);
      continue;
    }
    kept[name] = value;
    if (name === 'href') Object.assign(kept, relOf(value, options));
  }
  return kept;
}

/**
 * A new tree that holds only what the allowlist names. It reads each part of `node` once, because what a plugin returns
 * is only claimed to be a tree.
 */
export function sanitize(
  node: unknown,
  options: RenderOptions,
  report: (message: string) => void,
): ContentNode | undefined {
  if (typeof node === 'string') return node;
  const tag: unknown = isRecord(node) ? node['tag'] : undefined;
  if (!isRecord(node) || typeof tag !== 'string') {
    report('A node that is not text or an element was removed.');
    return undefined;
  }
  if (!TAGS.has(tag)) {
    report(`The tag ${tag} was removed.`);
    return undefined;
  }
  const attrs = attributesOf(tag, node['attrs'], options, report);
  if (tag === 'img' && attrs['src'] === undefined) return undefined;
  const given: unknown = node['children'];
  const children: ContentNode[] = [];
  if (Array.isArray(given) && !VOID.has(tag)) {
    for (const child of given as readonly unknown[]) {
      const kept = sanitize(child, options, report);
      if (kept !== undefined) children.push(kept);
    }
  } else if (given !== undefined && !Array.isArray(given)) report(`The children of ${tag} are not a list.`);
  return element(tag, VOID.has(tag) ? undefined : children, Object.keys(attrs).length === 0 ? undefined : attrs);
}
