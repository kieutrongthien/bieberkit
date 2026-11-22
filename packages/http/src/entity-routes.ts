/**
 * BieberKit
 *
 * @file        packages/http/src/entity-routes.ts
 * @description The REST routes that are generated from an entity: list, get, create, update and delete (spec 13.1, 7.5, API-08, API-13).
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

import { DataError, dataError } from '@bieberkit/data';
import {
  aggregate,
  emitEvent,
  entityEventName,
  entityOfSchema,
  expectVersion,
  listPage,
  recordAudit,
  runInUnitOfWork,
  softDelete,
  toApiRow,
  transition,
  toOrmData,
} from '@bieberkit/data/orm';
import type { Database, OrmSchema } from '@bieberkit/data/orm';
import { apiFields, toJsonSchema } from '@bieberkit/data/schema';
import type { ApiField, EntityDef, JsonSchema } from '@bieberkit/data/schema';
import { HttpError, ValidationFailed } from './problem.ts';
import type { RouteContext, RouteDef } from './route.ts';
import type { HttpServer } from './server.ts';

type Row = Record<string, unknown>;

const asRow = (value: unknown): Row =>
  typeof value === 'object' && value !== null ? Object.fromEntries(Object.entries(value)) : {};
const textOf = (value: unknown): string | undefined => (typeof value === 'string' ? value : undefined);
type EntityManager = Parameters<Parameters<typeof runInUnitOfWork>[1]>[0];

export interface EntityRoutesContext {
  readonly db: Database;
  /** The compiled schemas of the project. A relation can be included when the schema of its target is here. */
  readonly schemas: readonly OrmSchema[];
}

const MAX_PAGE_ROWS = 10_000;
const MAX_BULK = 500;
const MAX_BULK_INLINE = 100;
const DEFAULT_PAGE_SIZE = 25;
const MAX_PAGE_SIZE = 100;
const FILTER = /^filter\[([A-Za-z][A-Za-z0-9]*)\]\[(eq|ne|in|lt|lte|gt|gte|null)\]$/;
const OPERATORS: Readonly<Record<string, string>> = {
  eq: '$eq',
  ne: '$ne',
  in: '$in',
  lt: '$lt',
  lte: '$lte',
  gt: '$gt',
  gte: '$gte',
};
const STANDARD_KEYS = ['id', 'version', 'createdAt', 'updatedAt', 'createdBy', 'updatedBy'] as const;

/** `crm.Customer` on `crm_customers`: module `crm`, resource `customers`. */
export function pathOf(def: EntityDef<string>): string {
  const module = def.name.slice(0, def.name.indexOf('.'));
  const table = def.table.startsWith(`${module}_`) ? def.table.slice(module.length + 1) : def.table;
  return `/api/v1/${module}/${table.replaceAll('_', '-')}`;
}

export function permissionOf(def: EntityDef<string>, action: 'read' | 'create' | 'update' | 'delete'): string {
  const own = def.permissions[action];
  return own ?? entityEventName(def.name, action);
}

/** A response schema for a row: the read shape, without the `required` list, so that a row with fewer fields is valid. */
function rowSchema(def: EntityDef<string>): JsonSchema {
  const { $schema: _schema, $id: _id, required: _required, ...rest } = toJsonSchema(def, 'read');
  return rest;
}

function recordNotFound(): DataError {
  return dataError(
    'DATA_RECORD_NOT_FOUND',
    404,
    'The record does not exist.',
    'Check the id, and that the record belongs to this tenant.',
  );
}

/** The ORM properties behind a key of the API, for `select`. */
function propertiesOf(field: ApiField): string[] {
  switch (field.def.kind) {
    case 'money':
      return [`${field.name}Minor`, `${field.name}Currency`];
    case 'decimal':
      return [`${field.name}Scaled`];
    default:
      return [field.name];
  }
}

interface Reader {
  readonly keys: ReadonlySet<string>;
  readonly byKey: ReadonlyMap<string, ApiField>;
  readonly includes: ReadonlyMap<string, OrmSchema>;
}

function readerOf(def: EntityDef<string>, context: EntityRoutesContext): Reader {
  const fields = apiFields(def);
  const includes = new Map<string, OrmSchema>();
  for (const field of fields) {
    if (field.def.kind !== 'belongsTo' || field.def.target === undefined) continue;
    const target = field.def.target();
    const found = context.schemas.find((schema) => entityOfSchema(schema).name === target.name);
    if (found !== undefined) includes.set(field.name, found);
  }
  const keys = new Set<string>([
    ...STANDARD_KEYS,
    ...(def.softDelete ? ['deletedAt'] : []),
    ...fields.map((field) => field.key),
  ]);
  return { keys, byKey: new Map(fields.map((field) => [field.key, field])), includes };
}

function filterValue(kind: string, text: string, place: string): unknown {
  if (kind === 'int') {
    if (!/^-?\d+$/.test(text))
      throw new ValidationFailed([{ path: place, keyword: 'type', message: 'must be a whole number' }]);
    return Number(text);
  }
  if (kind === 'boolean') {
    if (text !== 'true' && text !== 'false') {
      throw new ValidationFailed([{ path: place, keyword: 'type', message: 'must be true or false' }]);
    }
    return text === 'true';
  }
  return text;
}

/** `filter[tier][in]=a,b` and the rest of the filters of a query, as the `where` of the data layer. */
function whereOf(query: Row, reader: Reader): Row {
  const where: Row = {};
  for (const [name, raw] of Object.entries(query)) {
    const match = FILTER.exec(name);
    if (match === null) continue;
    const [, key = '', operator = ''] = match;
    const place = `query.${name}`;
    const field = reader.byKey.get(key);
    const standard = (STANDARD_KEYS as readonly string[]).includes(key);
    if (field === undefined && !standard) {
      throw new ValidationFailed([{ path: place, keyword: 'field', message: `${key} is not a field of this entity` }]);
    }
    const property = field === undefined ? key : field.name;
    const kind = field?.def.kind ?? (key === 'version' ? 'int' : 'text');
    const text = String(raw);
    const condition: Row = { ...asRow(where[property]) };
    if (operator === 'null') {
      if (text !== 'true' && text !== 'false') {
        throw new ValidationFailed([{ path: place, keyword: 'type', message: 'must be true or false' }]);
      }
      condition[text === 'true' ? '$eq' : '$ne'] = null;
    } else if (operator === 'in') {
      condition['$in'] = text.split(',').map((item) => filterValue(kind, item, place));
    } else {
      condition[OPERATORS[operator] ?? '$eq'] = filterValue(kind, text, place);
    }
    where[property] = condition;
  }
  return where;
}

function sortOf(text: string | undefined, reader: Reader): { field: string; direction: 'asc' | 'desc' }[] | undefined {
  if (text === undefined || text === '') return undefined;
  return text.split(',').map((part) => {
    const direction = part.startsWith('-') ? 'desc' : 'asc';
    const key = part.replace(/^-/, '');
    return { field: reader.byKey.get(key)?.name ?? key, direction };
  });
}

function namesOf(text: string | undefined): string[] {
  return text === undefined || text === '' ? [] : text.split(',');
}

function fieldsInvalid(message: string): never {
  throw new HttpError(
    'HTTP_FIELDS_INVALID',
    400,
    message,
    'Use the names of the fields and the relations of the entity.',
  );
}

/** One row of a page, in the shape of the API, with the fields and the relations that were asked for. */
function shapeRow(
  schema: OrmSchema,
  reader: Reader,
  row: Row,
  fields: readonly string[],
  include: readonly string[],
): Row {
  const api = toApiRow(schema, row);
  const out: Row = fields.length === 0 ? api : { id: api['id'], version: api['version'] };
  for (const key of fields) out[key] = api[key];
  for (const name of include) {
    const target = reader.includes.get(name);
    const related: unknown = row[name];
    out[name] =
      target === undefined || typeof related !== 'object' || related === null
        ? null
        : toApiRow(target, Object.fromEntries(Object.entries(related)));
  }
  return out;
}

async function readOne(em: EntityManager, schema: OrmSchema, id: string, options: Row): Promise<Row> {
  const page = await listPage(em, schema, { ...options, where: { id }, limit: 1 });
  const row = page.rows[0];
  if (row === undefined) throw recordNotFound();
  return row;
}

/** A stale write is 412 with the row as it is now, so that the client can show what changed (API-13). */
async function withCurrent<T>(db: Database, schema: OrmSchema, id: string, run: () => Promise<T>): Promise<T> {
  try {
    return await run();
  } catch (error) {
    if (!(error instanceof DataError) || error.code !== 'DATA_VERSION_STALE') throw error;
    const current = await runInUnitOfWork(db, async (em) => {
      const page = await listPage(em, schema, { where: { id }, limit: 1 });
      const row = page.rows[0];
      return row === undefined ? null : toApiRow(schema, row);
    });
    throw new HttpError(error.code, 412, error.safeMessage, error.fix, {}, error, { current });
  }
}

function ifMatchOf(ctx: RouteContext): string {
  const header = ctx.headers['if-match'];
  const value = Array.isArray(header) ? header[0] : header;
  if (value === undefined || value.trim() === '') {
    throw new HttpError(
      'HTTP_PRECONDITION_REQUIRED',
      428,
      'An update or a delete needs If-Match.',
      'Send If-Match with the ETag or the version that you read (API-13).',
    );
  }
  return value;
}

const idParams: JsonSchema = {
  type: 'object',
  properties: { id: { type: 'string', format: 'uuid' } },
  required: ['id'],
  additionalProperties: false,
};

function listQuery(reader: Reader, withPaging: boolean): JsonSchema {
  const properties: Record<string, JsonSchema> = {
    include: { type: 'string' },
    fields: { type: 'string' },
    locale: { type: 'string' },
  };
  if (withPaging) {
    Object.assign(properties, {
      pageSize: { type: 'integer', minimum: 1 },
      page: { type: 'integer', minimum: 1 },
      cursor: { type: 'string' },
      sort: { type: 'string', pattern: '^-?[A-Za-z][A-Za-z0-9]*(,-?[A-Za-z][A-Za-z0-9]*)*$' },
      withTotal: { type: 'boolean' },
    });
  }
  return {
    type: 'object',
    properties,
    ...(withPaging
      ? {
          patternProperties: {
            '^filter\\[[A-Za-z][A-Za-z0-9]*\\]\\[(eq|ne|in|lt|lte|gt|gte|null)\\]$': { type: 'string' },
          },
        }
      : {}),
    additionalProperties: false,
  };
}

/** The routes of one entity, for the operations that its `api` turns on. */
export function entityRoutes(schema: OrmSchema, context: EntityRoutesContext): RouteDef[] {
  const def = entityOfSchema(schema);
  const reader = readerOf(def, context);
  const base = pathOf(def);
  const { db } = context;
  const rowShape = rowSchema(def);
  const withIncludes: JsonSchema = {
    ...rowShape,
    properties: {
      ...asRow(rowShape['properties']),
      ...Object.fromEntries(
        [...reader.includes].map(([name, target]) => [
          name,
          { anyOf: [rowSchema(entityOfSchema(target)), { type: 'null' }] },
        ]),
      ),
    },
  };
  const single: JsonSchema = { type: 'object', properties: { data: withIncludes }, required: ['data'] };
  const meta: JsonSchema = {
    type: 'object',
    properties: {
      pageSize: { type: 'integer' },
      page: { type: 'integer' },
      nextCursor: { type: ['string', 'null'] },
      total: { type: 'integer' },
    },
    required: ['pageSize'],
  };
  const many: JsonSchema = {
    type: 'object',
    properties: { data: { type: 'array', items: withIncludes }, meta },
    required: ['data', 'meta'],
  };
  const event = (verb: string): string => entityEventName(def.name, verb);

  /** The part of a request that decides which fields and relations come back. */
  const shape = (query: Row): { fields: string[]; include: string[]; select: string[] | undefined } => {
    const fields = namesOf(textOf(query['fields']));
    const include = namesOf(textOf(query['include']));
    for (const key of fields) {
      if (!reader.keys.has(key) || key === 'id' || key === 'version')
        fieldsInvalid(`"${key}" is not a field that can be listed.`);
    }
    for (const name of include)
      if (!reader.includes.has(name)) fieldsInvalid(`"${name}" is not a relation that can be included.`);
    let select: string[] | undefined;
    if (fields.length > 0) {
      const props = new Set<string>(['version']);
      for (const key of fields) {
        const field = reader.byKey.get(key);
        if (field === undefined) props.add(key);
        else if (field.def.computed !== undefined && !field.def.computed.stored) {
          select = undefined;
          return { fields, include, select };
        } else for (const prop of propertiesOf(field)) props.add(prop);
      }
      for (const name of include) props.add(name);
      select = [...props];
    }
    return { fields, include, select };
  };

  const routes: RouteDef[] = [];

  if (def.api.list === true) {
    routes.push({
      method: 'GET',
      url: base,
      permission: permissionOf(def, 'read'),
      schema: { query: listQuery(reader, true), response: { 200: many } },
      handler: (ctx) =>
        runInUnitOfWork(db, async (em) => {
          const query = ctx.query;
          const size = Math.min(Number(query['pageSize'] ?? DEFAULT_PAGE_SIZE), MAX_PAGE_SIZE);
          const page = query['page'] === undefined ? undefined : Number(query['page']);
          const cursor = textOf(query['cursor']);
          if (page !== undefined && cursor !== undefined) {
            throw new ValidationFailed([
              { path: 'query.page', keyword: 'conflict', message: 'cannot be used together with cursor' },
            ]);
          }
          if (page !== undefined && page * size > MAX_PAGE_ROWS) {
            throw new HttpError(
              'HTTP_PAGE_TOO_DEEP',
              400,
              `Page ${page} is deeper than ${MAX_PAGE_ROWS} rows.`,
              'Use cursor to go deeper than 10 000 rows.',
            );
          }
          const { fields, include, select } = shape(query);
          const sort = sortOf(textOf(query['sort']), reader);
          const result = await listPage(em, schema, {
            where: whereOf(query, reader),
            limit: size,
            ...(sort === undefined ? {} : { sort }),
            ...(cursor === undefined ? {} : { cursor }),
            ...(page === undefined ? {} : { offset: (page - 1) * size }),
            ...(query['withTotal'] === true ? { withTotal: true } : {}),
            ...(select === undefined ? {} : { select }),
            ...(include.length === 0 ? {} : { populate: include }),
            ...(typeof query['locale'] === 'string' ? { locale: query['locale'] } : {}),
          });
          return {
            data: result.rows.map((item) => shapeRow(schema, reader, item, fields, include)),
            meta: {
              pageSize: result.limit,
              ...(page === undefined ? { nextCursor: result.nextCursor } : { page }),
              ...(result.total === undefined ? {} : { total: result.total }),
            },
          };
        }),
    });
  }

  // The aggregate route: counts and sums by group, for dashboards (API-15). It is only for entities that have a field declared
  // `.aggregatable()`, and it reads through the same filters as a list.
  if (def.api.list === true && Object.values(def.fields).some((field) => field.aggregatable === true)) {
    const list = '^[A-Za-z][A-Za-z0-9]*(,[A-Za-z][A-Za-z0-9]*)*$';
    const query = listQuery(reader, false);
    routes.push({
      method: 'GET',
      url: `${base}/aggregate`,
      permission: permissionOf(def, 'read'),
      schema: {
        query: {
          ...query,
          properties: {
            groupBy: { type: 'string', pattern: list },
            sum: { type: 'string', pattern: list },
            count: { type: 'boolean' },
          },
          patternProperties: {
            '^filter\\[[A-Za-z][A-Za-z0-9]*\\]\\[(eq|ne|in|lt|lte|gt|gte|null)\\]$': { type: 'string' },
          },
        },
        response: {
          200: {
            type: 'object',
            properties: {
              data: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    group: { type: 'object', additionalProperties: true },
                    count: { type: 'integer' },
                    sum: { type: 'object', additionalProperties: true },
                  },
                },
              },
              meta: {
                type: 'object',
                properties: {
                  groupBy: { type: 'array', items: { type: 'string' } },
                  sum: { type: 'array', items: { type: 'string' } },
                  count: { type: 'boolean' },
                },
              },
            },
          },
        },
      },
      handler: async (ctx) => {
        const groupKeys = namesOf(textOf(ctx.query['groupBy']));
        const sumKeys = namesOf(textOf(ctx.query['sum']));
        const nameOf = (key: string): string => reader.byKey.get(key)?.name ?? key;
        // A field with a mask is read only by a caller who may read it, in a group and in a sum as in a list (AUTHZ-03).
        for (const name of [...groupKeys, ...sumKeys].map(nameOf)) {
          const mask = def.permissions.fields?.[name]?.read;
          if (mask !== undefined && !(await ctx.can(mask))) {
            throw new HttpError(
              'HTTP_FORBIDDEN',
              403,
              'You may not read this field.',
              `The permission ${mask} is needed.`,
            );
          }
        }
        const count = ctx.query['count'] === true ? true : ctx.query['count'] === false ? false : undefined;
        const result = await runInUnitOfWork(db, (em) =>
          aggregate(em, schema, {
            groupBy: groupKeys.map(nameOf),
            sum: sumKeys.map(nameOf),
            where: whereOf(ctx.query, reader),
            ...(count === undefined ? {} : { count }),
          }),
        );
        const keyOf = (name: string): string =>
          [...reader.byKey.values()].find((field) => field.name === name)?.key ?? name;
        return {
          data: result.rows.map((row) => ({
            group: Object.fromEntries(Object.entries(row.group).map(([name, value]) => [keyOf(name), value])),
            ...(row.count === undefined ? {} : { count: row.count }),
            ...(row.sum === undefined
              ? {}
              : { sum: Object.fromEntries(Object.entries(row.sum).map(([name, value]) => [keyOf(name), value])) }),
          })),
          meta: { groupBy: groupKeys, sum: sumKeys, count: count ?? sumKeys.length === 0 },
        };
      },
    });
  }

  if (def.api.get === true) {
    routes.push({
      method: 'GET',
      url: `${base}/:id`,
      permission: permissionOf(def, 'read'),
      schema: { params: idParams, query: listQuery(reader, false), response: { 200: single } },
      handler: (ctx) =>
        runInUnitOfWork(db, async (em) => {
          const { fields, include, select } = shape(ctx.query);
          const found = await readOne(em, schema, String(ctx.params['id']), {
            ...(select === undefined ? {} : { select }),
            ...(include.length === 0 ? {} : { populate: include }),
            ...(typeof ctx.query['locale'] === 'string' ? { locale: ctx.query['locale'] } : {}),
          });
          const data = shapeRow(schema, reader, found, fields, include);
          // The version names the record, so it is the tag that a client sends back as If-Match (API-13).
          if (include.length === 0) ctx.header('etag', `W/"${String(data['version'])}"`);
          return { data };
        }),
    });
  }

  if (def.api.create === true) {
    routes.push({
      method: 'POST',
      url: base,
      permission: permissionOf(def, 'create'),
      idempotent: true,
      schema: { body: toJsonSchema(def, 'create'), response: { 201: single } },
      handler: (ctx) =>
        runInUnitOfWork(db, async (em) => {
          const created = em.create(schema, toOrmData(schema, asRow(ctx.body), 'create'));
          const id = String(created['id']);
          emitEvent(em, { name: event('created'), payload: { id }, record: { entity: def.name, id, version: 1 } });
          recordAudit(em, { action: `${def.name}.create`, entity: def.name, recordId: id });
          await em.flush();
          ctx.status(201);
          ctx.header('location', `${base}/${id}`);
          return { data: toApiRow(schema, created) };
        }),
    });
  }

  if (def.api.update === true) {
    routes.push({
      method: 'PATCH',
      url: `${base}/:id`,
      requiresIfMatch: true,
      permission: permissionOf(def, 'update'),
      schema: { params: idParams, body: toJsonSchema(def, 'update'), response: { 200: single } },
      handler: (ctx) => {
        const id = String(ctx.params['id']);
        const expected = ifMatchOf(ctx);
        return withCurrent(db, schema, id, () =>
          runInUnitOfWork(db, async (em) => {
            const found = await em.findOne(schema, { id });
            if (found === null) throw recordNotFound();
            expectVersion(found, expected);
            const body = asRow(ctx.body);
            em.assign(found, toOrmData(schema, body, 'update'));
            const next = (typeof found['version'] === 'number' ? found['version'] : 0) + 1;
            emitEvent(em, {
              name: event('updated'),
              payload: { id, fields: Object.keys(body) },
              record: { entity: def.name, id, version: next },
            });
            recordAudit(em, {
              action: `${def.name}.update`,
              entity: def.name,
              recordId: id,
              data: { fields: Object.keys(body) },
            });
            await em.flush();
            return { data: toApiRow(schema, found) };
          }),
        );
      },
    });
  }

  if (def.api.delete === true) {
    routes.push({
      method: 'DELETE',
      url: `${base}/:id`,
      requiresIfMatch: true,
      permission: permissionOf(def, 'delete'),
      schema: { params: idParams, response: { 204: { type: 'null' } } },
      handler: (ctx) => {
        const id = String(ctx.params['id']);
        const expected = ifMatchOf(ctx);
        return withCurrent(db, schema, id, () =>
          runInUnitOfWork(db, async (em) => {
            const found = await em.findOne(schema, { id });
            if (found === null) throw recordNotFound();
            expectVersion(found, expected);
            emitEvent(em, {
              name: event('deleted'),
              payload: { id },
              record: {
                entity: def.name,
                id,
                version: (typeof found['version'] === 'number' ? found['version'] : 0) + 1,
              },
            });
            recordAudit(em, { action: `${def.name}.delete`, entity: def.name, recordId: id });
            if (def.softDelete) softDelete(em, found);
            else em.remove(found);
            await em.flush();
            ctx.status(204);
            return undefined;
          }),
        );
      },
    });
  }

  // The transitions of a state field are routes of their own (MOD-06). The body is the input of the transition, which `transition`
  // checks against the schema that the transition declares.
  const machine = Object.values(def.fields).find((field) => field.kind === 'state' && field.transitions !== undefined);
  const transitions = machine?.transitions ?? {};
  const anyApi = Object.values(def.api).some((on) => on === true);
  if (anyApi) {
    for (const [name, declared] of Object.entries(transitions)) {
      routes.push({
        method: 'POST',
        url: `${base}/:id/actions/${name}`,
        requiresIfMatch: true,
        permission: declared.permission ?? permissionOf(def, 'update'),
        schema: { params: idParams, body: {}, response: { 200: single } },
        handler: (ctx) => {
          const id = String(ctx.params['id']);
          const expected = ifMatchOf(ctx);
          const empty =
            ctx.body === undefined ||
            (typeof ctx.body === 'object' && ctx.body !== null && Object.keys(ctx.body).length === 0);
          return withCurrent(db, schema, id, () =>
            runInUnitOfWork(db, async (em) => {
              const found = await em.findOne(schema, { id });
              if (found === null) throw recordNotFound();
              expectVersion(found, expected);
              await transition(em, schema, found, name, empty ? undefined : ctx.body);
              await em.flush();
              return { data: toApiRow(schema, found) };
            }),
          );
        },
      });
    }
  }

  // One route for the bulk operations (API-14, API-17). It needs `read`, and the handler asks for the permission of the operation.
  if (def.api.update === true || def.api.delete === true || (anyApi && Object.keys(transitions).length > 0)) {
    const { $schema: _s, $id: _i, ...patch } = toJsonSchema(def, 'update');
    const item: JsonSchema = {
      type: 'object',
      properties: { id: { type: 'string', format: 'uuid' }, version: { type: 'integer', minimum: 1 } },
      required: ['id', 'version'],
      additionalProperties: false,
    };
    const operations = [
      ...(def.api.update === true ? ['update'] : []),
      ...(def.api.delete === true ? ['delete'] : []),
      ...(Object.keys(transitions).length > 0 ? ['transition'] : []),
    ];
    routes.push({
      method: 'POST',
      url: `${base}/bulk`,
      permission: permissionOf(def, 'read'),
      schema: {
        body: {
          type: 'object',
          properties: {
            operation: { enum: operations },
            items: { type: 'array', minItems: 1, maxItems: MAX_BULK, items: item },
            data: patch,
            transition: { type: 'string' },
            input: {},
          },
          required: ['operation', 'items'],
          additionalProperties: false,
        },
        response: {
          200: {
            type: 'object',
            properties: {
              data: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    id: { type: 'string' },
                    status: { enum: ['ok', 'conflict', 'not_found', 'invalid'] },
                    version: { type: 'integer' },
                    error: { type: 'object', properties: { code: { type: 'string' }, message: { type: 'string' } } },
                  },
                },
              },
              meta: {
                type: 'object',
                properties: {
                  requested: { type: 'integer' },
                  succeeded: { type: 'integer' },
                  failed: { type: 'integer' },
                },
              },
            },
          },
        },
      },
      handler: (ctx) => bulk(ctx),
    });
  }

  async function bulk(ctx: RouteContext): Promise<unknown> {
    const body = asRow(ctx.body);
    const operation = String(body['operation']);
    const requested = (Array.isArray(body['items']) ? body['items'] : []).map(asRow);
    const ids = requested.map((entry) => String(entry['id']));
    if (new Set(ids).size !== ids.length) {
      throw new ValidationFailed([
        { path: 'body.items', keyword: 'uniqueItems', message: 'must not name a record twice' },
      ]);
    }
    const name = textOf(body['transition']);
    const declared = name === undefined ? undefined : transitions[name];
    let permission: string;
    if (operation === 'update') {
      if (body['data'] === undefined)
        throw new ValidationFailed([{ path: 'body.data', keyword: 'required', message: 'an update needs data' }]);
      permission = permissionOf(def, 'update');
    } else if (operation === 'delete') {
      permission = permissionOf(def, 'delete');
    } else {
      if (declared === undefined)
        throw new ValidationFailed([
          {
            path: 'body.transition',
            keyword: 'enum',
            message: `must be one of ${Object.keys(transitions).join(', ')}`,
          },
        ]);
      permission = declared.permission ?? permissionOf(def, 'update');
    }
    if (!(await ctx.can(permission))) {
      throw new HttpError('HTTP_FORBIDDEN', 403, 'You may not do this.', `The permission ${permission} is needed.`);
    }
    if (requested.length > MAX_BULK_INLINE) {
      throw new HttpError(
        'HTTP_BULK_TOO_LARGE',
        422,
        `${requested.length} items are more than ${MAX_BULK_INLINE}.`,
        `Send up to ${MAX_BULK_INLINE} items. Larger batches run as a queued job, which needs the queue of M1.5.`,
      );
    }
    return runInUnitOfWork(db, async (em) => {
      const found = await em.find(schema, { id: { $in: ids } });
      const byId = new Map(found.map((record) => [String(record['id']), record]));
      const outcomes: { id: string; status: string; version?: number; error?: { code: string; message: string } }[] =
        [];
      const saved: { id: string; row: Row }[] = [];
      for (const entry of requested) {
        const id = String(entry['id']);
        const row = byId.get(id);
        if (row === undefined) {
          outcomes.push({ id, status: 'not_found' });
          continue;
        }
        try {
          expectVersion(row, Number(entry['version']));
        } catch (error) {
          if (!(error instanceof DataError)) throw error;
          const version = typeof row['version'] === 'number' ? row['version'] : undefined;
          outcomes.push({
            id,
            status: 'conflict',
            ...(version === undefined ? {} : { version }),
            error: { code: error.code, message: error.safeMessage },
          });
          continue;
        }
        const next = (typeof row['version'] === 'number' ? row['version'] : 0) + 1;
        try {
          if (operation === 'update') {
            const data = asRow(body['data']);
            em.assign(row, toOrmData(schema, data, 'update'));
            emitEvent(em, {
              name: event('updated'),
              payload: { id, fields: Object.keys(data) },
              record: { entity: def.name, id, version: next },
            });
            recordAudit(em, {
              action: `${def.name}.update`,
              entity: def.name,
              recordId: id,
              data: { fields: Object.keys(data) },
            });
          } else if (operation === 'delete') {
            emitEvent(em, { name: event('deleted'), payload: { id }, record: { entity: def.name, id, version: next } });
            recordAudit(em, { action: `${def.name}.delete`, entity: def.name, recordId: id });
            if (def.softDelete) softDelete(em, row);
            else em.remove(row);
          } else {
            await transition(em, schema, row, String(name), body['input']);
          }
        } catch (error) {
          if (!(error instanceof DataError)) throw error;
          outcomes.push({ id, status: 'invalid', error: { code: error.code, message: error.safeMessage } });
          continue;
        }
        saved.push({ id, row });
        outcomes.push({ id, status: 'ok' });
      }
      await em.flush();
      for (const outcome of outcomes) {
        const row = saved.find((item) => item.id === outcome.id)?.row;
        const version = row === undefined ? undefined : row['version'];
        if (outcome.status === 'ok' && operation !== 'delete' && typeof version === 'number') outcome.version = version;
      }
      const succeeded = outcomes.filter((outcome) => outcome.status === 'ok').length;
      return { data: outcomes, meta: { requested: requested.length, succeeded, failed: requested.length - succeeded } };
    });
  }

  return routes;
}

/** Adds the routes of every entity in `schemas` to the server. */
export function registerEntityRoutes(
  server: HttpServer,
  schemas: readonly OrmSchema[],
  options: { db: Database },
): void {
  for (const schema of schemas) {
    for (const route of entityRoutes(schema, { db: options.db, schemas })) server.route(route);
  }
}
