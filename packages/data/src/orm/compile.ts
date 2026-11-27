/**
 * BieberKit
 *
 * @file        packages/data/src/orm/compile.ts
 * @description The compiler from EntityDef to MikroORM schemas: columns, constraints, relations, filters and the standard values (DATA-15, DATA-16, DATA-18, DATA-20, DATA-26, CFG-11).
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

import { BigIntType, DateTimeType, EntitySchema } from '@mikro-orm/core';
import { requestContext } from '@bieberkit/core';
import { dataError } from '../errors.ts';
import { uuid7 } from '../keys/uuid7.ts';
import { defineEntity, snake, standardColumns, tableConstraints } from '../schema/define-entity.ts';
import type { EntityDef } from '../schema/define-entity.ts';
import type { ResolvedExtension } from '../schema/extend.ts';
import { Field, f } from '../schema/fields.ts';
import type { FieldDef } from '../schema/fields.ts';
import { fold } from '../text/fold.ts';
import type { Compare } from '../text/fold.ts';
import { encryptedType } from './encrypted-type.ts';
import { isSystemScope, requireTenant } from './tenant.ts';
import { Uuid7Type } from './uuid7-type.ts';

/** The schema of one row. Its properties are read by name, because the entity classes are generated. */
export type OrmSchema = EntitySchema<Record<string, unknown>>;

export interface CompileOptions {
  /** `shared-schema` (the default) gives tenant entities a `tenant_id`. `single` leaves it out (CFG-11). */
  readonly tenancy?: 'single' | 'shared-schema';
  /** Hand written schemas, added unchanged after the generated ones (ADR 0009, decision 8). */
  readonly raw?: readonly OrmSchema[];
  /**
   * The extensions that `resolveExtensions` checked. `defs` are then its effective entities, and the compiler makes the table of
   * each extension and leaves the extension fields out of the table of the target (PLG-06, ADR 0033).
   */
  readonly extensions?: readonly ResolvedExtension[];
}

type Property = Record<string, unknown>;

const DEFINITIONS = new WeakMap<object, EntityDef<string>>();
const TRANSLATIONS = new WeakMap<object, OrmSchema>();
const EXTENSIONS = new WeakMap<object, StoredExtension[]>();

/** An extension of a schema: the schema that stores it and the names of its fields, which are not columns of the extended table. */
export interface StoredExtension {
  readonly schema: OrmSchema;
  readonly fields: readonly string[];
}

/** The extensions of an entity, in the order of the plugins. Empty when nothing extends it. */
export function extensionsOfSchema(schema: object): readonly StoredExtension[] {
  return EXTENSIONS.get(schema) ?? [];
}

/** The schema that holds the translations of `schema`, if it has localized fields. */
export function translationSchemaOf(schema: object): OrmSchema | undefined {
  return TRANSLATIONS.get(schema);
}

/** The definition that a schema was compiled from, including the translation entities that the compiler adds. */
export function entityOfSchema(schema: object): EntityDef<string> {
  const def = DEFINITIONS.get(schema);
  if (def === undefined) {
    throw dataError(
      'DATA_QUERY_INVALID',
      400,
      'This schema was not made by compileEntities.',
      'Pass a schema from the list that compileEntities returned.',
    );
  }
  return def;
}

/** The name of the entity that holds the translations of `entityName` (DATA-17). */
export function translationEntityName(entityName: string): string {
  return `${entityName}Translation`;
}

/** The entity of the translations of `def`, or `undefined` when no field is localized. It stays inside the rules of `defineEntity`. */
function translationOf(def: EntityDef<string>, tenant: boolean): EntityDef<string> | undefined {
  const localized = Object.entries(def.fields).filter(([, field]) => field.localized === true);
  if (localized.length === 0) return undefined;
  const copies: Record<string, Field> = {};
  for (const [name, field] of localized) {
    const { localized: _l, unique: _u, index: _i, searchable: _s, default: _d, computed: _c, ...rest } = field;
    copies[name] = new Field({ ...rest, optional: true });
  }
  return defineEntity({
    name: translationEntityName(def.name),
    table: `${def.table}_i18n`,
    tenant,
    fields: { id: f.id(), record: f.belongsTo(() => def), locale: f.string({ max: 16 }), ...copies },
    orm: {
      uniques: [
        {
          name: `${def.table}_i18n_record_locale_uq`,
          properties: [...(tenant ? ['tenantId'] : []), 'record', 'locale'],
        },
      ],
    },
  });
}

const DATETIME_PRECISION = 3;

function omit<T>(source: Readonly<Record<string, T>>, names: ReadonlySet<string>): Record<string, T> {
  return Object.fromEntries(Object.entries(source).filter(([name]) => !names.has(name)));
}

/** The function that fills a shadow column. The bulk helpers and the guard read which field and mode it belongs to. */
export type ShadowFn = ((entity: Record<string, unknown>) => string | null) & {
  readonly shadowOf: string;
  readonly mode: Compare;
};

function invalid(entity: string, message: string, fix: string): never {
  throw dataError('DATA_ENTITY_INVALID', 500, `Entity ${entity}: ${message}`, fix);
}

const bigint = (): BigIntType => new BigIntType('bigint');

/** The user of the request, for `createdBy` and `updatedBy`. */
const currentUser = (): string | undefined => requestContext.get()?.userId;

/** The columns that one declared field adds, as ORM properties. Relations are handled by the caller. */
function columnsOf(entityName: string, name: string, def: FieldDef): Record<string, Property> {
  const nullable = def.optional === true;
  if (def.encrypted === true) {
    // Text in the column is ciphertext. A default is written by the type, encrypted, and not as a plaintext default of the table.
    const fallback = def.default;
    return {
      [name]: {
        type: encryptedType(`${entityName}.${name}`),
        nullable,
        bkEncrypted: true,
        ...(fallback === undefined ? {} : { onCreate: () => fallback }),
      },
    };
  }
  const column = snake(name);
  const withDefault = def.default === undefined ? {} : { default: def.default };
  switch (def.kind) {
    case 'string':
    case 'email': {
      const props: Record<string, Property> = { [name]: { type: 'string', length: def.max, nullable, ...withDefault } };
      if (def.compare !== undefined && def.compare !== 'exact') {
        const mode = def.compare;
        const shadow: ShadowFn = Object.assign(
          (entity: Record<string, unknown>): string | null =>
            typeof entity[name] === 'string' ? fold(mode, entity[name]) : null,
          { shadowOf: name, mode },
        );
        props[`${name}Cmp`] = {
          type: 'string',
          length: def.max,
          nullable: true,
          hidden: true,
          fieldName: `${column}_cmp`,
          onCreate: shadow,
          onUpdate: shadow,
        };
      }
      return props;
    }
    case 'text':
      return { [name]: { type: 'text', nullable } };
    case 'oneOf':
      return {
        [name]: {
          type: 'string',
          length: Math.max(...(def.values ?? ['x']).map((value) => value.length)),
          nullable,
          ...withDefault,
        },
      };
    case 'int':
      return { [name]: { type: 'integer', nullable, ...withDefault } };
    case 'boolean':
      return { [name]: { type: 'boolean', nullable, ...withDefault } };
    case 'date':
      return { [name]: { type: 'date', nullable, ...withDefault } };
    case 'dateTime':
      return { [name]: { type: DateTimeType, length: DATETIME_PRECISION, nullable } };
    case 'decimal':
      return { [`${name}Scaled`]: { type: bigint(), fieldName: `${column}_scaled`, nullable } };
    case 'money':
      return {
        [`${name}Minor`]: { type: bigint(), fieldName: `${column}_minor`, nullable },
        [`${name}Currency`]: {
          type: 'string',
          length: 3,
          fieldName: `${column}_currency`,
          default: def.currency,
          nullable: true,
        },
      };
    case 'sequence':
      return {
        [name]: {
          type: 'string',
          length: 64,
          nullable: true,
          bkSequence: { pattern: def.pattern, resetEvery: def.resetEvery },
        },
      };
    case 'state':
      return { [name]: { type: 'string', length: 64, default: def.initial, bkState: { initial: def.initial } } };
    case 'custom':
      return {
        [name]: {
          type: def.column?.type ?? 'string',
          ...(def.column?.length === undefined ? {} : { length: def.column.length }),
          nullable,
        },
      };
    default:
      return {};
  }
}

/** A stored computed field is a column filled from the row on create and on every update (MOD-08). */
function computedColumns(entityName: string, name: string, def: FieldDef): Record<string, Property> {
  const fn = def.computed?.fn;
  const props = columnsOf(entityName, name, { ...def, optional: true });
  const own = props[name];
  if (fn === undefined || own === undefined) return props;
  const calculate = (entity: Record<string, unknown>): unknown => fn(entity);
  props[name] = { ...own, onCreate: calculate, onUpdate: calculate };
  return props;
}

interface Compiled {
  readonly schema: OrmSchema;
  readonly def: EntityDef<string>;
  readonly tenant: boolean;
}

function standardProperties(def: EntityDef<string>, tenant: boolean): Record<string, Property> {
  const effective = { ...def, tenant };
  const props: Record<string, Property> = {};
  for (const column of standardColumns(effective)) {
    const base = { fieldName: column.column };
    switch (column.property) {
      case 'id':
        props['id'] = { type: Uuid7Type, primary: true, fieldName: 'id', onCreate: () => uuid7() };
        break;
      case 'tenantId':
        props['tenantId'] = { type: Uuid7Type, ...base };
        break;
      case 'version':
        props['version'] = { type: 'integer', version: true, ...base };
        break;
      case 'createdAt':
        props['createdAt'] = { type: DateTimeType, length: DATETIME_PRECISION, ...base, onCreate: () => new Date() };
        break;
      case 'updatedAt':
        props['updatedAt'] = {
          type: DateTimeType,
          length: DATETIME_PRECISION,
          ...base,
          onCreate: () => new Date(),
          onUpdate: () => new Date(),
        };
        break;
      case 'createdBy':
        props['createdBy'] = { type: Uuid7Type, nullable: true, ...base, onCreate: currentUser };
        break;
      case 'updatedBy':
        props['updatedBy'] = { type: Uuid7Type, nullable: true, ...base, onCreate: currentUser, onUpdate: currentUser };
        break;
      case 'deletedAt':
        props['deletedAt'] = { type: DateTimeType, length: DATETIME_PRECISION, nullable: true, ...base };
        break;
      case 'deletedToken':
        props['deletedToken'] = { type: 'string', length: 36, default: '', ...base };
        break;
    }
  }
  return props;
}

/** The back relation of `target` that points at `owner`: the only `belongsTo` of the target whose entity is the owner. */
function backRelation(owner: EntityDef<string>, field: string, target: EntityDef<string>): string {
  const candidates = Object.entries(target.fields)
    .filter(([, def]) => def.kind === 'belongsTo' && def.target?.().name === owner.name)
    .map(([name]) => name);
  if (candidates.length === 1 && candidates[0] !== undefined) return candidates[0];
  const why =
    candidates.length === 0
      ? `${target.name} has no relation back to ${owner.name}`
      : `${target.name} has several relations back to ${owner.name} (${candidates.join(', ')})`;
  return invalid(
    owner.name,
    `${field} is ambiguous: ${why}.`,
    `Give ${target.name} exactly one f.belongsTo(() => ${owner.name.split('.').at(-1) ?? ''}).`,
  );
}

/**
 * Turns entity definitions into MikroORM schemas, one per definition and in the same order, then the hand written ones.
 * Relations are resolved through the list, so definitions may refer to each other in any order and in cycles. The
 * tenant filter and the soft delete filter are part of the schema, and the unique constraints come from `tableConstraints`.
 */
export function compileEntities(defs: readonly EntityDef<string>[], options: CompileOptions = {}): OrmSchema[] {
  const shared = (options.tenancy ?? 'shared-schema') === 'shared-schema';
  const translations = defs.flatMap((def) => translationOf(def, shared && def.tenant) ?? []);
  const extensions = options.extensions ?? [];
  const stored = extensions.map((extension) => extension.entity);
  // The fields that a target gets from its extensions are columns of the extension tables, never of its own.
  const extended = new Map<string, Set<string>>();
  for (const extension of extensions) {
    const names = extended.get(extension.target) ?? new Set<string>();
    for (const name of extension.fields) names.add(name);
    extended.set(extension.target, names);
  }
  const everything = [...defs, ...translations, ...stored];
  const byName = new Map<string, EntityDef<string>>();
  for (const def of everything) {
    if (byName.has(def.name)) invalid(def.name, 'it is listed twice.', 'List each entity once.');
    byName.set(def.name, def);
  }
  const tenantOf = (def: EntityDef<string>): boolean => shared && def.tenant;
  const compiled = new Map<string, Compiled>();
  const schemaOf = (name: string): OrmSchema | undefined => compiled.get(name)?.schema;

  const targetOf = (owner: EntityDef<string>, field: string, def: FieldDef): EntityDef<string> => {
    const target = def.target?.();
    const found = target === undefined ? undefined : byName.get(target.name);
    if (found === undefined)
      invalid(
        owner.name,
        `${field} refers to ${target?.name ?? 'an entity'} that is not in the list.`,
        'Pass every entity that a relation refers to, in the same call.',
      );
    return found;
  };

  for (const def of everything) {
    const tenant = tenantOf(def);
    const props = standardProperties(def, tenant);
    const columnOfProperty = new Map<string, string>();
    for (const column of standardColumns({ ...def, tenant })) columnOfProperty.set(column.column, column.property);

    const outside = extended.get(def.name);
    // The definition without the fields of its extensions: what the table, its keys and its indexes are made from.
    const bare = outside === undefined ? def : { ...def, fields: omit(def.fields, outside) };
    for (const [name, field] of Object.entries(bare.fields)) {
      if (['id', 'createdAt', 'updatedAt'].includes(field.kind)) continue;
      const column = snake(name);
      if (field.kind === 'belongsTo') {
        const target = targetOf(def, name, field);
        if (!tenant && tenantOf(target))
          invalid(
            def.name,
            `${name} refers to ${target.name}, which is tenant scoped, from an entity that is not.`,
            'Make this entity tenant scoped, or refer to a global one: no foreign key could keep the row inside one tenant.',
          );
        const relation: Property = {
          kind: 'm:1',
          entity: () => schemaOf(target.name),
          nullable: field.optional === true,
        };
        if (tenant && tenantOf(target)) {
          relation['joinColumns'] = ['tenant_id', `${column}_id`];
          relation['referencedColumnNames'] = ['tenant_id', 'id'];
        } else relation['fieldName'] = `${column}_id`;
        props[name] = relation;
        columnOfProperty.set(`${column}_id`, name);
        continue;
      }
      if (field.kind === 'hasOne' || field.kind === 'hasMany') {
        const target = targetOf(def, name, field);
        props[name] = {
          kind: field.kind === 'hasOne' ? '1:1' : '1:m',
          entity: () => schemaOf(target.name),
          mappedBy: backRelation(def, name, target),
        };
        continue;
      }
      if (field.computed !== undefined && !field.computed.stored) continue;
      const own =
        field.computed === undefined ? columnsOf(def.name, name, field) : computedColumns(def.name, name, field);
      for (const [property, value] of Object.entries(own)) {
        props[property] = value;
        const fieldName = typeof value['fieldName'] === 'string' ? value['fieldName'] : snake(property);
        columnOfProperty.set(fieldName, property);
      }
      columnOfProperty.set(column, name);
    }

    const effective = { ...bare, tenant };
    const constraints = tableConstraints(effective);
    const toProperties = (columns: readonly string[]): string[] =>
      columns.map(
        (column) =>
          columnOfProperty.get(column) ??
          invalid(def.name, `the column ${column} of a constraint has no property.`, 'This is a bug of the compiler.'),
      );
    const uniques = constraints.uniques.map((unique) => ({
      name: unique.name,
      properties: toProperties(unique.columns),
    }));
    const indexes = constraints.indexes.map((index) => ({ name: index.name, properties: toProperties(index.columns) }));
    for (const index of def.orm.indexes ?? [])
      indexes.push({
        name: index.name ?? `${def.table}_${index.properties.map(snake).join('_')}_idx`,
        properties: [...index.properties],
      });
    for (const unique of def.orm.uniques ?? [])
      uniques.push({
        name: unique.name ?? `${def.table}_${unique.properties.map(snake).join('_')}_uq`,
        properties: [...unique.properties],
      });
    for (const [property, extra] of Object.entries(def.orm.properties ?? {}))
      props[property] = { ...props[property], ...extra };

    const filters: Record<string, unknown> = {};
    if (tenant) {
      filters['tenant'] = { cond: () => (isSystemScope() ? {} : { tenantId: requireTenant() }), default: true };
    }
    if (def.softDelete) filters['softDelete'] = { cond: { deletedAt: null }, default: true };

    // MikroORM types its options for classes, and these properties are built from data, so they are passed as they are.
    // oxlint-disable-next-line typescript/no-unsafe-type-assertion
    const schema = new EntitySchema<Record<string, unknown>>({
      name: def.name,
      tableName: def.table,
      properties: props,
      uniques,
      indexes,
      filters,
    } as never);
    DEFINITIONS.set(schema, def);
    compiled.set(def.name, { schema, def, tenant });
  }

  for (const extension of extensions) {
    const base = schemaOf(extension.target);
    const table = schemaOf(extension.entity.name);
    if (base === undefined || table === undefined) continue;
    EXTENSIONS.set(base, [...(EXTENSIONS.get(base) ?? []), { schema: table, fields: extension.fields }]);
  }

  for (const translation of translations) {
    const owner = byName.get(translation.name.slice(0, -'Translation'.length));
    const base = owner === undefined ? undefined : schemaOf(owner.name);
    const own = schemaOf(translation.name);
    if (base !== undefined && own !== undefined) TRANSLATIONS.set(base, own);
  }

  return [
    ...everything.map((def) => schemaOf(def.name)).filter((schema): schema is OrmSchema => schema !== undefined),
    ...(options.raw ?? []),
  ];
}
