/**
 * BieberKit
 *
 * @file        packages/data/src/schema/extend.ts
 * @description Entity extensions: the declaration of the fields that a plugin adds to another plugin's entity, and the effective entity that the rest of the framework reads (PLG-06, ADR 0033).
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
import { defineEntity } from './define-entity.ts';
import type { EntityDef, FieldLike, Permissions } from './define-entity.ts';
import { f, Field } from './fields.ts';
import type { FieldDef, FieldKind } from './fields.ts';

/** The permissions of an extension: a field of it may ask for a permission of its own (AUTHZ-02). */
export interface ExtensionPermissions {
  readonly fields?: Readonly<Record<string, { readonly read?: string; readonly update?: string }>>;
}

export interface ExtensionOptions {
  /** The table of the extension, in snake case, at most 40 characters. It belongs to the plugin that declares it. */
  readonly table: string;
  readonly fields: Readonly<Record<string, FieldLike>>;
  readonly permissions?: ExtensionPermissions;
}

/** What a plugin gives under `extends` for the entity that it extends. */
export interface ExtensionDef {
  readonly kind: 'extension';
  readonly table: string;
  readonly fields: Readonly<Record<string, FieldDef>>;
  readonly permissions: {
    readonly fields: Readonly<Record<string, { readonly read?: string; readonly update?: string }>>;
  };
}

/** One extension as the framework finds it: the module that declared it, and the entity that it extends. */
export interface ExtensionRef {
  readonly module: string;
  /** `module.Entity` of the entity that is extended. */
  readonly target: string;
  readonly extension: ExtensionDef;
}

/** An extension after it was checked: the names of its fields and the entity that stores them. */
export interface ResolvedExtension extends ExtensionRef {
  readonly fields: readonly string[];
  /** The entity that the compiler makes a table of: the record of the target, and the fields. */
  readonly entity: EntityDef<string>;
}

export interface ResolvedEntities {
  /** The entities as the routes, the metadata, the authorizer and the types read them: the extended ones with the extension fields. */
  readonly entities: EntityDef<string>[];
  readonly extensions: ResolvedExtension[];
}

const TABLE = /^[a-z][a-z0-9_]*$/;
const TABLE_MAX = 40;
const FIELD = /^[a-z][A-Za-z0-9]*$/;
/** Names that the entity or the extension table already has. */
const RESERVED: readonly string[] = [
  'id',
  'record',
  'tenantId',
  'version',
  'createdAt',
  'updatedAt',
  'createdBy',
  'updatedBy',
  'deletedAt',
  'deletedToken',
];
/** Fields that are not stored as a plain column of the extension. */
const NOT_STORED: readonly FieldKind[] = [
  'id',
  'createdAt',
  'updatedAt',
  'belongsTo',
  'hasOne',
  'hasMany',
  'sequence',
  'state',
];

function invalid(message: string, fix: string): never {
  throw dataError('DATA_EXTENSION_INVALID', 500, message, fix);
}

/**
 * Declares the fields that a plugin adds to an entity of another plugin. The fields are stored in a table of their own, with one row
 * for each row of the entity, and never as columns of its table (PLG-06). Only plain fields are allowed: a relation, a sequence, a state
 * machine, a computed or a localized field needs the table of its own entity.
 */
export function defineExtension(options: ExtensionOptions): ExtensionDef {
  if (!TABLE.test(options.table) || options.table.length > TABLE_MAX)
    invalid(
      `"${options.table}" is not the table of an extension.`,
      `Use snake case and at most ${TABLE_MAX} characters, such as seo_page_ext.`,
    );
  const names = Object.keys(options.fields);
  if (names.length === 0) invalid(`The extension ${options.table} has no field.`, 'Declare at least one field.');
  const fields: Record<string, FieldDef> = {};
  for (const name of names) {
    const def = options.fields[name]?.def;
    if (def === undefined) continue;
    if (!FIELD.test(name) || RESERVED.includes(name))
      invalid(
        `"${name}" cannot be a field of ${options.table}.`,
        `Use a camelCase name that is not one of ${RESERVED.join(', ')}.`,
      );
    if (NOT_STORED.includes(def.kind) || def.computed !== undefined || def.localized === true)
      invalid(
        `${name} of ${options.table} is a ${def.kind} field, and an extension stores plain fields only.`,
        'Use a string, number, boolean, date, money or similar field. A relation needs an entity of its own.',
      );
    fields[name] = def;
  }
  const masks = options.permissions?.fields ?? {};
  for (const name of Object.keys(masks)) {
    if (!(name in fields))
      invalid(
        `${options.table} gives a permission to ${name}, which is not one of its fields.`,
        `Name one of ${names.join(', ')}.`,
      );
  }
  return Object.freeze({
    kind: 'extension',
    table: options.table,
    fields: Object.freeze(fields),
    permissions: Object.freeze({ fields: Object.freeze({ ...masks }) }),
  });
}

const pascal = (name: string): string => name.slice(0, 1).toUpperCase() + name.slice(1);

/** The entity that stores an extension: its own id, the record of the target, and the fields. One row for each row of the target. */
function storageOf(ref: ExtensionRef, target: EntityDef<string>): EntityDef<string> {
  const entityName = target.name.slice(target.name.indexOf('.') + 1);
  const tenantUnique = target.tenant ? ['tenantId'] : [];
  return defineEntity({
    name: `${ref.module}.${pascal(entityName)}Ext`,
    table: ref.extension.table,
    tenant: target.tenant,
    fields: {
      id: f.id(),
      record: f.belongsTo(() => target),
      ...Object.fromEntries(Object.entries(ref.extension.fields).map(([name, def]) => [name, new Field(def)])),
    },
    orm: {
      // One row for each row of the target, and the row goes with it when the target is deleted.
      uniques: [{ name: `${ref.extension.table}_record_uq`, properties: [...tenantUnique, 'record'] }],
      properties: { record: { deleteRule: 'cascade' } },
    },
  });
}

function problem(code: string, message: string, fix: string): never {
  throw dataError(code, 500, message, fix);
}

/**
 * Checks the extensions against the entities and gives the **effective** entities, which the routes, the metadata, the authorizer
 * and the types read, and the entities that store the fields, which the compiler makes tables of. Without an extension the entities come back as they are.
 */
export function resolveExtensions(
  entities: readonly EntityDef<string>[],
  refs: readonly ExtensionRef[],
): ResolvedEntities {
  if (refs.length === 0) return { entities: [...entities], extensions: [] };
  const byName = new Map(entities.map((entity) => [entity.name, entity]));
  const tables = new Set(entities.map((entity) => entity.table));
  const taken = new Map<string, Set<string>>();
  const merged = new Map<
    string,
    { fields: Record<string, FieldDef>; masks: Record<string, { read?: string; update?: string }> }
  >();
  const extensions: ResolvedExtension[] = [];
  for (const ref of refs) {
    const target = byName.get(ref.target);
    if (target === undefined)
      problem(
        'DATA_EXTENSION_TARGET_UNKNOWN',
        `The module ${ref.module} extends ${ref.target}, which no module declares.`,
        `Install the plugin that has ${ref.target} and list it in requires, or fix the name.`,
      );
    if (tables.has(ref.extension.table))
      problem(
        'DATA_EXTENSION_TABLE_CLASH',
        `The module ${ref.module} stores its extension of ${ref.target} in ${ref.extension.table}, which is a table of another entity or extension.`,
        'Give the extension a table of its own.',
      );
    tables.add(ref.extension.table);
    const names = taken.get(ref.target) ?? new Set(Object.keys(target.fields));
    for (const name of Object.keys(ref.extension.fields)) {
      if (names.has(name))
        problem(
          'DATA_EXTENSION_FIELD_CLASH',
          `The module ${ref.module} adds ${name} to ${ref.target}, which has a field of that name already.`,
          `Rename ${name} in the extension.`,
        );
      names.add(name);
    }
    taken.set(ref.target, names);
    const into = merged.get(ref.target) ?? { fields: {}, masks: {} };
    Object.assign(into.fields, ref.extension.fields);
    Object.assign(into.masks, ref.extension.permissions.fields);
    merged.set(ref.target, into);
    extensions.push({ ...ref, fields: Object.keys(ref.extension.fields), entity: storageOf(ref, target) });
  }
  const effective = entities.map((entity): EntityDef<string> => {
    const added = merged.get(entity.name);
    if (added === undefined) return entity;
    const permissions: Permissions = {
      ...entity.permissions,
      fields: { ...entity.permissions.fields, ...added.masks },
    };
    return Object.freeze({ ...entity, fields: Object.freeze({ ...entity.fields, ...added.fields }), permissions });
  });
  return { entities: effective, extensions };
}
