/**
 * BieberKit
 *
 * @file        packages/admin-core/src/transitions.ts
 * @description The moves of a state field on the screens: which ones a row may take, the fields that one asks for, and the row as it will be, for an update that shows before the server answers (UI-03, UI-13).
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

import type { MetaEntity, MetaField, MetaTransition, Row } from './types.ts';

/** The key of the state field of an entity, if it has one. */
export function stateKeyOf(entity: MetaEntity): string | undefined {
  return entity.fields.find((field) => field.kind === 'state')?.key;
}

/** The moves that the person may make on a row now: the user has the permission, and the row is in a state that the move leaves. */
export function transitionsFor(entity: MetaEntity, row: Row): readonly MetaTransition[] {
  const key = stateKeyOf(entity);
  if (key === undefined) return [];
  const current = row[key];
  return (entity.transitions ?? []).filter(
    (transition) => transition.allowed && typeof current === 'string' && transition.from.includes(current),
  );
}

/** The moves that every one of the rows may make: what a bulk bar can offer. */
export function commonTransitions(entity: MetaEntity, rows: readonly Row[]): readonly MetaTransition[] {
  const [first, ...rest] = rows;
  if (first === undefined) return [];
  return transitionsFor(entity, first).filter((transition) =>
    rest.every((row) => transitionsFor(entity, row).some((other) => other.name === transition.name)),
  );
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

function fieldOfSchema(key: string, schema: Record<string, unknown>, required: boolean): MetaField {
  const choices = Array.isArray(schema['enum'])
    ? schema['enum'].filter((value) => typeof value === 'string')
    : undefined;
  const kind = typeof schema['type'] === 'string' ? schema['type'] : 'string';
  const widget =
    choices !== undefined && choices.length > 0
      ? 'select'
      : kind === 'boolean'
        ? 'switch'
        : kind === 'integer' || kind === 'number'
          ? 'number'
          : typeof schema['maxLength'] === 'number' && schema['maxLength'] > 200
            ? 'textarea'
            : 'text';
  return {
    key,
    kind: kind === 'integer' ? 'int' : kind,
    widget,
    required,
    readOnly: false,
    filterable: false,
    sortable: false,
    ...(choices === undefined || choices.length === 0 ? {} : { values: choices }),
    validation: schema,
  };
}

/** The fields that a transition asks for, from the JSON Schema that the metadata carries, so that the same controls draw them. */
export function inputFieldsOf(schema: Readonly<Record<string, unknown>> | undefined): readonly MetaField[] {
  if (schema === undefined || !isRecord(schema['properties'])) return [];
  const required = Array.isArray(schema['required']) ? schema['required'] : [];
  return Object.entries(schema['properties']).flatMap(([key, property]) =>
    isRecord(property) ? [fieldOfSchema(key, property, required.includes(key))] : [],
  );
}

/** The rows with the changes of one row applied, for a screen that shows a move before the server has answered. The other rows are the same objects. */
export function patchRow(rows: readonly Row[], id: string, patch: Readonly<Record<string, unknown>>): Row[] {
  return rows.map((row) => (String(row['id']) === id ? { ...row, ...patch } : row));
}

/** What a move does to a row on the screen: the state, and the version that the server will have written. */
export function transitionPatch(entity: MetaEntity, transition: MetaTransition, row: Row): Record<string, unknown> {
  const key = stateKeyOf(entity);
  const version = row['version'];
  return {
    ...(key === undefined ? {} : { [key]: transition.to }),
    ...(typeof version === 'number' ? { version: version + 1 } : {}),
  };
}
