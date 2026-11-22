/**
 * BieberKit
 *
 * @file        packages/http/src/meta.ts
 * @description /api/v1/_meta: what the admin shell learns about the entities, for the caller and the tenant of the request (META-01 to META-05, UI-02).
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

import { apiFields, toJsonSchema } from '@bieberkit/data/schema';
import type { ApiField, EntityDef, FieldDef, JsonSchema } from '@bieberkit/data/schema';
import { HttpError } from './problem.ts';
import { pathOf, permissionOf } from './entity-routes.ts';
import type { HttpServer } from './server.ts';

export const META_SCHEMA_VERSION = 1;

const text: JsonSchema = { type: 'string' };
const strings: JsonSchema = { type: 'array', items: text };
const flags = (names: readonly string[]): JsonSchema => ({
  type: 'object',
  properties: Object.fromEntries(names.map((name) => [name, { type: 'boolean' }])),
  required: [...names],
  additionalProperties: false,
});

/** The JSON Schema of the answer of `/api/v1/_meta`, published so that other adapters can check against it (META-05). */
export const META_SCHEMA: JsonSchema = {
  type: 'object',
  required: ['schemaVersion', 'entities', 'menu', 'dashboards', 'permissions'],
  properties: {
    schemaVersion: { type: 'integer', enum: [META_SCHEMA_VERSION] },
    entities: {
      type: 'array',
      items: {
        type: 'object',
        required: [
          'name',
          'path',
          'label',
          'operations',
          'can',
          'features',
          'softDelete',
          'tenant',
          'list',
          'fields',
          'form',
          'transitions',
        ],
        properties: {
          name: text,
          path: text,
          label: { type: 'object', additionalProperties: text },
          operations: flags(['list', 'get', 'create', 'update', 'delete']),
          can: flags(['read', 'create', 'update', 'delete']),
          features: strings,
          softDelete: { type: 'boolean' },
          tenant: { type: 'boolean' },
          title: text,
          icon: text,
          list: strings,
          form: strings,
          fields: {
            type: 'array',
            items: {
              type: 'object',
              required: ['key', 'kind', 'widget', 'required', 'readOnly', 'filterable', 'sortable'],
              properties: {
                key: text,
                kind: text,
                widget: text,
                required: { type: 'boolean' },
                readOnly: { type: 'boolean' },
                filterable: { type: 'boolean' },
                sortable: { type: 'boolean' },
                aggregatable: { type: 'boolean' },
                default: {},
                values: strings,
                currency: text,
                precision: { type: 'integer' },
                scale: { type: 'integer' },
                validation: { type: 'object', additionalProperties: true },
                target: {
                  type: 'object',
                  required: ['entity', 'path'],
                  properties: { entity: text, path: text },
                  additionalProperties: false,
                },
              },
              additionalProperties: false,
            },
          },
          transitions: {
            type: 'array',
            items: {
              type: 'object',
              required: ['name', 'from', 'to', 'permission', 'allowed', 'path'],
              properties: {
                name: text,
                from: strings,
                to: text,
                permission: text,
                allowed: { type: 'boolean' },
                path: text,
              },
              additionalProperties: false,
            },
          },
        },
        additionalProperties: false,
      },
    },
    menu: { type: 'array', items: { type: 'object', additionalProperties: true } },
    dashboards: { type: 'array', items: { type: 'object', additionalProperties: true } },
    permissions: strings,
  },
  additionalProperties: false,
};

const WIDGETS: Readonly<Record<string, string>> = {
  string: 'text',
  text: 'textarea',
  email: 'email',
  oneOf: 'select',
  boolean: 'switch',
  int: 'number',
  decimal: 'decimal',
  money: 'money',
  date: 'date',
  dateTime: 'datetime',
  belongsTo: 'relation',
};
const FILTERABLE = ['string', 'email', 'oneOf', 'int', 'boolean', 'date', 'dateTime', 'belongsTo'];

interface StaticField {
  readonly descriptor: Record<string, unknown>;
  readonly name: string;
  readonly writable: boolean;
  readonly read: string | undefined;
  readonly update: string | undefined;
}

interface StaticEntity {
  readonly def: EntityDef<string>;
  readonly path: string;
  readonly fields: readonly StaticField[];
  readonly transitions: readonly { name: string; from: readonly string[]; to: string; permission: string }[];
  readonly permissions: Readonly<Record<'read' | 'create' | 'update' | 'delete', string>>;
}

function fieldOf(def: EntityDef<string>, field: ApiField, create: JsonSchema, read: JsonSchema): StaticField {
  const declared: FieldDef = field.def;
  const properties = (writable: boolean): Record<string, unknown> => {
    const source = writable ? create['properties'] : read['properties'];
    return typeof source === 'object' && source !== null ? Object.fromEntries(Object.entries(source)) : {};
  };
  const requiredKeys = Array.isArray(create['required']) ? create['required'] : [];
  const indexed = (declared.index === true || declared.unique === true) && FILTERABLE.includes(declared.kind);
  const validation = properties(field.writable)[field.key];
  const permissions = def.permissions.fields?.[field.name];
  return {
    name: field.name,
    writable: field.writable,
    read: permissions?.read,
    update: permissions?.update,
    descriptor: {
      key: field.key,
      kind: declared.kind,
      widget: field.writable ? (WIDGETS[declared.kind] ?? 'text') : 'readonly',
      required: field.writable && requiredKeys.includes(field.key),
      readOnly: !field.writable,
      filterable: indexed,
      sortable: indexed && declared.optional !== true,
      ...(declared.aggregatable === true ? { aggregatable: true } : {}),
      ...(declared.default === undefined ? {} : { default: declared.default }),
      ...(declared.values === undefined ? {} : { values: [...declared.values] }),
      ...(declared.currency === undefined ? {} : { currency: declared.currency }),
      ...(declared.precision === undefined ? {} : { precision: declared.precision }),
      ...(declared.scale === undefined ? {} : { scale: declared.scale }),
      ...(typeof validation === 'object' && validation !== null ? { validation } : {}),
      ...(declared.kind === 'belongsTo' && declared.target !== undefined
        ? { target: { entity: declared.target().name, path: pathOf(declared.target()) } }
        : {}),
    },
  };
}

function staticOf(def: EntityDef<string>): StaticEntity {
  const create = toJsonSchema(def, 'create');
  const read = toJsonSchema(def, 'read');
  const machine = Object.values(def.fields).find((field) => field.kind === 'state' && field.transitions !== undefined);
  const base = pathOf(def);
  return {
    def,
    path: base,
    fields: apiFields(def).map((field) => fieldOf(def, field, create, read)),
    transitions: Object.entries(machine?.transitions ?? {}).map(([name, declared]) => ({
      name,
      from: declared.from,
      to: declared.to,
      permission: declared.permission ?? permissionOf(def, 'update'),
    })),
    permissions: {
      read: permissionOf(def, 'read'),
      create: permissionOf(def, 'create'),
      update: permissionOf(def, 'update'),
      delete: permissionOf(def, 'delete'),
    },
  };
}

/**
 * Serves `/api/v1/_meta` for the entities that have an API. The part of an entity that does not depend on the caller is made here, once,
 * and each request filters it by what the caller may do (META-03, META-04).
 */
export function registerMeta(server: HttpServer, entities: readonly EntityDef<string>[]): void {
  const prepared = entities
    .filter((def) => Object.values(def.api).some((on) => on === true))
    .map(staticOf)
    .toSorted((a, b) => a.def.name.localeCompare(b.def.name));

  server.route({
    method: 'GET',
    url: '/api/v1/_meta',
    public: true,
    schema: { response: { 200: META_SCHEMA } },
    handler: async (ctx) => {
      if (ctx.principal === undefined) {
        throw new HttpError('HTTP_UNAUTHENTICATED', 401, 'Sign in to do this.', 'Send a valid session or API key.');
      }
      const answers = new Map<string, boolean>();
      const can = async (permission: string): Promise<boolean> => {
        const known = answers.get(permission);
        if (known !== undefined) return known;
        const answer = await ctx.can(permission);
        answers.set(permission, answer);
        return answer;
      };
      const out: unknown[] = [];
      for (const entity of prepared) {
        const { def, permissions } = entity;
        if (!(await can(permissions.read))) continue;
        const mayUpdate = await can(permissions.update);
        const fields: Record<string, unknown>[] = [];
        const form: string[] = [];
        for (const field of entity.fields) {
          if (field.read !== undefined && !(await can(field.read))) continue;
          const readOnly = !field.writable || !mayUpdate || (field.update !== undefined && !(await can(field.update)));
          const key = String(field.descriptor['key']);
          fields.push({ ...field.descriptor, readOnly, ...(readOnly && field.writable ? { widget: 'readonly' } : {}) });
          if (!readOnly) form.push(key);
        }
        const keys = fields.map((field) => String(field['key']));
        const transitions = [];
        for (const transition of entity.transitions) {
          transitions.push({
            name: transition.name,
            from: [...transition.from],
            to: transition.to,
            permission: transition.permission,
            allowed: await can(transition.permission),
            path: `${entity.path}/{id}/actions/${transition.name}`,
          });
        }
        out.push({
          name: def.name,
          path: entity.path,
          label: { ...def.label },
          operations: {
            list: def.api.list === true,
            get: def.api.get === true,
            create: def.api.create === true,
            update: def.api.update === true,
            delete: def.api.delete === true,
          },
          can: {
            read: true,
            create: await can(permissions.create),
            update: mayUpdate,
            delete: await can(permissions.delete),
          },
          features: [...def.features],
          softDelete: def.softDelete,
          tenant: def.tenant,
          ...(def.admin.title === undefined ? {} : { title: def.admin.title }),
          ...(def.admin.icon === undefined ? {} : { icon: def.admin.icon }),
          list: (def.admin.list ?? keys.slice(0, 5)).filter((key) => keys.includes(key)),
          fields,
          form,
          transitions,
        });
      }
      return {
        schemaVersion: META_SCHEMA_VERSION,
        entities: out,
        menu: [],
        dashboards: [],
        permissions: [...answers]
          .filter(([, granted]) => granted)
          .map(([permission]) => permission)
          .toSorted((a, b) => a.localeCompare(b)),
      };
    },
  });
}
