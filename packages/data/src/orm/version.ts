/**
 * BieberKit
 *
 * @file        packages/data/src/orm/version.ts
 * @description Optimistic concurrency: the stale version error and the If-Match check (API-13).
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
import type { DataError } from '../errors.ts';

const ETAG = /^(?:W\/)?"?(\d+)"?$/;

/** The error for a write on top of a newer version. The error of the ORM is kept as its cause, for the logs. */
export function staleVersion(cause?: unknown): DataError {
  return dataError(
    'DATA_VERSION_STALE',
    412,
    'The record was changed by someone else since it was read.',
    'Reload the record and apply the change again.',
    cause,
  );
}

/**
 * Compares the version the client saw (an `If-Match` value such as `3`, `"3"` or `W/"3"`) with the version of the row.
 * A different version is `DATA_VERSION_STALE` (412). A value that is not a version number is `DATA_VERSION_INVALID` (400).
 */
export function expectVersion(row: { readonly version?: unknown }, expected: number | string): void {
  if (typeof row.version !== 'number') {
    throw dataError(
      'DATA_ENTITY_INVALID',
      500,
      'The row has no version.',
      'Check the version of a row that was loaded from an entity with a version.',
    );
  }
  const text = typeof expected === 'number' ? String(expected) : expected.trim();
  const match = ETAG.exec(text);
  if (match === null || (typeof expected === 'number' && !Number.isInteger(expected))) {
    throw dataError(
      'DATA_VERSION_INVALID',
      400,
      'If-Match is not a version.',
      'Send the version of the record in If-Match, for example "3".',
    );
  }
  if (Number(match[1]) !== row.version) throw staleVersion();
}
