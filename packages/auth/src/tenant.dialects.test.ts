/**
 * BieberKit
 *
 * @file        packages/auth/src/tenant.dialects.test.ts
 * @description Tests of the tenant resolver: X-Tenant is taken for a user who has a role in that tenant, and from nothing else (DATA-19, AUTHZ-04).
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
import { createTenantResolver } from './tenant.ts';
import { authServer, TENANT_A, TENANT_B } from './testing/auth-server.ts';
import { describeDialects } from './testing/dialects.ts';

const info = (tenant?: string) => ({
  method: 'GET',
  path: '/api/v1/crm/deals',
  headers: tenant === undefined ? {} : { 'x-tenant': tenant },
  ip: '127.0.0.1',
});

describeDialects('DATA-19 the tenant of a request', ({ open }) => {
  it('DATA-19 is the tenant of X-Tenant when the user has a role in it', async () => {
    const app = await authServer(open);
    const { id } = await app.login('an@example.vn');
    await app.grant(id, ['crm.deal.read'], TENANT_A);
    const resolver = createTenantResolver({ db: app.db });
    expect(await resolver.resolve(info(TENANT_A), { id, kind: 'user', via: 'cookie' })).toBe(TENANT_A);
    expect(await resolver.resolve(info(TENANT_A.toUpperCase()), { id, kind: 'user', via: 'cookie' })).toBe(TENANT_A);
  });

  it('DATA-19 is none without the header, whoever the user is', async () => {
    const app = await authServer(open);
    const { id } = await app.login('an@example.vn');
    await app.grant(id, ['crm.deal.read'], TENANT_A);
    expect(
      await createTenantResolver({ db: app.db }).resolve(info(), { id, kind: 'user', via: 'cookie' }),
    ).toBeUndefined();
  });

  it('DATA-19 is refused with 403 when the user has no role in the tenant, and when his roles are in another tenant', async () => {
    const app = await authServer(open);
    const { id } = await app.login('an@example.vn');
    await app.grant(id, ['crm.deal.read'], TENANT_A);
    const resolver = createTenantResolver({ db: app.db });
    await expect(resolver.resolve(info(TENANT_B), { id, kind: 'user', via: 'cookie' })).rejects.toMatchObject({
      code: 'AUTH_TENANT_FORBIDDEN',
      status: 403,
    });
    const other = await app.login('other@example.vn');
    await expect(resolver.resolve(info(TENANT_A), { id: other.id, kind: 'user', via: 'cookie' })).rejects.toMatchObject(
      { code: 'AUTH_TENANT_FORBIDDEN' },
    );
  });

  it('DATA-19 is refused with 400 when the header is not a UUID', async () => {
    const app = await authServer(open);
    const { id } = await app.login('an@example.vn');
    await expect(
      createTenantResolver({ db: app.db }).resolve(info('acme'), { id, kind: 'user', via: 'cookie' }),
    ).rejects.toMatchObject({ code: 'AUTH_TENANT_INVALID', status: 400 });
  });

  it('DATA-19 is none for a request with no principal, because nothing proves the membership', async () => {
    const app = await authServer(open);
    expect(await createTenantResolver({ db: app.db }).resolve(info(TENANT_A), undefined)).toBeUndefined();
  });

  it('DATA-19 a change of the roles shows in the next request: there is no cache of the membership', async () => {
    const app = await authServer(open);
    const { id } = await app.login('an@example.vn');
    const resolver = createTenantResolver({ db: app.db });
    await expect(resolver.resolve(info(TENANT_A), { id, kind: 'user', via: 'cookie' })).rejects.toMatchObject({
      code: 'AUTH_TENANT_FORBIDDEN',
    });
    await app.grant(id, ['crm.deal.read'], TENANT_A);
    expect(await resolver.resolve(info(TENANT_A), { id, kind: 'user', via: 'cookie' })).toBe(TENANT_A);
  });
});
