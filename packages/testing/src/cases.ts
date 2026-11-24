/**
 * BieberKit
 *
 * @file        packages/testing/src/cases.ts
 * @description The cases that the generated contract tests run: for each field of an entity, the values that the API must refuse, and for a list, the page requests that it must refuse (TST-02, section 21).
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

import type { ApiField } from '@bieberkit/data/schema';

/** One way to break a valid body: the value to send for a field, or the field to leave out. */
export interface InvalidCase {
  readonly name: string;
  readonly field: string;
  /** The key of the field in JSON. */
  readonly key: string;
  /** What to put under the key. `omit` leaves the key out and a `value` replaces it. */
  readonly change: { readonly omit: true } | { readonly value: unknown };
}

const valued = (field: ApiField, name: string, value: unknown): InvalidCase => ({
  name: `${field.name}: ${name}`,
  field: field.name,
  key: field.key,
  change: { value },
});

/** The values that a field must refuse, from what its definition says. A field that a client may not write is a case of its own. */
export function invalidCasesOf(field: ApiField): InvalidCase[] {
  const def = field.def;
  const cases: InvalidCase[] = [];
  if (!field.writable) {
    // The server fills it, so a body that sets it is refused as a field that does not exist (the schema is strict).
    return [
      valued(field, 'refuses a value, because the server fills it', def.kind === 'state' ? (def.initial ?? 'x') : 'x'),
    ];
  }
  if (def.optional !== true && def.default === undefined) {
    cases.push({
      name: `${field.name}: refuses a body without it`,
      field: field.name,
      key: field.key,
      change: { omit: true },
    });
    cases.push(valued(field, 'refuses null', null));
  }
  switch (def.kind) {
    case 'string':
    case 'text':
      if (def.max !== undefined)
        cases.push(valued(field, `refuses ${def.max + 1} characters, over its maximum`, 'x'.repeat(def.max + 1)));
      if (def.kind === 'string' && (def.min ?? 0) > 0)
        cases.push(
          valued(field, `refuses ${(def.min ?? 1) - 1} characters, under its minimum`, 'x'.repeat((def.min ?? 1) - 1)),
        );
      cases.push(valued(field, 'refuses a number', 7));
      break;
    case 'email':
      cases.push(valued(field, 'refuses text that is not an address', 'not-an-address'));
      break;
    case 'oneOf':
      cases.push(valued(field, 'refuses a value that is not listed', '__not-listed__'));
      break;
    case 'int':
      if (def.min !== undefined) cases.push(valued(field, 'refuses a value under its minimum', def.min - 1));
      if (def.max !== undefined) cases.push(valued(field, 'refuses a value over its maximum', def.max + 1));
      cases.push(valued(field, 'refuses text', 'many'), valued(field, 'refuses a fraction', 1.5));
      break;
    case 'boolean':
      cases.push(valued(field, 'refuses text', 'true'));
      break;
    case 'date':
      cases.push(valued(field, 'refuses a day that does not exist', '2026-13-45'));
      break;
    case 'dateTime':
      cases.push(valued(field, 'refuses text that is not an instant', 'yesterday'));
      break;
    case 'decimal':
      cases.push(valued(field, 'refuses text that is not a number', 'abc'));
      break;
    case 'money':
      cases.push(
        valued(field, 'refuses a bare number', 12),
        valued(field, 'refuses an amount that is not a number', { amount: 'abc' }),
      );
      break;
    case 'belongsTo':
      cases.push(valued(field, 'refuses text that is not an id', 'not-an-id'));
      break;
    default:
      break;
  }
  return cases;
}

/** A page request that the list of every entity must refuse, with the code of the problem. */
export interface PageCase {
  readonly name: string;
  readonly query: string;
  readonly code: string;
}

export const REFUSED_PAGES: readonly PageCase[] = [
  { name: 'a page size of 0', query: 'pageSize=0', code: 'HTTP_VALIDATION_FAILED' },
  { name: 'a negative page size', query: 'pageSize=-1', code: 'HTTP_VALIDATION_FAILED' },
  { name: 'a page size that is a fraction', query: 'pageSize=1.5', code: 'HTTP_VALIDATION_FAILED' },
  { name: 'a page size that is text', query: 'pageSize=many', code: 'HTTP_VALIDATION_FAILED' },
  { name: 'an empty page size', query: 'pageSize=', code: 'HTTP_VALIDATION_FAILED' },
  { name: 'a page before the first', query: 'page=0', code: 'HTTP_VALIDATION_FAILED' },
  { name: 'a cursor that is not one', query: 'cursor=garbage', code: 'DATA_CURSOR_INVALID' },
  { name: 'a page and a cursor together', query: 'page=1&cursor=garbage', code: 'HTTP_VALIDATION_FAILED' },
  { name: 'a page deeper than 10 000 rows', query: 'page=101&pageSize=100', code: 'HTTP_PAGE_TOO_DEEP' },
];
