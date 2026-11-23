/**
 * BieberKit
 *
 * @file        packages/data/src/schema/pii.ts
 * @description The inventory of personal data and the redaction of its values: the part of the privacy work that the field flag makes possible (PDP-01, PDP-06, SEC-09).
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

import type { EntityDef } from './define-entity.ts';
import { apiFields } from './shape.ts';

/** A field that holds personal data, for the data inventory of PDP-01. */
export interface PiiField {
  /** The name of the entity, such as `crm.Customer`. */
  readonly entity: string;
  readonly field: string;
  /** The key of the field in the API, which is not the name for a relation (`ownerId`). */
  readonly key: string;
  readonly encrypted: boolean;
}

const REDACTED = '[redacted]';

/** Every `pii` field of the entities, sorted by entity and then in the order of the declaration. */
export function piiFields(entities: readonly EntityDef<string>[]): PiiField[] {
  const out: PiiField[] = [];
  for (const entity of [...entities].toSorted((a, b) => a.name.localeCompare(b.name))) {
    for (const field of apiFields(entity)) {
      if (field.def.pii === true)
        out.push({ entity: entity.name, field: field.name, key: field.key, encrypted: field.def.encrypted === true });
    }
  }
  return out;
}

const isPlain = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && Object.getPrototypeOf(value) === Object.prototype;

/**
 * A copy of `data` in which the value of every `pii` field of the entity, by its name and by its key of the API, is `[redacted]`, at
 * any depth. An empty value stays empty, so a field that was not set is not a field that was hidden. Audit and outbox data go through
 * it, so personal data never rests there in clear text (PDP-06).
 */
export function redactPii(entity: EntityDef<string>, data: unknown): unknown {
  const names = new Set<string>();
  for (const field of apiFields(entity)) {
    if (field.def.pii === true) {
      names.add(field.name);
      names.add(field.key);
    }
  }
  const walk = (value: unknown): unknown => {
    if (Array.isArray(value)) return value.map(walk);
    if (!isPlain(value)) return value;
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [
        key,
        names.has(key) && item !== null && item !== undefined ? REDACTED : walk(item),
      ]),
    );
  };
  return walk(data);
}
