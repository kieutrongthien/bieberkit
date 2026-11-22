/**
 * BieberKit
 *
 * @file        packages/data/src/migrations/names.ts
 * @description File names for generated migrations that never overwrite an earlier file (DATA-08).
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

import { dataError } from '../errors.ts';

const SAFE_NAME = /^[A-Za-z0-9_-]+$/;

/**
 * The name of a migration file without its extension: `Migration<timestamp>` and `_<name>` when there is one. The timestamp
 * has the resolution of a second, so a name that is already `taken` gets `_2`, `_3` and so on. MikroORM would overwrite the file.
 */
export function migrationFileName(
  timestamp: string,
  name: string | undefined,
  taken: (candidate: string) => boolean,
): string {
  if (name !== undefined && !SAFE_NAME.test(name)) {
    throw dataError(
      'DATA_MIGRATION_NAME_INVALID',
      400,
      `"${name}" is not a name for a migration.`,
      'Use letters, digits, underscores and hyphens only.',
    );
  }
  const base = `Migration${timestamp}${name === undefined ? '' : `_${name}`}`;
  let candidate = base;
  for (let n = 2; taken(candidate); n += 1) candidate = `${base}_${n}`;
  return candidate;
}
