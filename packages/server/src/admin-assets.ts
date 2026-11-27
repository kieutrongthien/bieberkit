/**
 * BieberKit
 *
 * @file        packages/server/src/admin-assets.ts
 * @description Keeps the hashed files of the releases of the admin that went before for 24 hours, so that a tab that is open when a rolling deploy happens can still load its chunks (UI-22).
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

import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  statSync,
  unlinkSync,
  utimesSync,
  writeFileSync,
} from 'node:fs';
import { join } from 'node:path';

/** How long the files of a release that was replaced stay (UI-22). */
export const RETAIN_MS: number = 24 * 3_600_000;

/** The list of the files of the release that last started, so that the next one knows which of them it replaced. */
const CURRENT = 'current.json';

export interface Retained {
  /** The files of the release before that this release does not use, and that are kept from now for a day. */
  readonly superseded: readonly string[];
  /** The files that were removed because their day was over. */
  readonly removed: readonly string[];
  /** Why the folder could not be kept, when it could not. The release is served from its own build then. */
  readonly error?: string;
}

function listing(folder: string): string[] {
  try {
    return readdirSync(folder).filter((name) => statSync(join(folder, name)).isFile());
  } catch {
    return [];
  }
}

function previousRelease(retained: string): string[] {
  try {
    const found: unknown = JSON.parse(readFileSync(join(retained, CURRENT), 'utf8'));
    return Array.isArray(found) ? found.filter((name): name is string => typeof name === 'string') : [];
  } catch {
    return [];
  }
}

/**
 * Keeps what the release before needs. At start, the hashed files of `source` (`assets/` of the build) are copied into `retained` when
 * they are not there, the files that the release before used and this one does not are marked as replaced now, and a file that is
 * not of this release and has been replaced for more than a day is removed. The page is never kept: it is the release.
 *
 * The state is the folder and the `current.json` in it, so several instances that share the folder do the same work, and a restart
 * changes nothing. A folder that cannot be used is reported and the server goes on, since its own build is served first.
 */
export function retainAssets(options: {
  readonly source: string;
  readonly retained: string;
  readonly now: number;
}): Retained {
  const { source, retained, now } = options;
  const target = join(retained, 'assets');
  try {
    mkdirSync(target, { recursive: true });
    const current = listing(join(source, 'assets'));
    const mine = new Set(current);
    for (const name of current) {
      if (!existsSync(join(target, name))) copyFileSync(join(source, 'assets', name), join(target, name));
    }
    const superseded = previousRelease(retained).filter((name) => !mine.has(name) && existsSync(join(target, name)));
    const at = new Date(now);
    for (const name of superseded) utimesSync(join(target, name), at, at);
    const removed: string[] = [];
    for (const name of listing(target)) {
      if (mine.has(name)) continue;
      if (now - statSync(join(target, name)).mtimeMs > RETAIN_MS) {
        unlinkSync(join(target, name));
        removed.push(name);
      }
    }
    writeFileSync(join(retained, CURRENT), JSON.stringify(current));
    return { superseded, removed };
  } catch (error) {
    return { superseded: [], removed: [], error: error instanceof Error ? error.message : String(error) };
  }
}
