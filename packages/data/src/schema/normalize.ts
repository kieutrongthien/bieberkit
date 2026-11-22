/**
 * BieberKit
 *
 * @file        packages/data/src/schema/normalize.ts
 * @description The NFC step that runs on every string before validation (SCH-05).
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
import { nfc } from '../text/fold.ts';

const MAX_DEPTH = 64;

function isPlain(value: object): boolean {
  const prototype: unknown = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function walk(value: unknown, depth: number, ancestors: Set<object>): unknown {
  if (typeof value === 'string') return nfc(value);
  if (typeof value !== 'object' || value === null) return value;
  const list = Array.isArray(value);
  if (!list && !isPlain(value)) return value;
  if (depth > MAX_DEPTH)
    throw dataError(
      'DATA_INPUT_INVALID',
      400,
      `The input is nested deeper than ${MAX_DEPTH} levels.`,
      'Send a flatter body.',
    );
  if (ancestors.has(value))
    throw dataError(
      'DATA_INPUT_INVALID',
      400,
      'The input refers to itself.',
      'Send a body that is a tree, with no cycles.',
    );
  ancestors.add(value);
  try {
    if (list) return value.map((item: unknown) => walk(item, depth + 1, ancestors));
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, walk(item, depth + 1, ancestors)]));
  } finally {
    ancestors.delete(value);
  }
}

/**
 * Turns every string of a plain value into Unicode NFC, in objects and lists at any depth, and returns a new value.
 * Keys are not changed, and anything that is not plain data (a Date, for example) is kept as it is. Run it before Ajv, so
 * that text typed in decomposed form has the length, the uniqueness and the slug of composed text (SCH-05).
 */
export function normalizeInput(value: unknown): unknown {
  return walk(value, 0, new Set());
}
