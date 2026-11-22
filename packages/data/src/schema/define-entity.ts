/**
 * BieberKit
 *
 * @file        packages/data/src/schema/define-entity.ts
 * @description defineEntity, the standard columns and the unique and index constraints they expand to (DATA-07, DATA-15, DATA-16, DATA-18, DATA-26).
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
import type { FieldDef } from './fields.ts';

export type Feature = 'attachments' | 'comments' | 'timeline' | 'tags';

export interface Permissions {
  readonly read?: string;
  readonly create?: string;
  readonly update?: string;
  readonly delete?: string;
  readonly fields?: Readonly<Record<string, { readonly read?: string; readonly update?: string }>>;
}

export interface ApiOptions {
  readonly list?: boolean;
  readonly get?: boolean;
  readonly create?: boolean;
  readonly update?: boolean;
  readonly delete?: boolean;
}

export interface AdminOptions {
  readonly title?: string;
  readonly list?: readonly string[];
  readonly icon?: string;
}

export interface ActionDef {
  readonly permission?: string;
  readonly handle: (...args: never[]) => unknown;
}

/** The escape hatch of ADR 0009: extra indexes and property metadata merged into the generated ORM schema. */
export interface OrmOverride {
  readonly indexes?: readonly { readonly properties: readonly string[]; readonly name?: string }[];
  readonly properties?: Readonly<Record<string, Readonly<Record<string, unknown>>>>;
}

/** Anything that carries a field definition, which is what every builder of `f` returns. */
export interface FieldLike {
  readonly def: FieldDef;
}

export interface EntityOptions<N extends string> {
  /** `module.Entity`, for example `crm.Customer`. */
  readonly name: N;
  /** Snake case, at most 40 characters. */
  readonly table: string;
  readonly tenant?: boolean;
  readonly softDelete?: boolean;
  readonly fields: Readonly<Record<string, FieldLike>>;
  readonly features?: readonly Feature[];
  readonly actions?: Readonly<Record<string, ActionDef>>;
  readonly permissions?: Permissions;
  readonly api?: ApiOptions;
  readonly admin?: AdminOptions;
  readonly label?: Readonly<Record<string, string>>;
  readonly orm?: OrmOverride;
}

/** A nameable type: the only generic parameter is the name, so an exported entity passes `isolatedDeclarations` (ADR 0009). */
export interface EntityDef<N extends string> {
  readonly name: N;
  readonly table: string;
  readonly tenant: boolean;
  readonly softDelete: boolean;
  readonly fields: Readonly<Record<string, FieldDef>>;
  readonly features: readonly Feature[];
  readonly actions: Readonly<Record<string, ActionDef>>;
  readonly permissions: Permissions;
  readonly api: ApiOptions;
  readonly admin: AdminOptions;
  readonly label: Readonly<Record<string, string>>;
  readonly orm: OrmOverride;
}

const NAME = /^[a-z][a-z0-9-]*\.[A-Z][A-Za-z0-9]*$/;
const TABLE = /^[a-z][a-z0-9_]*$/;
const FIELD = /^[a-z][A-Za-z0-9]*$/;
const TABLE_MAX = 40;
const FEATURES: readonly Feature[] = ['attachments', 'comments', 'timeline', 'tags'];
const RESERVED: readonly string[] = ['tenantId', 'version', 'createdBy', 'updatedBy', 'deletedAt', 'deletedToken'];

/** Column name of a property: `createdAt` gives `created_at`. */
export function snake(name: string): string {
  return name.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`);
}

/** The property names that a field generates next to itself. */
function generatedProperties(name: string, def: FieldDef): string[] {
  switch (def.kind) {
    case 'belongsTo':
      return [`${name}Id`];
    case 'money':
      return [`${name}Minor`, `${name}Currency`];
    case 'decimal':
      return [`${name}Scaled`];
    case 'string':
    case 'email':
      return def.compare !== undefined && def.compare !== 'exact' ? [`${name}Cmp`] : [];
    default:
      return [];
  }
}

function isPlain(value: unknown): value is Record<string, unknown> | unknown[] {
  if (Array.isArray(value)) return true;
  if (typeof value !== 'object' || value === null) return false;
  const prototype: unknown = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

/** A deep copy of plain data (objects and lists), frozen. Anything else, such as a function or a schema value, is kept as it is. */
function frozenCopy<T>(value: T): T {
  if (!isPlain(value)) return value;
  if (Array.isArray(value)) {
    // A list of plain data stays a list of the same type.
    // oxlint-disable-next-line typescript/no-unsafe-type-assertion
    return Object.freeze(value.map((item: unknown) => frozenCopy(item))) as T;
  }
  const copy: Record<string, unknown> = {};
  for (const [key, inner] of Object.entries(value)) copy[key] = frozenCopy(inner);
  // The copy has the same keys and values as `value`.
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion
  return Object.freeze(copy) as T;
}

interface Problem {
  readonly message: string;
  readonly fix: string;
}

function problemsOf(options: EntityOptions<string>, fields: Readonly<Record<string, FieldDef>>): Problem[] {
  const problems: Problem[] = [];
  const add = (message: string, fix: string): void => void problems.push({ message, fix });
  const names = Object.keys(fields);

  if (typeof options.name !== 'string' || !NAME.test(options.name))
    add(`The name "${options.name}" is not valid.`, 'Name the entity module.Entity, for example crm.Customer.');
  if (typeof options.table !== 'string' || !TABLE.test(options.table) || options.table.length > TABLE_MAX) {
    add(
      `The table "${options.table}" is not valid.`,
      `Use snake case, starting with a letter, at most ${TABLE_MAX} characters, for example crm_customers.`,
    );
  }

  const ids = names.filter((name) => fields[name]?.kind === 'id');
  if (ids.length !== 1 || ids[0] !== 'id')
    add('The entity needs exactly one field named id, made with f.id().', 'Add id: f.id() to fields.');

  const generated = new Map<string, string>();
  for (const name of names)
    for (const property of generatedProperties(name, fields[name] ?? { kind: 'id' })) generated.set(property, name);

  for (const name of names) {
    const def = fields[name];
    if (def === undefined) continue;
    if (!FIELD.test(name))
      add(`The field name "${name}" is not valid.`, 'Use camel case, starting with a lower case letter.');
    if (RESERVED.includes(name))
      add(
        `The field name ${name} is reserved.`,
        `${name} is a standard column that options add by themselves (DATA-18). Rename the field.`,
      );
    const owner = generated.get(name);
    if (owner !== undefined && owner !== name)
      add(
        `The field ${name} collides with a column that ${owner} generates.`,
        `Rename ${name} or ${owner}, so the two columns differ.`,
      );
    if (def.kind === 'createdAt' && name !== 'createdAt')
      add(`f.createdAt() must be named createdAt, not ${name}.`, 'Rename the field to createdAt.');
    if (def.kind === 'updatedAt' && name !== 'updatedAt')
      add(`f.updatedAt() must be named updatedAt, not ${name}.`, 'Rename the field to updatedAt.');
    if (name === 'createdAt' && def.kind !== 'createdAt')
      add('The field createdAt must be made with f.createdAt().', 'Use f.createdAt(), or rename the field.');
    if (name === 'updatedAt' && def.kind !== 'updatedAt')
      add('The field updatedAt must be made with f.updatedAt().', 'Use f.updatedAt(), or rename the field.');
  }

  for (const name of Object.keys(options.permissions?.fields ?? {})) {
    if (!names.includes(name))
      add(`permissions.fields names the unknown field ${name}.`, 'Use the name of a field of this entity.');
  }
  if (options.admin?.title !== undefined && !names.includes(options.admin.title))
    add(`admin.title names the unknown field ${options.admin.title}.`, 'Use the name of a field of this entity.');
  for (const name of options.admin?.list ?? [])
    if (!names.includes(name))
      add(`admin.list names the unknown field ${name}.`, 'Use the names of fields of this entity.');

  const features = options.features ?? [];
  for (const feature of features)
    if (!FEATURES.includes(feature)) add(`The feature "${feature}" does not exist.`, `Use ${FEATURES.join(', ')}.`);
  if (new Set(features).size !== features.length) add('A feature is listed twice.', 'List each feature once.');
  for (const [name, action] of Object.entries(options.actions ?? {})) {
    if (typeof action?.handle !== 'function')
      add(`The action ${name} needs a handle function.`, 'Add handle: yourFunction.');
  }
  for (const [locale, text] of Object.entries(options.label ?? {}))
    if (typeof text !== 'string') add(`The label for ${locale} must be text.`, 'Write label as { en: "Customer" }.');
  return problems;
}

/**
 * Collects an entity. Every problem is reported together, and the result is deeply frozen, so a plugin cannot change it afterwards.
 * Annotate the exported constant: `export const Customer: EntityDef<'crm.Customer'> = defineEntity({...})`.
 */
export function defineEntity<const N extends string>(options: EntityOptions<N>): EntityDef<N> {
  const fields: Record<string, FieldDef> = {};
  for (const [name, field] of Object.entries(options.fields ?? {})) fields[name] = field.def;
  const problems = problemsOf(options, fields);
  if (problems.length > 0) {
    throw dataError(
      'DATA_ENTITY_INVALID',
      500,
      `Entity ${options.name} is not valid: ${problems.map((problem) => problem.message).join(' ')}`,
      problems.map((problem) => problem.fix).join(' '),
    );
  }
  return Object.freeze({
    name: options.name,
    table: options.table,
    tenant: options.tenant === true,
    softDelete: options.softDelete === true,
    fields: Object.freeze(fields),
    features: Object.freeze([...(options.features ?? [])]),
    actions: Object.freeze(
      Object.fromEntries(
        Object.entries(options.actions ?? {}).map(([name, action]) => [name, Object.freeze({ ...action })]),
      ),
    ),
    permissions: frozenCopy(options.permissions ?? {}),
    api: frozenCopy({ ...options.api }),
    admin: frozenCopy(options.admin ?? {}),
    label: frozenCopy({ ...options.label }),
    orm: frozenCopy(options.orm ?? {}),
  });
}

export interface StandardColumn {
  readonly property: string;
  readonly column: string;
  readonly type: 'uuid' | 'integer' | 'datetime' | 'text';
  readonly nullable: boolean;
}

/** The columns that options add to every table (DATA-18), in a fixed order. */
export function standardColumns(def: EntityDef<string>): readonly StandardColumn[] {
  const column = (property: string, type: StandardColumn['type'], nullable: boolean): StandardColumn => ({
    property,
    column: snake(property),
    type,
    nullable,
  });
  return [
    column('id', 'uuid', false),
    ...(def.tenant ? [column('tenantId', 'uuid', false)] : []),
    column('version', 'integer', false),
    column('createdAt', 'datetime', false),
    column('updatedAt', 'datetime', false),
    column('createdBy', 'uuid', true),
    column('updatedBy', 'uuid', true),
    ...(def.softDelete ? [column('deletedAt', 'datetime', true), column('deletedToken', 'text', false)] : []),
  ];
}

export interface ConstraintDef {
  readonly name: string;
  readonly columns: readonly string[];
}

export interface TableConstraints {
  readonly uniques: readonly ConstraintDef[];
  readonly indexes: readonly ConstraintDef[];
}

/** FNV-1a, 32 bit, as 8 hex digits. Not for security: only to keep long names apart, with no dependency (so it also runs in a browser). */
function shortHash(text: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, '0');
}

const IDENTIFIER_MAX = 63;

function identifier(name: string): string {
  return name.length <= IDENTIFIER_MAX ? name : `${name.slice(0, IDENTIFIER_MAX - 9)}_${shortHash(name)}`;
}

/** The base column of a field, and the column a lookup uses (the shadow column for a compared text). */
function columnsOf(name: string, def: FieldDef): { base: string; lookup: string } {
  const column = snake(name);
  switch (def.kind) {
    case 'belongsTo':
      return { base: `${column}_id`, lookup: `${column}_id` };
    case 'money':
      return { base: column, lookup: `${column}_minor` };
    case 'decimal':
      return { base: column, lookup: `${column}_scaled` };
    case 'string':
    case 'email':
      return { base: column, lookup: def.compare !== undefined && def.compare !== 'exact' ? `${column}_cmp` : column };
    default:
      return { base: column, lookup: column };
  }
}

/**
 * The unique constraints and indexes that the field flags and the entity options expand to. A unique field gets `tenant_id` first
 * and `deleted_token` last (DATA-15, DATA-16), a tenant entity gets `UNIQUE (tenant_id, id)` (DATA-26), and an indexed field
 * gets `tenant_id` first. A compared text is constrained on its shadow column (DATA-21).
 */
export function tableConstraints(def: EntityDef<string>): TableConstraints {
  const uniques: ConstraintDef[] = [];
  const indexes: ConstraintDef[] = [];
  const first = def.tenant ? ['tenant_id'] : [];
  const last = def.softDelete ? ['deleted_token'] : [];
  if (def.tenant) uniques.push({ name: identifier(`${def.table}_tenant_id_id_uq`), columns: ['tenant_id', 'id'] });
  for (const [name, field] of Object.entries(def.fields)) {
    const { base, lookup } = columnsOf(name, field);
    if (field.unique === true)
      uniques.push({ name: identifier(`${def.table}_${base}_uq`), columns: [...first, lookup, ...last] });
    else if (field.index === true)
      indexes.push({ name: identifier(`${def.table}_${base}_idx`), columns: [...first, lookup] });
  }
  return { uniques, indexes };
}
