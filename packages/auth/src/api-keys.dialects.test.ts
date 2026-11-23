/**
 * BieberKit
 *
 * @file        packages/auth/src/api-keys.dialects.test.ts
 * @description Tests of the API keys for machine clients: shown once, stored hashed, scoped to permissions and one tenant, expiring, and revoked (AUTH-07, DATA-19, AUTHZ-04).
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
import { requestContext } from '@bieberkit/core';
import { uuid7 } from '@bieberkit/data';
import { runInUnitOfWork } from '@bieberkit/data/orm';
import type { ApiKeyInput } from './api-keys.ts';
import { createAuthenticator } from './authenticator.ts';
import { AuthApiKey, AuthUser } from './tables.ts';
import { createTenantResolver } from './tenant.ts';
import { authServer, TENANT_A, TENANT_B } from './testing/auth-server.ts';
import type { AuthServer } from './testing/auth-server.ts';
import { describeDialects } from './testing/dialects.ts';

const DEALS = '/api/v1/crm/deals';
const info = (headers: Record<string, string>) => ({ method: 'GET', path: DEALS, headers, ip: '127.0.0.1' });

async function world(open: Parameters<typeof authServer>[0], options: Parameters<typeof authServer>[1] = {}) {
  const app = await authServer(open, { apiKeys: true, ...options });
  const { id } = await app.login('owner@example.vn');
  await app.seed(TENANT_A, [
    { code: 'D1', amount: 100 },
    { code: 'D2', amount: 2000 },
  ]);
  await app.seed(TENANT_B, [{ code: 'B1', amount: 5000 }]);
  return { app, userId: id };
}

const codes = (reply: { body: Readonly<Record<string, unknown>> }): string[] =>
  (Array.isArray(reply.body['data']) ? reply.body['data'] : [])
    .map((row: unknown) => (typeof row === 'object' && row !== null && 'code' in row ? String(row.code) : ''))
    .toSorted((a, b) => a.localeCompare(b));

async function key(app: AuthServer, userId: string, permissions: string[], tenantId: string | undefined = TENANT_A) {
  return app.createKey({ userId, ...(tenantId === undefined ? {} : { tenantId }), name: 'ci', permissions });
}

describeDialects('AUTH-07 creating a key', ({ open }) => {
  it('AUTH-07 gives the key once, with the prefix bk_, and the database holds only a hash of it', async () => {
    const { app, userId } = await world(open);
    const created = await key(app, userId, ['crm.deal.read']);
    expect(created.key.startsWith('bk_')).toBe(true);
    expect(created.key.length).toBeGreaterThan(30);
    expect(JSON.stringify(await app.rows('select * from auth_api_keys'))).not.toContain(created.key);
    expect(await app.count('auth_api_keys')).toBe(1);
  });

  it('AUTH-07 writes an audit entry and an outbox event with the permissions and the expiry, and never the key', async () => {
    const { app, userId } = await world(open);
    const created = await requestContext.run({ requestId: uuid7(), userId }, () =>
      key(app, userId, ['crm.deal.read', 'crm.deal.update']),
    );
    const [entry] = (await app.audit()).filter((item) => item.action === 'auth.apikey.created');
    expect(entry?.actorId).toBe(userId);
    expect(entry?.data).toMatchObject({
      name: 'ci',
      permissions: ['crm.deal.read', 'crm.deal.update'],
      tenantId: TENANT_A,
      userId,
    });
    expect(JSON.stringify(entry)).not.toContain(created.key);
    expect(await app.outbox()).toContain('auth.apikey.created');
  });

  it('AUTH-07 expires: 90 days by default, and a day count outside 1 to 365 is refused', async () => {
    const { app, userId } = await world(open);
    const created = await key(app, userId, ['crm.deal.read']);
    const days = (new Date(created.expiresAt).getTime() - Date.now()) / 86_400_000;
    expect(days).toBeGreaterThan(89);
    expect(days).toBeLessThan(91);
    for (const expiresInDays of [0, 366, 1.5]) {
      await expect(
        app.createKey({ userId, tenantId: TENANT_A, name: 'x', permissions: ['a'], expiresInDays }),
      ).rejects.toMatchObject({ code: 'AUTH_APIKEY_INVALID', status: 400 });
    }
  });

  it('AUTH-07 refuses a key with no permission, a blank permission, a blank name, a tenant that is not a UUID and a user that does not exist', async () => {
    const { app, userId } = await world(open);
    const bad = (input: Partial<ApiKeyInput>) =>
      expect(
        app.createKey({ userId, tenantId: TENANT_A, name: 'x', permissions: ['a'], ...input }),
      ).rejects.toMatchObject({ code: 'AUTH_APIKEY_INVALID' });
    await bad({ permissions: [] });
    await bad({ permissions: ['a', ' '] });
    await bad({ name: '  ' });
    await bad({ tenantId: 'acme' });
    await bad({ userId: uuid7() });
    expect(await app.count('auth_api_keys')).toBe(0);
    expect(await app.audit()).not.toContainEqual(expect.objectContaining({ action: 'auth.apikey.created' }));
  });

  it('AUTH-07 a failure of the outbox takes the key back with the audit entry', async () => {
    const { app, userId } = await world(open);
    await app.rows('drop table bieberkit_outbox');
    await expect(key(app, userId, ['crm.deal.read'])).rejects.toBeInstanceOf(Error);
    expect(await app.count('auth_api_keys')).toBe(0);
  });

  it('SEC-07 the routes of Better Auth for keys are not served: a signed in user cannot make a key with the permissions that he likes', async () => {
    const { app } = await world(open);
    const { cookie } = await app.login('other@example.vn');
    for (const path of ['/api-key/create', '/api-key/update', '/api-key/delete', '/api-key/list', '/api-key/verify']) {
      const reply = await app.api('POST', path, {
        cookie,
        payload: { name: 'x', metadata: { permissions: ['*'], tenantId: TENANT_A } },
      });
      expect([path, reply.status]).toEqual([path, 404]);
    }
    expect(await app.count('auth_api_keys')).toBe(0);
  });
});

describeDialects('AUTH-07 the principal of a key', ({ open }) => {
  it('AUTH-07 is the key, with its permissions and its tenant, how it came, and no session', async () => {
    const { app, userId } = await world(open);
    const created = await key(app, userId, ['crm.deal.read']);
    const principal = await createAuthenticator(app.auth).authenticate(info({ 'x-api-key': created.key }));
    expect(principal).toEqual({
      id: created.id,
      kind: 'apiKey',
      via: 'token',
      grants: ['crm.deal.read'],
      tenantId: TENANT_A,
    });
  });

  it('AUTH-07 reads the key from Authorization: Bearer too, and the key wins over a cookie', async () => {
    const { app, userId } = await world(open);
    const created = await key(app, userId, ['crm.deal.read']);
    const authenticator = createAuthenticator(app.auth);
    expect((await authenticator.authenticate(info({ authorization: `Bearer ${created.key}` })))?.kind).toBe('apiKey');
    const { cookie } = await app.login('other@example.vn');
    expect((await authenticator.authenticate(info({ 'x-api-key': created.key, cookie })))?.kind).toBe('apiKey');
  });

  it('AUTH-07 is none for a key that is wrong, expired, revoked or switched off, and none for a bearer token that is not a key', async () => {
    const { app, userId } = await world(open);
    const authenticator = createAuthenticator(app.auth);
    const good = await key(app, userId, ['crm.deal.read']);
    expect(await authenticator.authenticate(info({ 'x-api-key': 'bk_forged' }))).toBeUndefined();
    expect(await authenticator.authenticate(info({ authorization: 'Bearer something-else' }))).toBeUndefined();
    const old = await key(app, userId, ['crm.deal.read']);
    await runInUnitOfWork(app.db, async (em) => {
      await em.nativeUpdate(AuthApiKey, { id: old.id }, { expiresAt: new Date('2020-01-01T00:00:00.000Z') });
    });
    expect(await authenticator.authenticate(info({ 'x-api-key': old.key }))).toBeUndefined();
    const off = await key(app, userId, ['crm.deal.read']);
    await runInUnitOfWork(app.db, async (em) => {
      await em.nativeUpdate(AuthApiKey, { id: off.id }, { enabled: false });
    });
    expect(await authenticator.authenticate(info({ 'x-api-key': off.key }))).toBeUndefined();
    await app.revokeKey(good.id);
    expect(await authenticator.authenticate(info({ 'x-api-key': good.key }))).toBeUndefined();
  });

  it('AUTH-07 asks nothing of the database when there is no key and no cookie', async () => {
    const { app } = await world(open);
    const before = app.queries.length;
    expect(await createAuthenticator(app.auth).authenticate(info({}))).toBeUndefined();
    expect(app.queries.length).toBe(before);
  });

  it('AUTH-07 is refused with 429 and Retry-After when the key is over its limit', async () => {
    const { app, userId } = await world(open, { apiKeys: { rateLimit: { window: 60, max: 2 } } });
    const created = await key(app, userId, ['crm.deal.read']);
    const statuses = [];
    for (let n = 0; n < 3; n += 1) {
      statuses.push((await app.send('GET', DEALS, { headers: { 'x-api-key': created.key } })).status);
    }
    expect(statuses).toEqual([200, 200, 429]);
  });
});

describeDialects('AUTH-07 a key on the entity routes', ({ open }) => {
  it('DATA-19 reads the rows of the tenant of the key, with no X-Tenant, and none of another tenant', async () => {
    const { app, userId } = await world(open);
    const created = await key(app, userId, ['crm.deal.read']);
    const reply = await app.send('GET', DEALS, { headers: { 'x-api-key': created.key } });
    expect(reply.status).toBe(200);
    expect(codes(reply)).toEqual(['D1', 'D2']);
  });

  it('DATA-19 an X-Tenant that is not the tenant of the key is 403, and the same one is fine', async () => {
    const { app, userId } = await world(open);
    const created = await key(app, userId, ['crm.deal.read']);
    const other = await app.send('GET', DEALS, { headers: { 'x-api-key': created.key }, tenant: TENANT_B });
    expect([other.status, other.body['code']]).toEqual([403, 'AUTH_TENANT_FORBIDDEN']);
    expect(
      (await app.send('GET', DEALS, { headers: { 'x-api-key': created.key }, tenant: TENANT_A.toUpperCase() })).status,
    ).toBe(200);
  });

  it('AUTHZ-04 a key has only its own permissions: it cannot write when it may only read, and the refusal is audited with the id of the key', async () => {
    const { app, userId } = await world(open);
    const created = await key(app, userId, ['crm.deal.read']);
    const reply = await app.send('POST', DEALS, {
      headers: { 'x-api-key': created.key },
      payload: { code: 'N1', title: 'x' },
    });
    expect(reply.status).toBe(403);
    expect(
      (await app.audit()).filter((entry) => entry.action === 'authz.denied').map((entry) => entry.actorId),
    ).toEqual([created.id]);
  });

  it('SEC-03 a key may change data with no CSRF token and no same origin, because no browser sends it by itself', async () => {
    const { app, userId } = await world(open);
    const created = await key(app, userId, ['crm.deal.read', 'crm.deal.create']);
    const reply = await app.send('POST', DEALS, {
      headers: { 'x-api-key': created.key, origin: 'https://other.test' },
      crossSite: true,
      payload: { code: 'N1', title: 'x' },
    });
    expect(reply.status).toBe(201);
  });

  it('AUTHZ-04 the roles of the user who owns the key give the key nothing', async () => {
    const { app, userId } = await world(open);
    await app.grant(userId, ['crm.deal.read', 'crm.deal.create', 'crm.deal.delete'], TENANT_A);
    const created = await key(app, userId, ['crm.deal.read']);
    expect(
      (await app.send('POST', DEALS, { headers: { 'x-api-key': created.key }, payload: { code: 'N2', title: 'x' } }))
        .status,
    ).toBe(403);
  });

  it('AUTH-05 a key is not stopped by the flag of MFA of a role, because it has no role', async () => {
    const { app, userId } = await world(open);
    await app.grant(userId, ['crm.deal.read'], TENANT_A, { requireMfa: true });
    const created = await key(app, userId, ['crm.deal.read']);
    expect((await app.send('GET', DEALS, { headers: { 'x-api-key': created.key } })).status).toBe(200);
  });

  it('AUTHZ-02 a condition sees the key as the user: a scoped permission gives the rows that name the key', async () => {
    const { app, userId } = await world(open);
    const created = await key(app, userId, ['crm.deal.read-own']);
    await app.seed(TENANT_A, [{ code: 'MINE', assignee: created.id, amount: 1 }]);
    expect(codes(await app.send('GET', DEALS, { headers: { 'x-api-key': created.key } }))).toEqual(['MINE']);
  });

  it('AUTH-07 revoking a key stops it at once, audits it, and revoking an unknown key is 404', async () => {
    const { app, userId } = await world(open);
    const created = await key(app, userId, ['crm.deal.read']);
    expect((await app.send('GET', DEALS, { headers: { 'x-api-key': created.key } })).status).toBe(200);
    await requestContext.run({ requestId: uuid7(), userId }, () => app.revokeKey(created.id));
    expect((await app.send('GET', DEALS, { headers: { 'x-api-key': created.key } })).status).toBe(401);
    expect((await app.audit()).find((entry) => entry.action === 'auth.apikey.revoked')?.actorId).toBe(userId);
    await expect(app.revokeKey(created.id)).rejects.toMatchObject({ code: 'AUTH_APIKEY_NOT_FOUND', status: 404 });
  });

  it('AUTH-07 a key does not outlive its user', async () => {
    const { app, userId } = await world(open);
    const created = await key(app, userId, ['crm.deal.read']);
    await runInUnitOfWork(app.db, async (em) => {
      await em.nativeDelete(AuthUser, { id: userId });
    });
    expect(await app.count('auth_api_keys')).toBe(0);
    expect((await app.send('GET', DEALS, { headers: { 'x-api-key': created.key } })).status).toBe(401);
  });
});

const headers = (tenant?: string) => ({
  method: 'GET',
  path: DEALS,
  headers: tenant === undefined ? {} : { 'x-tenant': tenant },
  ip: '127.0.0.1',
});

describeDialects('DATA-19 the tenant of a key', ({ open }) => {
  it('DATA-19 the resolver gives the tenant of the key, and refuses another one that the request names', async () => {
    const { app } = await world(open);
    const resolver = createTenantResolver({ db: app.db });
    const principal = { id: uuid7(), kind: 'apiKey', via: 'token', tenantId: TENANT_A, grants: ['x'] } as const;
    expect(await resolver.resolve(headers(), principal)).toBe(TENANT_A);
    expect(await resolver.resolve(headers(TENANT_A), principal)).toBe(TENANT_A);
    await expect(resolver.resolve(headers(TENANT_B), principal)).rejects.toMatchObject({
      code: 'AUTH_TENANT_FORBIDDEN',
    });
  });

  it('DATA-19 a key with no tenant has none, and refuses an X-Tenant', async () => {
    const { app } = await world(open);
    const resolver = createTenantResolver({ db: app.db });
    const principal = { id: uuid7(), kind: 'apiKey', via: 'token', grants: ['x'] } as const;
    expect(
      await resolver.resolve({ method: 'GET', path: DEALS, headers: {}, ip: '127.0.0.1' }, principal),
    ).toBeUndefined();
    await expect(
      resolver.resolve({ method: 'GET', path: DEALS, headers: { 'x-tenant': TENANT_A }, ip: '127.0.0.1' }, principal),
    ).rejects.toMatchObject({ code: 'AUTH_TENANT_FORBIDDEN' });
  });
});
