/**
 * BieberKit
 *
 * @file        packages/http/src/openapi.ts
 * @description The OpenAPI 3.1 document that is made from the routes of the server, and the route that serves it (API-06, API-16).
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

import { STATUS_CODES } from 'node:http';
import type { JsonSchema } from '@bieberkit/data/schema';
import type { RouteDef } from './route.ts';
import type { HttpServer } from './server.ts';

export interface OpenApiInfo {
  readonly title: string;
  readonly version: string;
}

export type OpenApiDocument = Record<string, unknown>;

export const OPENAPI_URL = '/api/v1/openapi.json';
const DOCS_PERMISSION = 'system.api-docs';

/** The problem of RFC 9457 as the server writes it (MOD-17). */
const PROBLEM: JsonSchema = {
  type: 'object',
  required: ['type', 'title', 'status', 'detail', 'code', 'traceId'],
  properties: {
    type: { type: 'string' },
    title: { type: 'string' },
    status: { type: 'integer' },
    detail: { type: 'string' },
    code: { type: 'string' },
    traceId: { type: 'string' },
    instance: { type: 'string' },
    fix: { type: 'string' },
    errors: {
      type: 'array',
      items: {
        type: 'object',
        required: ['path', 'code', 'message'],
        properties: { path: { type: 'string' }, code: { type: 'string' }, message: { type: 'string' } },
      },
    },
  },
  additionalProperties: true,
};

/** A schema as OpenAPI wants it: JSON Schema 2020-12 is its dialect, and the identity of a document is not part of a component. */
function clean(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(clean);
  if (typeof value !== 'object' || value === null) return value;
  return Object.fromEntries(
    Object.entries(value)
      .filter(([key]) => key !== '$schema' && key !== '$id')
      .map(([key, item]) => [key, clean(item)]),
  );
}

const pascal = (text: string): string =>
  text
    .split(/[-_]/)
    .filter((part) => part !== '')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join('');

function pathOf(url: string): string {
  return url.replaceAll(/:([A-Za-z0-9_]+)/g, '{$1}');
}

function operationIdOf(method: string, path: string): string {
  const parts = path
    .split('/')
    .filter((part) => part !== '' && part !== 'api' && !/^v\d+$/.test(part))
    .map((part) => (part.startsWith('{') ? `By${pascal(part.slice(1, -1))}` : pascal(part)));
  return `${method.toLowerCase()}${parts.join('')}`;
}

function parametersOf(route: RouteDef): unknown[] {
  const found: unknown[] = [];
  const add = (place: 'path' | 'query', schema: JsonSchema | undefined): void => {
    if (schema === undefined) return;
    const properties = schema['properties'];
    const required = Array.isArray(schema['required']) ? schema['required'] : [];
    if (typeof properties === 'object' && properties !== null) {
      for (const [name, property] of Object.entries(properties).toSorted(([a], [b]) => a.localeCompare(b))) {
        found.push({ name, in: place, required: place === 'path' || required.includes(name), schema: clean(property) });
      }
    }
    if (place === 'query' && typeof schema['patternProperties'] === 'object' && schema['patternProperties'] !== null) {
      found.push({
        name: 'filter',
        in: 'query',
        style: 'deepObject',
        explode: true,
        description:
          'filter[field][op]=value, with op one of eq, ne, in, lt, lte, gt, gte and null. Only indexed fields.',
        schema: { type: 'object', additionalProperties: { type: 'object', additionalProperties: { type: 'string' } } },
      });
    }
  };
  add('path', route.schema.params);
  add('query', route.schema.query);
  if (route.requiresIfMatch === true) {
    found.push({
      name: 'If-Match',
      in: 'header',
      required: true,
      schema: { type: 'string' },
      description: 'The ETag or the version that was read (API-13).',
    });
  }
  if (route.idempotent === true) {
    found.push({ name: 'Idempotency-Key', in: 'header', required: false, schema: { type: 'string', maxLength: 255 } });
  }
  return found;
}

function operationOf(route: RouteDef, path: string): Record<string, unknown> {
  const responses: Record<string, unknown> = {};
  for (const [status, schema] of Object.entries(route.schema.response).toSorted(([a], [b]) => Number(a) - Number(b))) {
    const body = schema['type'] === 'null';
    responses[status] = {
      description: STATUS_CODES[Number(status)] ?? 'Response',
      ...(body ? {} : { content: { 'application/json': { schema: clean(schema) } } }),
    };
  }
  responses['default'] = {
    description: 'An error, as a problem of RFC 9457.',
    content: { 'application/problem+json': { schema: { $ref: '#/components/schemas/Problem' } } },
  };
  const parameters = parametersOf(route);
  const tag = path.split('/')[3];
  return {
    operationId: operationIdOf(route.method, path),
    ...(tag === undefined ? {} : { tags: [tag] }),
    ...(parameters.length === 0 ? {} : { parameters }),
    ...(route.schema.body === undefined
      ? {}
      : { requestBody: { required: true, content: { 'application/json': { schema: clean(route.schema.body) } } } }),
    responses,
    security: route.public === true ? [] : [{ session: [] }, { apiKey: [] }],
    ...(route.permission === undefined ? {} : { 'x-permission': route.permission }),
    ...(route.deprecated === undefined ? {} : { deprecated: true }),
    ...(route.deprecated?.sunset === undefined ? {} : { 'x-sunset': route.deprecated.sunset }),
  };
}

/**
 * The OpenAPI 3.1 document of `routes`. Every route is an operation, with its parameters, its body, its responses and an error as a
 * problem. The same routes give the same bytes, whatever the order in which they were added.
 */
export function openApiDocument(routes: readonly RouteDef[], info: OpenApiInfo): OpenApiDocument {
  const paths: Record<string, Record<string, unknown>> = {};
  const used = new Set<string>();
  const sorted = routes
    .filter((route) => route.url !== OPENAPI_URL)
    .toSorted((a, b) => (a.url === b.url ? a.method.localeCompare(b.method) : a.url.localeCompare(b.url)));
  const tags = new Set<string>();
  for (const route of sorted) {
    const path = pathOf(route.url);
    const operation = operationOf(route, path);
    let id = String(operation['operationId']);
    for (let n = 2; used.has(id); n += 1) id = `${String(operation['operationId'])}${n}`;
    used.add(id);
    operation['operationId'] = id;
    const tag = path.split('/')[3];
    if (tag !== undefined) tags.add(tag);
    (paths[path] ??= {})[route.method.toLowerCase()] = operation;
  }
  return {
    openapi: '3.1.0',
    info: { title: info.title, version: info.version },
    tags: [...tags].toSorted((a, b) => a.localeCompare(b)).map((name) => ({ name })),
    paths,
    components: {
      schemas: { Problem: PROBLEM },
      securitySchemes: {
        apiKey: { type: 'http', scheme: 'bearer', description: 'An API key.' },
        session: { type: 'apiKey', in: 'cookie', name: '__Host-bk_session' },
      },
    },
  };
}

/** Serves `openapi.json`: public outside production and with `API_DOCS_PUBLIC`, and for the permission `system.api-docs` otherwise (API-06). */
export function registerOpenApi(server: HttpServer, info: OpenApiInfo): void {
  let document: OpenApiDocument | undefined;
  server.route({
    method: 'GET',
    url: OPENAPI_URL,
    ...(server.docsPublic ? { public: true as const } : { permission: DOCS_PERMISSION }),
    schema: { response: { 200: { type: 'object', additionalProperties: true } } },
    handler: () => {
      document ??= openApiDocument(server.routes(), info);
      return document;
    },
  });
}
