/**
 * BieberKit
 *
 * @file        packages/data/src/schema/registry.ts
 * @description The EntityRegistry types, their generator, and the Row, CreateInput and UpdateInput helpers (SCH-04, ADR 0009).
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
import { apiFields } from './shape.ts';

/**
 * Row, create and update types of every entity, by name. `bieberkit dev` and `build` generate the entries into `.bieberkit/types/`
 * (SCH-04), and each package ships its own in its `.d.ts`. Augment it through the package entry:
 * `declare module '@bieberkit/data' { interface EntityRegistry { ... } }`.
 */
// oxlint-disable-next-line typescript/no-empty-interface
export interface EntityRegistry {}

/** What the API returns for an entity. */
export type Row<N extends keyof EntityRegistry> = EntityRegistry[N] extends { row: infer R } ? R : never;
/** What a client may send to create it. */
export type CreateInput<N extends keyof EntityRegistry> = EntityRegistry[N] extends { create: infer R } ? R : never;
/** What a client may send to change it. */
export type UpdateInput<N extends keyof EntityRegistry> = EntityRegistry[N] extends { update: infer R } ? R : never;

export interface RegistryOptions {
  /** Written first, unchanged. The caller renders the project header, with the `@generated` marker (HDR-05). */
  readonly header: string;
  /** The module to augment. Defaults to `@bieberkit/data`. */
  readonly module?: string;
}

const quote = (value: string): string => `'${value.replaceAll('\\', '\\\\').replaceAll("'", "\\'")}'`;
const union = (values: readonly string[]): string => values.map(quote).join(' | ');

/** The TypeScript type of a value of this kind, in the shape of the API. `mode` decides whether money may leave out its currency. */
function typeOf(def: FieldDef, input: boolean): string {
  switch (def.kind) {
    case 'string':
    case 'text':
    case 'email':
    case 'date':
    case 'dateTime':
    case 'decimal':
    case 'sequence':
    case 'belongsTo':
      return 'string';
    case 'oneOf':
      return union(def.values ?? []);
    case 'state':
      return union(def.states ?? []);
    case 'int':
      return 'number';
    case 'boolean':
      return 'boolean';
    case 'money':
      return `{ amount: string; currency${input ? '?' : ''}: ${quote(def.currency ?? '')} }`;
    case 'custom':
      return def.tsType ?? 'unknown';
    default:
      return 'unknown';
  }
}

function block(name: string, lines: readonly string[]): string[] {
  return [`      ${name}: {`, ...lines.map((line) => `        ${line}`), '      };'];
}

function entityLines(def: EntityDef<string>): string[] {
  const row = [
    'id: string;',
    'version: number;',
    'createdAt: string;',
    'updatedAt: string;',
    'createdBy: string | null;',
    'updatedBy: string | null;',
  ];
  if (def.softDelete) row.push('deletedAt: string | null;');
  const create: string[] = [];
  const update: string[] = [];
  for (const field of apiFields(def)) {
    const optional = field.def.optional === true;
    row.push(`${field.key}: ${typeOf(field.def, false)}${optional ? ' | null' : ''};`);
    if (!field.writable) continue;
    const input = typeOf(field.def, true);
    const orNull = optional ? ' | null' : '';
    const mark = optional || field.def.default !== undefined ? '?' : '';
    create.push(`${field.key}${mark}: ${input}${orNull};`);
    update.push(`${field.key}?: ${input}${orNull};`);
  }
  return [
    `    ${quote(def.name)}: {`,
    ...block('row', row),
    ...block('create', create),
    ...block('update', update),
    '    };',
  ];
}

/** The text of a file that adds the entities to `EntityRegistry`. It is sorted by entity name, so the same entities always give the same text. */
export function generateRegistrySource(defs: readonly EntityDef<string>[], options: RegistryOptions): string {
  const sorted = defs.toSorted((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
  const body = sorted.flatMap(entityLines);
  const registry =
    body.length === 0 ? ['  interface EntityRegistry {}'] : ['  interface EntityRegistry {', ...body, '  }'];
  const header = options.header.endsWith('\n') ? options.header : `${options.header}\n`;
  return (
    header +
    [`declare module ${quote(options.module ?? '@bieberkit/data')} {`, ...registry, '}', '', 'export {};', ''].join(
      '\n',
    )
  );
}
