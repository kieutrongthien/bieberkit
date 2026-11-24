/**
 * BieberKit
 *
 * @file        packages/auth/src/profile.dialects.test.ts
 * @description Tests of versioned disabled-user and identity fields, per-source uniqueness and Better Auth profile round-trips (BPL-01, IDN-01).
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
import { uuid7 } from '@bieberkit/data';
import { runInUnitOfWork } from '@bieberkit/data/orm';
import type { Database } from '@bieberkit/data/orm';
import { createAuth } from './better-auth.ts';
import { AUTH_PLUGIN } from './roles.ts';
import { AuthUser } from './tables.ts';
import { describeDialects } from './testing/dialects.ts';

const NOW = new Date('2026-11-25T00:00:00.000Z');

async function makeUser(db: Database, email: string): Promise<string> {
  const id = uuid7();
  await runInUnitOfWork(db, async (em) => {
    em.create(AuthUser, { id, name: 'An', email, emailVerified: false, createdAt: NOW, updatedAt: NOW });
    await em.flush();
  });
  return id;
}

async function setIdentity(db: Database, email: string, source: string, externalId: string | null): Promise<void> {
  await db.orm.em
    .getConnection()
    .execute('update bk_auth_users set source = ?, external_id = ? where email = ?', [source, externalId, email]);
}

describeDialects('BPL-01 and IDN-01 the user profile', ({ open }) => {
  it('BPL-01 the steps at 0.5.0 add the columns, and the ledger lists them', async () => {
    const db = await open([]);
    await expect(
      db.orm.em
        .getConnection()
        .execute(
          'select disabled_at, disabled_reason, disabled_by, source, external_id from bk_auth_users where 1 = 0',
        ),
    ).resolves.toEqual([]);
    const ledger: { step_id: string; kind: string }[] = await db.orm.em
      .getConnection()
      .execute('select step_id, kind from bk_plugin_migrations where plugin = ? and version = ?', [
        AUTH_PLUGIN,
        '0.5.0',
      ]);
    expect(ledger.map((row) => row.step_id).toSorted()).toEqual([
      'users-disabled-at',
      'users-disabled-by',
      'users-disabled-reason',
      'users-external-id',
      'users-source',
      'users-source-external-index',
    ]);
    expect(ledger.every((row) => row.kind === 'expand')).toBe(true);
  });

  it('IDN-01 a new user has source "local" and no external id', async () => {
    const db = await open([]);
    const id = await makeUser(db, 'local@example.test');
    await runInUnitOfWork(db, async (em) => {
      const user = await em.findOneOrFail(AuthUser, { id });
      expect(Reflect.get(user, 'source')).toBe('local');
      expect(Reflect.get(user, 'externalId') ?? null).toBeNull();
      expect(Reflect.get(user, 'disabledAt') ?? null).toBeNull();
      expect(Reflect.get(user, 'disabledReason') ?? null).toBeNull();
      expect(Reflect.get(user, 'disabledBy') ?? null).toBeNull();
    });
    const rows: { source: string; external_id: string | null }[] = await db.orm.em
      .getConnection()
      .execute('select source, external_id from bk_auth_users where email = ?', ['local@example.test']);
    expect(rows).toEqual([{ source: 'local', external_id: null }]);
  });

  it('IDN-01 two users cannot share a source and an external id, and any number have none', async () => {
    const db = await open([]);
    await makeUser(db, 'first@example.test');
    await setIdentity(db, 'first@example.test', 'scim:okta', 'person-42');
    await makeUser(db, 'duplicate@example.test');
    await expect(setIdentity(db, 'duplicate@example.test', 'scim:okta', 'person-42')).rejects.toThrow(
      /bk_auth_users_source_external_unique|unique constraint failed: bk_auth_users.source, bk_auth_users.external_id/i,
    );
    // The external identifier is scoped to its provider, not globally unique.
    await makeUser(db, 'other-source@example.test');
    await setIdentity(db, 'other-source@example.test', 'sso:entra', 'person-42');
    for (const email of ['null-one@example.test', 'null-two@example.test', 'null-three@example.test']) {
      await makeUser(db, email);
      await setIdentity(db, email, 'scim:okta', null);
    }
    const empty: { external_id: string | null }[] = await db.orm.em
      .getConnection()
      .execute('select external_id from bk_auth_users where source = ? and external_id is null', ['scim:okta']);
    expect(empty).toEqual([{ external_id: null }, { external_id: null }, { external_id: null }]);
    const named: { source: string }[] = await db.orm.em
      .getConnection()
      .execute('select source from bk_auth_users where external_id = ?', ['person-42']);
    expect(named.map((row) => row.source).toSorted()).toEqual(['scim:okta', 'sso:entra']);
  });

  it('IDN-01 source cannot be null', async () => {
    const db = await open([]);
    await makeUser(db, 'required-source@example.test');
    await expect(
      db.orm.em
        .getConnection()
        .execute('update bk_auth_users set source = null where email = ?', ['required-source@example.test']),
    ).rejects.toThrow(/not.null|null value|cannot be null/i);
  });

  it('BPL-01 Better Auth gives disabledAt and source on the session user', async () => {
    const db = await open([]);
    const auth = createAuth({ db, dialect: db.dialect, secret: 'x'.repeat(40), baseUrl: 'https://app.test' });
    const response = await auth.api.signUpEmail({
      body: { name: 'An', email: 'session-profile@example.test', password: 'correct-test-password' },
      headers: new Headers({ origin: 'https://app.test' }),
      asResponse: true,
    });
    expect(response.status).toBe(200);
    const cookie = response.headers
      .getSetCookie()
      .find((line) => line.startsWith('__Host-bk_session='))
      ?.split(';')[0];
    expect(cookie).toBeDefined();
    if (cookie === undefined) throw new Error('Expected the sign-up response to set the session cookie');
    await db.orm.em
      .getConnection()
      .execute('update bk_auth_users set disabled_at = ? where email = ?', [
        '2026-11-25 00:00:00',
        'session-profile@example.test',
      ]);
    const session: unknown = await auth.api.getSession({ headers: new Headers({ cookie }) });
    expect(session).toMatchObject({ user: { source: 'local', disabledAt: expect.any(Date) } });
  });
});
