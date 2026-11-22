/**
 * BieberKit
 *
 * @file        packages/data/src/schema/shape.ts
 * @description Which fields of an entity the API shows, writes and reads, and under which key (spec 10.2, ADR 0009).
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
import type { FieldDef } from './fields.ts';

export type SchemaMode = 'create' | 'update' | 'read';

export interface ApiField {
  /** The key in JSON: the field name, or `<name>Id` for a relation. */
  readonly key: string;
  readonly name: string;
  readonly def: FieldDef;
  /** A client may send it. False for what the server writes: sequence, state and computed fields. */
  readonly writable: boolean;
}

/**
 * The declared fields that appear in the API, in declaration order. `id`, `createdAt` and `updatedAt` are standard columns and
 * come from the standard part of the schema. `hasOne` and `hasMany` join in the HTTP milestone, which knows the target schema.
 */
export function apiFields(entity: EntityDef<string>): readonly ApiField[] {
  const found: ApiField[] = [];
  for (const [name, def] of Object.entries(entity.fields)) {
    if (['id', 'createdAt', 'updatedAt', 'hasOne', 'hasMany'].includes(def.kind)) continue;
    const readOnly = def.kind === 'sequence' || def.kind === 'state' || def.computed !== undefined;
    found.push({ key: def.kind === 'belongsTo' ? `${name}Id` : name, name, def, writable: !readOnly });
  }
  return found;
}

export function assertMode(mode: string): asserts mode is SchemaMode {
  if (mode !== 'create' && mode !== 'update' && mode !== 'read') {
    throw new TypeError(`"${mode}" is not a schema mode. Use create, update or read.`);
  }
}
