/**
 * BieberKit
 *
 * @file        packages/testing/src/sample.ts
 * @description Valid sample values for the fields of an entity, so that a factory makes rows that the API would accept (TST-02).
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

import { minorUnitOf } from '@bieberkit/data';
import type { ApiField } from '@bieberkit/data/schema';
import { testingError } from './errors.ts';

/** Text of exactly `size` characters that holds `seed`, so that two seeds that differ stay different when the field is short. */
function fit(seed: string, min: number, max: number): string {
  const wanted = Math.max(min, 1);
  const padded = seed.length < wanted ? seed.padEnd(wanted, 'x') : seed;
  // Cut from the front: the end of a seed is the part that changes.
  return padded.length > max ? padded.slice(padded.length - max) : padded;
}

const unit = (n: number): string => n.toString(36);

/** One decimal with `scale` digits after the point and at most `precision` digits, as the text that the API takes. */
function decimalOf(n: number, precision: number, scale: number): string {
  const whole = precision - scale;
  if (scale === 0) return String((n % 9) + 1).slice(0, Math.max(whole, 1));
  const integer = whole === 0 ? '0' : String((n % 9) + 1);
  return `${integer}.${'0'.repeat(scale - 1)}5`;
}

/**
 * A valid value for a field that a client may write, for the nth row. It answers `undefined` for a field that the row may leave out:
 * an optional one and one with a default. A relation is not made here, because a parent has to exist first (`factory` does it).
 * A `custom` field holds a schema of the project, which a sample cannot satisfy, so it needs a value from the test.
 */
export function sampleOf(entity: string, field: ApiField, n: number): unknown {
  const def = field.def;
  if (!field.writable || def.optional === true || def.default !== undefined || def.kind === 'belongsTo')
    return undefined;
  const seed = `${field.name}-${unit(n)}`;
  switch (def.kind) {
    case 'string':
      return fit(seed, def.min ?? 0, def.max ?? 255);
    case 'text':
      return fit(`Text of ${seed}`, 1, def.max ?? 500);
    case 'email':
      return `${field.name}${unit(n)}@example.test`;
    case 'oneOf':
      return def.values?.[n % (def.values.length || 1)];
    case 'int': {
      const low = def.min ?? 0;
      const high = def.max ?? 1_000_000;
      return Math.min(high, low + (n % 1000));
    }
    case 'boolean':
      return n % 2 === 0;
    case 'date':
      return `2026-01-${String((n % 28) + 1).padStart(2, '0')}`;
    case 'dateTime':
      return new Date(Date.UTC(2026, 0, 15, 10, 0, n % 3600)).toISOString();
    case 'decimal':
      return decimalOf(n, def.precision ?? 15, def.scale ?? 0);
    case 'money': {
      const currency = def.currency ?? '';
      const digits = minorUnitOf(currency);
      return {
        amount: digits === 0 ? String(100 + (n % 900)) : `${String(10 + (n % 90))}.${'5'.padEnd(digits, '0')}`,
        currency,
      };
    }
    case 'custom':
      throw testingError(
        'TEST_FACTORY_VALUE_NEEDED',
        `${entity}.${field.name} is a custom field, and a sample cannot satisfy the schema of the project.`,
        `Give a value for ${field.name} in the overrides of the factory.`,
      );
    default:
      return undefined;
  }
}
