/**
 * BieberKit
 *
 * @file        packages/auth/src/authorizer.dialects.test.ts
 * @description Tests of the authorizer of the HTTP server: route permissions, the answer of access, tenant isolation, the ability of one request and the audit of a denial (AUTHZ-01, AUTHZ-04, AUTHZ-05).
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
import { runAsTenant, runInUnitOfWork } from '@bieberkit/data/orm';
import type { RequestInfo } from '@bieberkit/http';
import { Deal } from './testing/sample.ts';
import { AuthRolePermission } from './roles.ts';
import { DEALS, TENANT_A, TENANT_B, USERS, authApp, rowOf } from './testing/app.ts';
import { describeDialects } from './testing/dialects.ts';

const INFO: RequestInfo = { method: 'GET', path: '/', headers: {}, ip: '127.0.0.1' };
const principal = (name: keyof typeof USERS) => ({ id: USERS[name], kind: 'user', via: 'token' }) as const;
const inTenant = <T>(tenant: string, run: () => Promise<T>): Promise<T> => runAsTenant(tenant, run);

describeDialects('AUTHZ-04 the authorizer can()', ({ open }) => {
  it('AUTHZ-04 answers a permission of an entity by the grants of the caller in the tenant', async () => {
    const app = await authApp(open);
    await app.grant('reader', ['crm.deal.read']);
    expect(await inTenant(TENANT_A, () => app.authorizer.can(principal('reader'), 'crm.deal.read', INFO))).toBe(true);
    expect(await inTenant(TENANT_A, () => app.authorizer.can(principal('reader'), 'crm.deal.update', INFO))).toBe(
      false,
    );
    expect(await inTenant(TENANT_B, () => app.authorizer.can(principal('reader'), 'crm.deal.read', INFO))).toBe(false);
    expect(await inTenant(TENANT_A, () => app.authorizer.can(principal('none'), 'crm.deal.read', INFO))).toBe(false);
  });

  it('AUTHZ-02 a scoped permission passes the route that asks for the read of the entity', async () => {
    const app = await authApp(open);
    await app.grant('owner', ['crm.deal.read-own']);
    expect(await inTenant(TENANT_A, () => app.authorizer.can(principal('owner'), 'crm.deal.read', INFO))).toBe(true);
    expect(await inTenant(TENANT_A, () => app.authorizer.can(principal('owner'), 'crm.deal.update', INFO))).toBe(false);
  });

  it('AUTHZ-01 a plain capability is answered by its name', async () => {
    const app = await authApp(open);
    await app.grant('reader', ['system.api-docs']);
    expect(await inTenant(TENANT_A, () => app.authorizer.can(principal('reader'), 'system.api-docs', INFO))).toBe(true);
    expect(await inTenant(TENANT_A, () => app.authorizer.can(principal('reader'), 'system.other', INFO))).toBe(false);
  });

  it('AUTHZ-04 a permission that the registry does not know and that nobody was granted is denied', async () => {
    const app = await authApp(open);
    expect(await inTenant(TENANT_A, () => app.authorizer.can(principal('admin'), 'crm.deal.anything', INFO))).toBe(
      false,
    );
  });
});

describeDialects('AUTHZ-01 the ability of one request', ({ open }) => {
  it('AUTHZ-01 loads the grants once for a request that asks several times, and not again for the next request', async () => {
    const app = await authApp(open);
    await app.grant('admin', ['crm.deal.read', 'crm.deal.update']);
    const countRoleReads = () => app.queries.filter((text) => /bk_auth_user_roles/.test(text)).length;
    const before = countRoleReads();
    // One list asks for the route permission and for the scope: two questions, one load.
    expect((await app.as('admin').get(DEALS)).status).toBe(200);
    expect(countRoleReads() - before).toBe(1);
    expect((await app.as('admin').get(DEALS)).status).toBe(200);
    expect(countRoleReads() - before).toBe(2);
  });

  it('AUTHZ-01 a change of roles shows in the next request, with no cache between requests', async () => {
    const app = await authApp(open);
    const role = await app.grant('reader', ['crm.deal.read']);
    expect((await app.as('reader').get(DEALS)).status).toBe(200);
    await runInUnitOfWork(app.db, async (em) => {
      await em.nativeDelete(AuthRolePermission, { roleId: role });
    });
    expect((await app.as('reader').get(DEALS)).status).toBe(403);
  });

  it('AUTHZ-01 two requests at the same time keep their own abilities', async () => {
    const app = await authApp(open);
    await app.grant('admin', ['crm.deal.read']);
    const replies = await Promise.all(
      Array.from({ length: 12 }, (_, index) => app.as(index % 2 === 0 ? 'admin' : 'none').get(DEALS)),
    );
    expect(replies.map((reply) => reply.status)).toEqual(
      Array.from({ length: 12 }, (_, index) => (index % 2 === 0 ? 200 : 403)),
    );
  });

  it('AUTHZ-01 does not keep the ability of a request that failed before its handler', async () => {
    const app = await authApp(open);
    await app.grant('admin', ['crm.deal.read']);
    expect((await app.as('admin').get(`${DEALS}/not-a-uuid`)).status).toBe(400);
    expect((await app.as('admin').get(DEALS)).status).toBe(200);
  });
});

describeDialects('AUTHZ-05 the audit of a denial', ({ open }) => {
  it('AUTHZ-05 a denial leaves an entry with the permission, the entity and the action, and not a value', async () => {
    const app = await authApp(open);
    const ids = await app.seed(TENANT_A, [{ code: 'D1', title: 'secret title' }]);
    await app.grant('reader', ['crm.deal.read']);
    const reply = await app.as('reader').patch(`${DEALS}/${ids['D1']}`, { title: 'new' }, 1);
    expect(reply.status).toBe(403);
    const entries = (await app.audit()).filter((row) => row.action === 'authz.denied');
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({ entity: 'crm.Deal', actorId: USERS.reader, tenant: TENANT_A });
    expect(entries[0]?.data).toMatchObject({ permission: 'crm.deal.update', action: 'update' });
    expect(JSON.stringify(entries[0])).not.toContain('secret title');
  });

  it('AUTHZ-05 the entry is written although the request failed, and an allowed request writes none', async () => {
    const app = await authApp(open);
    await app.grant('admin', ['crm.deal.read']);
    expect((await app.as('admin').get(DEALS)).status).toBe(200);
    expect((await app.audit()).filter((row) => row.action.startsWith('authz.'))).toEqual([]);
    expect((await app.as('none').get(DEALS)).status).toBe(403);
    expect((await app.audit()).filter((row) => row.action.startsWith('authz.'))).toHaveLength(1);
  });

  it('AUTHZ-05 a caller with no principal is 401 and writes no entry, as there is no actor', async () => {
    const app = await authApp(open);
    expect((await app.as(undefined).get(DEALS)).status).toBe(401);
    expect((await app.audit()).filter((row) => row.action.startsWith('authz.'))).toEqual([]);
  });

  it('AUTHZ-05 a failing audit write does not change the answer that the caller gets', async () => {
    const app = await authApp(open);
    await app.db.orm.em.getConnection().execute('drop table bk_audit_log');
    expect((await app.as('none').get(DEALS)).status).toBe(403);
  });
});

describeDialects('AUTHZ-04 the answer of access()', ({ open }) => {
  it('AUTHZ-02 gives the scope, the readable and the writable fields of the caller', async () => {
    const app = await authApp(open);
    await app.grant('owner', ['crm.deal.read-own', 'crm.deal.update-own', 'crm.deal.read-margin']);
    const answer = await inTenant(TENANT_A, () => app.authorizer.access?.(principal('owner'), Deal.name, 'read', INFO));
    expect(answer).toMatchObject({ allowed: true, scope: { assignee: USERS.owner } });
    expect(answer?.readable?.has('margin')).toBe(true);
    const write = await inTenant(TENANT_A, () =>
      app.authorizer.access?.(principal('owner'), Deal.name, 'update', INFO),
    );
    expect(write?.writable?.has('margin')).toBe(false);
    expect(write?.writable?.has('title')).toBe(true);
  });

  it('AUTHZ-04 denies an entity that the authorizer does not know', async () => {
    const app = await authApp(open);
    await app.grant('admin', ['crm.deal.read']);
    const answer = await inTenant(TENANT_A, () =>
      app.authorizer.access?.(principal('admin'), 'crm.Unknown', 'read', INFO),
    );
    expect(answer).toEqual({ allowed: false, reason: 'no-permission' });
  });

  it('AUTHZ-01 the row that a create returns has what the caller may read, and the id', async () => {
    const app = await authApp(open);
    await app.grant('admin', ['crm.deal.create', 'crm.deal.read']);
    const reply = await app.as('admin').post(DEALS, { code: 'N1', title: 'x' });
    expect(reply.status).toBe(201);
    expect(rowOf(reply)['id']).toBeDefined();
  });
});
