/**
 * BieberKit
 *
 * @file        packages/content/src/react.ts
 * @description The React renderer of content: the same element tree as the HTML, with overrides per block for a theme (CNT-02, SITE-14).
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

import { createElement } from 'react';
import type { ReactNode } from 'react';
import type { Content } from './content.ts';
import type { Block, ContentNode, RenderOptions } from './types.ts';

export type BlockComponent = (props: { readonly block: Block; readonly children: ReactNode }) => ReactNode;

/** By the type of a block. A component replaces the drawing of its type, and gets that drawing as `children`. */
export type BlockComponents = Readonly<Record<string, BlockComponent>>;

export interface ReactRenderOptions extends RenderOptions {
  readonly components?: BlockComponents;
}

/** The attributes whose name in React is not the one of HTML. */
const NAMES: Readonly<Record<string, string>> = {
  class: 'className',
  srcset: 'srcSet',
  colspan: 'colSpan',
  rowspan: 'rowSpan',
  referrerpolicy: 'referrerPolicy',
  allowfullscreen: 'allowFullScreen',
};

function toReact(node: ContentNode, key: number): ReactNode {
  if (typeof node === 'string') return node;
  const props: Record<string, unknown> = { key };
  // `allowfullscreen` is there or not there, and React wants a boolean for it.
  for (const [name, value] of Object.entries(node.attrs ?? {}))
    props[NAMES[name] ?? name] = name === 'allowfullscreen' ? true : value;
  return node.children === undefined || node.children.length === 0
    ? createElement(node.tag, props)
    : createElement(node.tag, props, node.children.map(toReact));
}

/** Stored content as React elements. Like `html`, it never throws on what is stored. */
export function renderContent(content: Content, input: unknown, options: ReactRenderOptions = {}): ReactNode {
  const components = new Map(Object.entries(options.components ?? {}));
  return content.blocks(input, options).map((drawn, index) => {
    const children = drawn.node === undefined ? null : toReact(drawn.node, index);
    const component = components.get(drawn.block.type);
    return component === undefined ? children : createElement(component, { key: index, block: drawn.block, children });
  });
}
