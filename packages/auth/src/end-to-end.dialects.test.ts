/**
 * BieberKit
 *
 * @file        packages/auth/src/end-to-end.dialects.test.ts
 * @description End to end test: a user signs up and signs in through the API, and the cookie opens the entity routes with the roles of the tenant that X-Tenant names (AUTH-01, DATA-19, AUTHZ-02).
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

import { expect, it } from 'vitest';
import { authServer, TENANT_A, TENANT_B } from './testing/auth-server.ts';
import type { AuthServer, ServerReply } from './testing/auth-server.ts';
import { describeDialects } from './testing/dialects.ts';

const DEALS = '/api/v1/crm/deals';

const codes = (reply: ServerReply): string[] => {
  const data = reply.body['data'];
  return (Array.isArray(data) ? data : [])
    .map((row: unknown) => (typeof row === 'object' && row !== null && 'code' in row ? String(row.code) : ''))
    .toSorted((a, b) => a.localeCompare(b));
};

async function world(open: Parameters<typeof authServer>[0]): Promise<{ app: AuthServer; id: string; cookie: string }> {
  const app = await authServer(open);
  const { id, cookie } = await app.login('an@example.vn');
  await app.seed(TENANT_A, [
    { code: 'D1', assignee: id, amount: 100 },
    { code: 'D2', assignee: 'someone-else', amount: 2000 },
  ]);
  await app.seed(TENANT_B, [{ code: 'B1', assignee: id, amount: 5000 }]);
  return { app, id, cookie };
}

describeDialects('AUTH-01 sign up, sign in and the entity routes', ({ open }) => {
  it('AUTHZ-02 a user whose role reads every row sees the rows of the tenant that he names, and none of another', async () => {
    const { app, id, cookie } = await world(open);
    await app.grant(id, ['crm.deal.read'], TENANT_A);
    expect(codes(await app.send('GET', DEALS, { cookie, tenant: TENANT_A }))).toEqual(['D1', 'D2']);
  });

  it('AUTHZ-02 a user whose role reads only his own rows sees those, and the scope uses the id of the user from the session', async () => {
    const { app, id, cookie } = await world(open);
    await app.grant(id, ['crm.deal.read-own'], TENANT_A);
    expect(codes(await app.send('GET', DEALS, { cookie, tenant: TENANT_A }))).toEqual(['D1']);
  });

  it('DATA-19 a tenant that the user has no role in is 403, and so is a tenant that he names wrongly, before any row is read', async () => {
    const { app, id, cookie } = await world(open);
    await app.grant(id, ['crm.deal.read'], TENANT_A);
    const reply = await app.send('GET', DEALS, { cookie, tenant: TENANT_B });
    expect([reply.status, reply.body['code']]).toEqual([403, 'AUTH_TENANT_FORBIDDEN']);
    expect((await app.send('GET', DEALS, { cookie, tenant: 'acme' })).status).toBe(400);
  });

  it('DATA-19 a request with no X-Tenant has no tenant, and a tenant entity refuses it', async () => {
    const { app, id, cookie } = await world(open);
    await app.grant(id, ['crm.deal.read'], TENANT_A);
    const reply = await app.send('GET', DEALS, { cookie });
    expect(reply.status).toBeGreaterThanOrEqual(400);
    expect(reply.status).toBeLessThan(500);
  });

  it('AUTH-01 a request with no cookie is 401, and one with the cookie of a signed out session is 401', async () => {
    const { app, id, cookie } = await world(open);
    await app.grant(id, ['crm.deal.read'], TENANT_A);
    expect((await app.send('GET', DEALS, { tenant: TENANT_A })).status).toBe(401);
    await app.api('POST', '/sign-out', { cookie, payload: {} });
    expect((await app.send('GET', DEALS, { cookie, tenant: TENANT_A })).status).toBe(401);
  });

  it('AUTHZ-04 a signed in user with no role is 403, and the refusal is audited with the id of the user', async () => {
    const { app, id, cookie } = await world(open);
    const reply = await app.send('GET', DEALS, { cookie, tenant: TENANT_A });
    expect(reply.status).toBe(403);
    expect(
      (await app.audit()).filter((entry) => entry.action === 'authz.denied').map((entry) => entry.actorId),
    ).toEqual([id]);
  });

  it('SEC-03 a change by the cookie needs the same origin, and works with it', async () => {
    const { app, id, cookie } = await world(open);
    await app.grant(id, ['crm.deal.create', 'crm.deal.read'], TENANT_A);
    const body = { code: 'N1', title: 'x' };
    const refused = await app.send('POST', DEALS, {
      cookie,
      tenant: TENANT_A,
      payload: body,
      crossSite: true,
      headers: { origin: 'https://evil.test' },
    });
    expect([refused.status, refused.body['code']]).toEqual([403, 'HTTP_CSRF_FAILED']);
    expect((await app.send('POST', DEALS, { cookie, tenant: TENANT_A, payload: body })).status).toBe(201);
  });

  it('AUTHZ-01 a change of the roles of the user shows at once in the next request, with the same cookie', async () => {
    const { app, id, cookie } = await world(open);
    expect((await app.send('GET', DEALS, { cookie, tenant: TENANT_A })).status).toBe(403);
    await app.grant(id, ['crm.deal.read'], TENANT_A);
    expect((await app.send('GET', DEALS, { cookie, tenant: TENANT_A })).status).toBe(200);
  });

  it('AUTH-09 the routes of the API and the routes of the auth share one database and one pool: many requests at once work', async () => {
    const { app, id, cookie } = await world(open);
    await app.grant(id, ['crm.deal.read'], TENANT_A);
    const replies = await Promise.all(
      Array.from({ length: 10 }, () => app.send('GET', DEALS, { cookie, tenant: TENANT_A })),
    );
    expect(replies.map((reply) => reply.status)).toEqual(Array.from({ length: 10 }, () => 200));
  });
});
