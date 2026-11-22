/**
 * BieberKit
 *
 * @file        packages/http/src/access.test.ts
 * @description Tests of the access port: the answer of ctx.access, its default without an authorizer that has it, and the status and the code that the onResponse hook sees (AUTHZ-02, AUTHZ-05).
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
import { HttpError } from './problem.ts';
import type { AccessAnswer, Principal } from './ports.ts';
import type { StageContext } from './server.ts';
import { testServer } from './testing.ts';

const USER: Principal = { id: 'u1', kind: 'user', via: 'token' };
const ANSWER: AccessAnswer = {
  allowed: true,
  scope: { assignee: 'u1' },
  readable: new Set(['a']),
  writable: new Set(['b']),
};

const echo = (url: string, permission = 'x.read') =>
  ({
    method: 'GET',
    url,
    permission,
    schema: { response: { 200: { type: 'object', additionalProperties: true } } },
    handler: async (ctx: { access(entity: string, action: string): Promise<AccessAnswer> }) => {
      const answer = await ctx.access('x.Thing', 'read');
      return {
        allowed: answer.allowed,
        reason: answer.reason ?? null,
        scope: answer.scope ?? null,
        readable: answer.readable === undefined ? null : [...answer.readable],
        writable: answer.writable === undefined ? null : [...answer.writable],
      };
    },
  }) as const;

describe('AUTHZ-02 ctx.access', () => {
  it('AUTHZ-02 asks the authorizer, with the principal, the entity, the action and the request', async () => {
    const seen: unknown[] = [];
    const { server } = testServer({
      authenticator: { authenticate: async () => USER },
      authorizer: {
        can: async () => true,
        access: async (principal, entity, action, request) => (
          seen.push([principal.id, entity, action, request.path]),
          ANSWER
        ),
      },
    });
    server.route(echo('/api/v1/x/things'));
    const response = await server.inject({ method: 'GET', url: '/api/v1/x/things' });
    expect(response.statusCode).toBe(200);
    expect(JSON.parse(response.body)).toEqual({
      allowed: true,
      reason: null,
      scope: { assignee: 'u1' },
      readable: ['a'],
      writable: ['b'],
    });
    expect(seen).toEqual([['u1', 'x.Thing', 'read', '/api/v1/x/things']]);
  });

  it('AUTHZ-02 an authorizer with no access method allows everything, with no scope and every field', async () => {
    const { server } = testServer({
      authenticator: { authenticate: async () => USER },
      authorizer: { can: async () => true },
    });
    server.route(echo('/api/v1/x/things'));
    const body = JSON.parse((await server.inject({ method: 'GET', url: '/api/v1/x/things' })).body);
    expect(body).toEqual({ allowed: true, reason: null, scope: null, readable: null, writable: null });
  });

  it('AUTHZ-04 with an authorizer and no principal, the answer is a denial', async () => {
    const { server } = testServer({ authorizer: { can: async () => true, access: async () => ANSWER } });
    const { permission: _permission, ...route } = echo('/api/v1/x/open');
    server.route({ ...route, public: true });
    const body = JSON.parse((await server.inject({ method: 'GET', url: '/api/v1/x/open' })).body);
    expect(body).toMatchObject({ allowed: false, reason: 'no-permission' });
  });
});

function watch(): { server: ReturnType<typeof testServer>['server']; seen: StageContext[] } {
  const seen: StageContext[] = [];
  const { server } = testServer({
    authenticator: { authenticate: async () => USER },
    authorizer: { can: async () => true },
  });
  server.stage('onResponse', (context) => void seen.push(context));
  return { server, seen };
}

describe('AUTHZ-05 what the onResponse hook sees', () => {
  it('AUTHZ-05 has the status of the answer, and no code when it went well', async () => {
    const { server, seen } = watch();
    server.route(echo('/api/v1/x/things'));
    await server.inject({ method: 'GET', url: '/api/v1/x/things' });
    expect(seen).toHaveLength(1);
    expect(seen[0]).toMatchObject({ status: 200, principal: { id: 'u1' } });
    expect(seen[0]?.code).toBeUndefined();
  });

  it('AUTHZ-05 has the code of the problem when the request failed', async () => {
    const { server, seen } = watch();
    server.route({
      ...echo('/api/v1/x/fail'),
      handler: () => {
        throw new HttpError('AUTHZ_DENIED', 403, 'No.', 'Ask for the permission.');
      },
    });
    await server.inject({ method: 'GET', url: '/api/v1/x/fail' });
    expect(seen[0]).toMatchObject({ status: 403, code: 'AUTHZ_DENIED' });
  });

  it('AUTHZ-05 has the code of a failure of the pipeline, such as a route permission that is refused', async () => {
    const { server } = testServer({
      authenticator: { authenticate: async () => USER },
      authorizer: { can: async () => false },
    });
    const seen: StageContext[] = [];
    server.stage('onResponse', (context) => void seen.push(context));
    server.route(echo('/api/v1/x/things'));
    await server.inject({ method: 'GET', url: '/api/v1/x/things' });
    expect(seen[0]).toMatchObject({ status: 403, code: 'HTTP_FORBIDDEN' });
  });
});

describe('AUTHZ-05 a hook of onResponse is finished when inject answers', () => {
  it('AUTHZ-05 inject and stop wait for the hooks that run after the answer, so what they write is not lost', async () => {
    const { server } = testServer({
      authenticator: { authenticate: async () => USER },
      authorizer: { can: async () => true },
    });
    const written: string[] = [];
    server.stage('onResponse', async () => {
      await new Promise((resolve) => setTimeout(resolve, 40));
      written.push('audit');
    });
    server.route(echo('/api/v1/x/things'));
    await server.inject({ method: 'GET', url: '/api/v1/x/things' });
    expect(written).toEqual(['audit']);
  });
});
