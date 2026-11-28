/**
 * BieberKit
 *
 * @file        tools/lib/admin-size.ts
 * @description Measures the JavaScript that the admin loads before its first screen, compressed, against the budget of the spec (UI-07, section 18.1).
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

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { gzipSync } from 'node:zlib';

/** Section 18.1: the initial JavaScript of the admin, compressed, is under 400 KB. */
export const ADMIN_BUDGET_BYTES = 400_000;

/** The files that the page loads before any screen: its entry script and what it preloads, from `index.html`. Relative paths, in the order of the page. */
export function initialScripts(html: string): string[] {
  const found: string[] = [];
  for (const tag of html.match(/<(?:script|link)\b[^>]*>/g) ?? []) {
    const isScript = tag.startsWith('<script') && /\btype="module"/.test(tag);
    const isPreload = tag.startsWith('<link') && /\brel="modulepreload"/.test(tag);
    if (!isScript && !isPreload) continue;
    const path = /\b(?:src|href)="([^"]+)"/.exec(tag)?.[1]?.replace(/^\.\//, '');
    if (path !== undefined && !found.includes(path)) found.push(path);
  }
  return found;
}

export interface Measure {
  readonly files: readonly { readonly path: string; readonly gzip: number }[];
  readonly total: number;
}

/** The compressed size of the initial scripts of a built admin (`apps/admin/dist` of a project). */
export function measureAdmin(directory: string): Measure {
  const html = readFileSync(join(directory, 'index.html'), 'utf8');
  const files = initialScripts(html).map((path) => ({
    path,
    gzip: gzipSync(readFileSync(join(directory, path)), { level: 9 }).length,
  }));
  return { files, total: files.reduce((sum, file) => sum + file.gzip, 0) };
}
