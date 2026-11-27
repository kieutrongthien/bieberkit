/**
 * BieberKit
 *
 * @file        packages/content/src/elements.ts
 * @description The elements that more than one block draws: text with its marks and link, and the rel of a link (CNT-03).
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

import type { ContentElement, ContentNode, Inline, Mark, RenderOptions } from './types.ts';
import { isExternal } from './urls.ts';

export function element(
  tag: string,
  children?: readonly ContentNode[],
  attrs?: Readonly<Record<string, string>>,
): ContentElement {
  return { tag, ...(attrs === undefined ? {} : { attrs }), ...(children === undefined ? {} : { children }) };
}

/** A link of this site has no rel. One that leaves it gives the other page no hold on this one, and no referrer. */
export function relOf(href: string, options: RenderOptions): { rel?: string } {
  if (!isExternal(href)) return {};
  return { rel: ['noopener noreferrer', options.linkRel].filter((part) => part !== undefined).join(' ') };
}

export const anchor = (href: string, children: readonly ContentNode[], options: RenderOptions): ContentElement =>
  element('a', children, { href, ...relOf(href, options) });

/** From the inside to the outside, so that the marks of a run always nest in one order. */
const MARK_TAGS: readonly (readonly [Mark, string])[] = [
  ['code', 'code'],
  ['strike', 's'],
  ['italic', 'em'],
  ['bold', 'strong'],
];

export function inline(runs: readonly Inline[], options: RenderOptions): ContentNode[] {
  return runs.map((run) => {
    let node: ContentNode = run.text;
    for (const [mark, tag] of MARK_TAGS) if (run.marks?.includes(mark) === true) node = element(tag, [node]);
    return run.href === undefined ? node : anchor(run.href, [node], options);
  });
}
