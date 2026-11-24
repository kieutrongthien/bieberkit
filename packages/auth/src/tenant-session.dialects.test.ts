/**
 * BieberKit
 *
 * @file        packages/auth/src/tenant-session.dialects.test.ts
 * @description Tests that the tenant is never kept in the session and that Better Auth loads no organization plugin (AUTH-10, DATA-19, ADR 0021).
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
import { AuthSession } from './tables.ts';
import { authServer } from './testing/auth-server.ts';
import { describeDialects } from './testing/dialects.ts';

describeDialects('AUTH-10 the tenant is not in the session', ({ open }) => {
  it('AUTH-10 the table of sessions has no column for a tenant or an organization, and no table of the organization plugin exists', async () => {
    const app = await authServer(open);
    const properties = Object.keys(app.db.orm.getMetadata().get(AuthSession).properties);
    expect(properties.filter((name) => /tenant|organi[sz]ation/i.test(name))).toEqual([]);
    const tables = (await app.db.orm.schema.getCreateSchemaSQL()).toLowerCase();
    for (const name of [
      'auth_organizations',
      'auth_members',
      'auth_invitations',
      'auth_teams',
      'organization',
      'invitation',
    ]) {
      expect(tables).not.toMatch(new RegExp(`create table (if not exists )?[\`"]?${name}[\`"]?[ (]`));
    }
  });

  it('DATA-19 a signed in user who names another tenant in each request is a member of that tenant for that request only', async () => {
    const app = await authServer(open);
    const { id, cookie } = await app.login('an@example.vn');
    const before = await app.rows('select * from auth_sessions');
    await app.send('GET', '/api/v1/crm/deals', { cookie, tenant: '0190f6b2-7c4e-7000-8000-0000000000a1' });
    await app.send('GET', '/api/v1/crm/deals', { cookie, tenant: '0190f6b2-7c4e-7000-8000-0000000000a2' });
    expect(await app.rows('select * from auth_sessions')).toEqual(before);
    expect(id).toMatch(/^[0-9a-f-]{36}$/);
  });
});
