/**
 * BieberKit
 *
 * @file        packages/content/src/urls.ts
 * @description The addresses that content may hold, for links, images and the entries of a srcset (CNT-03).
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

// An address with white space, a control character or a backslash is refused: a browser drops or rewrites them, so
// `java\tscript:` and `/\host` would not be what they look like.
// oxlint-disable-next-line no-control-regex
const UNSAFE = /[\s\u0000-\u001f\u007f-\u009f\\]/;

function parses(address: string): boolean {
  try {
    return new URL(address).hostname !== '';
  } catch {
    return false;
  }
}

/** A path of this site. `//host` is not one: it names another host. */
const isPath = (address: string): boolean => address.startsWith('/') && !address.startsWith('//');

export const isExternal = (address: string): boolean => /^https?:\/\//i.test(address);

export function isSafeLink(address: string): boolean {
  if (UNSAFE.test(address)) return false;
  if (isExternal(address)) return parses(address);
  return isPath(address) || address.startsWith('#') || /^(?:mailto|tel):./i.test(address);
}

export function isSafeImage(address: string): boolean {
  if (UNSAFE.test(address)) return false;
  if (/^https:\/\//i.test(address)) return parses(address);
  return isPath(address);
}

export interface Candidate {
  readonly url: string;
  readonly descriptor: string;
}

/**
 * The entries of a `srcset`, read as a browser reads them: an address ends at white space, so a comma inside one belongs to
 * it. `undefined` when one entry is not an allowed image with a width or a density.
 */
export function parseSrcset(value: string): Candidate[] | undefined {
  const found: Candidate[] = [];
  let rest = value;
  for (;;) {
    rest = rest.replace(/^[\s,]+/, '');
    if (rest === '') return found.length === 0 ? undefined : found;
    let url = /^\S+/.exec(rest)?.[0] ?? '';
    rest = rest.slice(url.length);
    let descriptor = '';
    if (url.endsWith(',')) url = url.replace(/,+$/, '');
    else {
      const end = rest.indexOf(',');
      descriptor = (end === -1 ? rest : rest.slice(0, end)).trim();
      rest = end === -1 ? '' : rest.slice(end);
    }
    if (!isSafeImage(url) || (descriptor !== '' && !/^\d+(?:\.\d+)?[wx]$/.test(descriptor))) return undefined;
    found.push({ url, descriptor });
  }
}
