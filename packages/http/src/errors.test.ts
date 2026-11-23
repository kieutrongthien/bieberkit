/**
 * BieberKit
 *
 * @file        packages/http/src/errors.test.ts
 * @description Tests of the RFC 9457 problems that every failure of the server becomes (MOD-17, SEC-07, REQ-02).
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

import { BkError, createMemoryReporter } from '@bieberkit/core';
import { dataError } from '@bieberkit/data';
import { describe, expect, it } from 'vitest';
import { okRoute, testServer, TEST_ENV } from './testing.ts';

const SECRET = 'database password is hunter2';

function problemOf(body: string): Record<string, unknown> {
  const parsed: unknown = JSON.parse(body);
  if (typeof parsed !== 'object' || parsed === null) throw new Error('not a problem');
  return Object.fromEntries(Object.entries(parsed));
}

function throwing(url: string, error: unknown) {
  return okRoute(url, {
    handler: () => {
      throw error;
    },
  });
}

describe('MOD-17 errors become problems', () => {
  it('MOD-17 a BkError gives its status, code and safe message, as application/problem+json', async () => {
    const { server } = testServer();
    server.route(
      throwing('/api/v1/t/a', new BkError(SECRET, { code: 'X_FAIL', status: 409, safeMessage: 'Cannot do that.' })),
    );
    const response = await server.inject({ method: 'GET', url: '/api/v1/t/a?x=1' });
    expect(response.statusCode).toBe(409);
    expect(response.headers['content-type']).toContain('application/problem+json');
    const problem = problemOf(response.body);
    expect(problem).toMatchObject({
      type: 'urn:bieberkit:error:X_FAIL',
      title: 'Conflict',
      status: 409,
      detail: 'Cannot do that.',
      code: 'X_FAIL',
      instance: '/api/v1/t/a',
    });
    expect(String(problem['traceId'])).toMatch(/^[0-9a-f]{32}$/);
    expect(response.body).not.toContain('hunter2');
  });

  it('MOD-17 an error of the data layer keeps its status, such as 412 for a stale version', async () => {
    const { server } = testServer();
    server.route(throwing('/api/v1/t/b', dataError('DATA_VERSION_STALE', 412, 'Changed by someone else.', 'Reload.')));
    const response = await server.inject({ method: 'GET', url: '/api/v1/t/b' });
    expect(response.statusCode).toBe(412);
    expect(problemOf(response.body)).toMatchObject({ code: 'DATA_VERSION_STALE', title: 'Precondition Failed' });
  });

  it('MOD-17 any other error is a 500 that says nothing about its cause, and is reported', async () => {
    const reporter = createMemoryReporter();
    const { server, logger } = testServer({ errorReporter: reporter });
    const failure = new Error(SECRET);
    server.route(throwing('/api/v1/t/c', failure));
    const response = await server.inject({ method: 'GET', url: '/api/v1/t/c' });
    expect(response.statusCode).toBe(500);
    expect(problemOf(response.body)).toMatchObject({ code: 'HTTP_INTERNAL', detail: 'Something went wrong.' });
    expect(response.body).not.toContain('hunter2');
    expect(reporter.reports).toHaveLength(1);
    expect(reporter.reports[0]?.error).toBe(failure);
    expect(reporter.reports[0]?.context).toMatchObject({
      source: 'http',
      http: { method: 'GET', path: '/api/v1/t/c', status: 500 },
    });
    expect(reporter.reports[0]?.context.requestId).toBeTruthy();
    expect(logger.lines.some((line) => line.level === 'error')).toBe(true);
  });

  it('MOD-17 a BkError with status 400 or 404 is not reported as a bug', async () => {
    const reporter = createMemoryReporter();
    const { server } = testServer({ errorReporter: reporter });
    server.route(throwing('/api/v1/t/d', new BkError('x', { code: 'X_NOT_FOUND', status: 404 })));
    await server.inject({ method: 'GET', url: '/api/v1/t/d' });
    expect(reporter.reports).toEqual([]);
  });

  it('MOD-17 a BkError with status 500 is reported', async () => {
    const reporter = createMemoryReporter();
    const { server } = testServer({ errorReporter: reporter });
    server.route(throwing('/api/v1/t/e', new BkError('x', { code: 'X_BUG' })));
    await server.inject({ method: 'GET', url: '/api/v1/t/e' });
    expect(reporter.reports).toHaveLength(1);
  });

  it('OBS-06 a reporter that throws does not change the answer of the request', async () => {
    const { server } = testServer({
      errorReporter: {
        report: () => {
          throw new Error('the reporter is broken');
        },
        flush: async () => false,
      },
    });
    server.route(throwing('/api/v1/t/g', new Error('boom')));
    const response = await server.inject({ method: 'GET', url: '/api/v1/t/g' });
    expect(response.statusCode).toBe(500);
    expect(problemOf(response.body)).toMatchObject({ code: 'HTTP_INTERNAL' });
  });

  it('MOD-17 the fix of an error is shown outside production only', async () => {
    const error = new BkError('x', { code: 'X_FAIL', status: 409, fix: 'Set DATABASE_URL.' });
    const dev = testServer();
    dev.server.route(throwing('/api/v1/t/f', error));
    expect(problemOf((await dev.server.inject({ method: 'GET', url: '/api/v1/t/f' })).body)).toMatchObject({
      fix: 'Set DATABASE_URL.',
    });
    const prod = testServer({}, { ...TEST_ENV, APP_ENV: 'production' });
    prod.server.route(throwing('/api/v1/t/f', error));
    expect(problemOf((await prod.server.inject({ method: 'GET', url: '/api/v1/t/f' })).body)).not.toHaveProperty('fix');
  });
});

describe('SEC-07 failures of the request itself', () => {
  const body = {
    type: 'object',
    properties: { name: { type: 'string', minLength: 2 } },
    required: ['name'],
    additionalProperties: false,
  };

  function validating() {
    const { server } = testServer();
    server.route({
      method: 'POST',
      url: '/api/v1/t/items/:id',
      public: true,
      schema: {
        params: { type: 'object', properties: { id: { type: 'integer' } }, required: ['id'] },
        query: { type: 'object', properties: { size: { type: 'integer', maximum: 100 } }, additionalProperties: false },
        body,
        response: { 200: { type: 'object', properties: { ok: { type: 'boolean' } } } },
      },
      handler: () => ({ ok: true }),
    });
    return server;
  }

  it('SEC-07 a validation failure lists every problem with its place and rule', async () => {
    const response = await validating().inject({
      method: 'POST',
      url: '/api/v1/t/items/abc?size=500&nope=1',
      payload: { name: 'a', extra: 1 },
    });
    expect(response.statusCode).toBe(400);
    const problem = problemOf(response.body);
    expect(problem).toMatchObject({ code: 'HTTP_VALIDATION_FAILED' });
    const errors = problem['errors'];
    expect(errors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ path: 'params.id', code: 'type' }),
        expect.objectContaining({ path: 'query.size', code: 'maximum' }),
        expect.objectContaining({ path: 'query.nope', code: 'additionalProperties' }),
        expect.objectContaining({ path: 'body.name', code: 'minLength' }),
        expect.objectContaining({ path: 'body.extra', code: 'additionalProperties' }),
      ]),
    );
    for (const issue of Array.isArray(errors) ? errors : []) expect(issue).toHaveProperty('message');
  });

  it('SEC-07 a missing required field is named by its path', async () => {
    const response = await validating().inject({ method: 'POST', url: '/api/v1/t/items/1', payload: {} });
    expect(problemOf(response.body)['errors']).toEqual([
      expect.objectContaining({ path: 'body.name', code: 'required' }),
    ]);
  });

  it('SEC-07 a body that is not JSON is 400 HTTP_BODY_INVALID', async () => {
    const response = await validating().inject({
      method: 'POST',
      url: '/api/v1/t/items/1',
      headers: { 'content-type': 'application/json' },
      payload: '{"name": ',
    });
    expect(response.statusCode).toBe(400);
    expect(problemOf(response.body)).toMatchObject({ code: 'HTTP_BODY_INVALID' });
  });

  it('API-03 a body over the limit is 413 HTTP_BODY_TOO_LARGE', async () => {
    const { server } = testServer({ bodyLimit: 64 });
    server.route({
      ...okRoute('/api/v1/t/big'),
      method: 'POST',
      schema: { body: { type: 'object' }, response: { 200: { type: 'object' } } },
    });
    const response = await server.inject({ method: 'POST', url: '/api/v1/t/big', payload: { text: 'x'.repeat(200) } });
    expect(response.statusCode).toBe(413);
    expect(problemOf(response.body)).toMatchObject({ code: 'HTTP_BODY_TOO_LARGE' });
  });

  it('SEC-07 a content type that is not JSON is 415', async () => {
    const response = await validating().inject({
      method: 'POST',
      url: '/api/v1/t/items/1',
      headers: { 'content-type': 'text/plain' },
      payload: 'name=Ann',
    });
    expect(response.statusCode).toBe(415);
    expect(problemOf(response.body)).toMatchObject({ code: 'HTTP_UNSUPPORTED_MEDIA_TYPE' });
  });

  it('SEC-07 a path that no route has is a 404 problem, with a request id', async () => {
    const { server } = testServer();
    const response = await server.inject({ method: 'GET', url: '/api/v1/nothing/here' });
    expect(response.statusCode).toBe(404);
    expect(problemOf(response.body)).toMatchObject({ code: 'HTTP_NOT_FOUND', status: 404 });
    expect(response.headers['x-request-id']).toBeDefined();
  });

  it('API-01 a query is coerced and a body is not', async () => {
    const { server } = testServer();
    server.route({
      method: 'POST',
      url: '/api/v1/t/coerce',
      public: true,
      schema: {
        query: { type: 'object', properties: { n: { type: 'integer' } } },
        body: { type: 'object', properties: { n: { type: 'integer' } } },
        response: { 200: { type: 'object', properties: { query: { type: 'integer' } } } },
      },
      handler: (ctx) => ({ query: ctx.query['n'] }),
    });
    const ok = await server.inject({ method: 'POST', url: '/api/v1/t/coerce?n=10', payload: {} });
    expect(JSON.parse(ok.body)).toEqual({ query: 10 });
    const bad = await server.inject({ method: 'POST', url: '/api/v1/t/coerce', payload: { n: '10' } });
    expect(bad.statusCode).toBe(400);
  });
});
