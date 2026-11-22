/**
 * BieberKit
 *
 * @file        packages/http/src/openapi.test.ts
 * @description Tests of the OpenAPI 3.1 document that is made from the routes, and of who may read it (API-06, API-16).
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

import { describe, expect, it } from 'vitest';
import { entityApp } from './entity-app.ts';
import { openApiDocument, registerOpenApi } from './openapi.ts';
import { okRoute, TEST_ENV, testServer } from './testing.ts';

const INFO = { title: 'Test API', version: '1.2.3' };

interface Operation {
  operationId?: string;
  parameters?: { name: string; in: string; required?: boolean; style?: string }[];
  requestBody?: { content: Record<string, { schema: Record<string, unknown> }> };
  responses?: Record<string, { content?: Record<string, { schema: Record<string, unknown> }> }>;
  security?: unknown[];
  deprecated?: boolean;
  'x-permission'?: string;
  'x-sunset'?: string;
}
interface Doc {
  openapi: string;
  info: { title: string; version: string };
  paths: Record<string, Record<string, Operation>>;
  components: { schemas: Record<string, unknown>; securitySchemes: Record<string, unknown> };
}

async function documentOf(): Promise<Doc> {
  const app = await entityApp();
  return JSON.parse(JSON.stringify(openApiDocument(app.server.routes(), INFO)));
}

describe('API-06 the document', () => {
  it('API-06 is OpenAPI 3.1 and carries the title and the version', async () => {
    const doc = await documentOf();
    expect(doc.openapi).toBe('3.1.0');
    expect(doc.info).toEqual(INFO);
  });

  it('API-06 has an operation for every route of the entities, with {id} in the path', async () => {
    const doc = await documentOf();
    expect(Object.keys(doc.paths['/api/v1/crm/accounts'] ?? {}).toSorted((a, b) => a.localeCompare(b))).toEqual([
      'get',
      'post',
    ]);
    expect(Object.keys(doc.paths['/api/v1/crm/accounts/{id}'] ?? {}).toSorted((a, b) => a.localeCompare(b))).toEqual([
      'delete',
      'get',
      'patch',
    ]);
    expect(doc.paths['/api/v1/crm/accounts/{id}/actions/open']?.['post']).toBeDefined();
    expect(doc.paths['/api/v1/crm/accounts/bulk']?.['post']).toBeDefined();
  });

  it('API-06 leaves out the probes of the server and the document itself', async () => {
    const app = await entityApp();
    registerOpenApi(app.server, INFO);
    const document: Doc = JSON.parse(JSON.stringify(openApiDocument(app.server.routes(), INFO)));
    const paths = Object.keys(document.paths);
    expect(paths.some((path) => path.startsWith('/health'))).toBe(false);
    expect(paths).not.toContain('/api/v1/openapi.json');
  });

  it('API-06 every operation has its own operationId', async () => {
    const doc = await documentOf();
    const ids = Object.values(doc.paths).flatMap((methods) =>
      Object.values(methods).map((operation) => operation.operationId),
    );
    expect(ids.every((id) => typeof id === 'string' && id !== '')).toBe(true);
    expect(new Set(ids).size).toBe(ids.length);
    expect(doc.paths['/api/v1/crm/accounts/{id}']?.['get']?.operationId).toBe('getCrmAccountsById');
  });

  it('API-06 turns params and query into parameters, and the filters into one deepObject', async () => {
    const doc = await documentOf();
    const one = doc.paths['/api/v1/crm/accounts/{id}']?.['get'];
    expect(one?.parameters).toEqual(
      expect.arrayContaining([expect.objectContaining({ name: 'id', in: 'path', required: true })]),
    );
    const list = doc.paths['/api/v1/crm/accounts']?.['get'];
    const names = (list?.parameters ?? []).map((parameter) => parameter.name);
    expect(names).toEqual(
      expect.arrayContaining(['pageSize', 'page', 'cursor', 'sort', 'include', 'fields', 'withTotal', 'filter']),
    );
    expect(list?.parameters?.find((parameter) => parameter.name === 'filter')).toMatchObject({
      in: 'query',
      style: 'deepObject',
    });
  });

  it('API-06 has the request body and the responses of each status, as JSON Schema', async () => {
    const doc = await documentOf();
    const create = doc.paths['/api/v1/crm/accounts']?.['post'];
    expect(create?.requestBody?.content['application/json']?.schema).toMatchObject({
      type: 'object',
      additionalProperties: false,
    });
    expect(create?.responses?.['201']?.content?.['application/json']?.schema).toMatchObject({ type: 'object' });
    expect(Object.keys(doc.paths['/api/v1/crm/accounts/{id}']?.['delete']?.responses ?? {})).toEqual(
      expect.arrayContaining(['204', 'default']),
    );
    expect(JSON.stringify(doc)).not.toContain('"$schema"');
    expect(JSON.stringify(doc)).not.toContain('"$id"');
  });

  it('MOD-17 every operation answers an error as a problem', async () => {
    const doc = await documentOf();
    for (const methods of Object.values(doc.paths)) {
      for (const operation of Object.values(methods)) {
        expect(operation.responses?.['default']?.content?.['application/problem+json']?.schema).toEqual({
          $ref: '#/components/schemas/Problem',
        });
      }
    }
    expect(doc.components.schemas['Problem']).toMatchObject({
      type: 'object',
      required: expect.arrayContaining(['code', 'status', 'traceId']),
    });
  });

  it('API-02 a route with a permission has security and x-permission, and a public route has none', async () => {
    const { server } = testServer();
    server.route(okRoute('/api/v1/t/open'));
    const { public: _public, ...secured } = okRoute('/api/v1/t/closed');
    server.route({ ...secured, permission: 'crm.thing.read' });
    const doc: Doc = JSON.parse(JSON.stringify(openApiDocument(server.routes(), INFO)));
    expect(doc.paths['/api/v1/t/open']?.['get']?.security).toEqual([]);
    expect(doc.paths['/api/v1/t/closed']?.['get']).toMatchObject({
      'x-permission': 'crm.thing.read',
      security: [{ session: [] }, { apiKey: [] }],
    });
    expect(Object.keys(doc.components.securitySchemes)).toEqual(['apiKey', 'session']);
  });

  it('API-16 a deprecated route is listed as deprecated, with its sunset date', async () => {
    const { server } = testServer();
    server.route(okRoute('/api/v1/t/old', { deprecated: { since: '2026-01-01', sunset: '2027-06-30' } }));
    const doc: Doc = JSON.parse(JSON.stringify(openApiDocument(server.routes(), INFO)));
    expect(doc.paths['/api/v1/t/old']?.['get']).toMatchObject({ deprecated: true, 'x-sunset': '2027-06-30' });
  });

  it('API-06 gives the same bytes for the same routes, whatever the order they were added in', async () => {
    const one = testServer();
    const two = testServer();
    one.server.route(okRoute('/api/v1/t/a'));
    one.server.route(okRoute('/api/v1/t/b'));
    two.server.route(okRoute('/api/v1/t/b'));
    two.server.route(okRoute('/api/v1/t/a'));
    expect(JSON.stringify(openApiDocument(one.server.routes(), INFO))).toBe(
      JSON.stringify(openApiDocument(two.server.routes(), INFO)),
    );
  });
});

describe('API-06 who may read it', () => {
  it('API-06 is public in development and test', async () => {
    const { server } = testServer({});
    registerOpenApi(server, INFO);
    server.route(okRoute('/api/v1/t/a'));
    const response = await server.inject({ method: 'GET', url: '/api/v1/openapi.json' });
    expect(response.statusCode).toBe(200);
    expect(response.headers['content-type']).toContain('application/json');
    expect(JSON.parse(response.body)).toMatchObject({ openapi: '3.1.0', paths: { '/api/v1/t/a': expect.anything() } });
    expect(response.headers['etag']).toBeDefined();
  });

  it('API-06 in production it needs the permission system.api-docs', async () => {
    const env = { ...TEST_ENV, APP_ENV: 'production' } as const;
    const anonymous = testServer({}, env);
    registerOpenApi(anonymous.server, INFO);
    expect((await anonymous.server.inject({ method: 'GET', url: '/api/v1/openapi.json' })).statusCode).toBe(401);

    const denied = testServer(
      {
        authenticator: { authenticate: async () => ({ id: 'u', kind: 'user', via: 'token' }) },
        authorizer: { can: async () => false },
      },
      env,
    );
    registerOpenApi(denied.server, INFO);
    expect((await denied.server.inject({ method: 'GET', url: '/api/v1/openapi.json' })).statusCode).toBe(403);

    const asked: string[] = [];
    const allowed = testServer(
      {
        authenticator: { authenticate: async () => ({ id: 'u', kind: 'user', via: 'token' }) },
        authorizer: { can: async (_p, permission) => (asked.push(permission), true) },
      },
      env,
    );
    registerOpenApi(allowed.server, INFO);
    expect((await allowed.server.inject({ method: 'GET', url: '/api/v1/openapi.json' })).statusCode).toBe(200);
    expect(asked).toEqual(['system.api-docs']);
  });

  it('API-06 in production it is public when API_DOCS_PUBLIC is true', async () => {
    const { server } = testServer({}, { ...TEST_ENV, APP_ENV: 'production', API_DOCS_PUBLIC: true });
    registerOpenApi(server, INFO);
    expect((await server.inject({ method: 'GET', url: '/api/v1/openapi.json' })).statusCode).toBe(200);
  });

  it('API-08 answers 304 when the document did not change', async () => {
    const { server } = testServer();
    registerOpenApi(server, INFO);
    const first = await server.inject({ method: 'GET', url: '/api/v1/openapi.json' });
    const again = await server.inject({
      method: 'GET',
      url: '/api/v1/openapi.json',
      headers: { 'if-none-match': String(first.headers['etag']) },
    });
    expect(again.statusCode).toBe(304);
  });
});
