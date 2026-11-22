/**
 * BieberKit
 *
 * @file        packages/auth/src/tables.dialects.test.ts
 * @description Tests of the auth tables that Better Auth uses: the steps and the schemas agree, ids are UUIDs, and a deleted user takes its sessions and accounts with it (AUTH-09, AUTH-10, DATA-24).
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
import { uuid7 } from '@bieberkit/data';
import { runInUnitOfWork } from '@bieberkit/data/orm';
import { AUTH_PLUGIN, authEntities, authMigrationSteps } from './roles.ts';
import { AuthAccount, AuthRateLimit, AuthSession, AuthUser, AuthVerification } from './tables.ts';
import { describeDialects } from './testing/dialects.ts';

const NOW = new Date('2026-11-23T10:00:00.000Z');
const LATER = new Date('2026-11-24T10:00:00.000Z');

describe('AUTH-09 the steps and the schemas', () => {
  it('AUTH-09 the five tables are in the entities and have steps at version 0.2.0', () => {
    expect(authEntities).toEqual(
      expect.arrayContaining([AuthUser, AuthSession, AuthAccount, AuthVerification, AuthRateLimit]),
    );
    const steps = authMigrationSteps.filter((step) => step.version === '0.2.0');
    expect(steps.length).toBeGreaterThanOrEqual(5);
    expect(steps.every((step) => step.plugin === AUTH_PLUGIN && step.kind === 'expand')).toBe(true);
  });
});

describeDialects('AUTH-09 the auth tables', ({ open }) => {
  const makeUser = async (db: Awaited<ReturnType<typeof open>>, email = 'a@example.vn') => {
    const id = uuid7();
    await runInUnitOfWork(db, async (em) => {
      em.create(AuthUser, { id, name: 'An', email, emailVerified: false, createdAt: NOW, updatedAt: NOW });
      await em.flush();
    });
    return id;
  };

  it('DATA-24 the steps made the five tables, and the ledger has them', async () => {
    const db = await open([]);
    for (const table of ['auth_users', 'auth_sessions', 'auth_accounts', 'auth_verifications', 'auth_rate_limits']) {
      await expect(db.orm.em.getConnection().execute(`select * from ${table} where 1 = 0`)).resolves.toEqual([]);
    }
    const ledger: { step_id: string }[] = await db.orm.em
      .getConnection()
      .execute(`select step_id from bieberkit_plugin_migrations where plugin = '${AUTH_PLUGIN}' and version = '0.2.0'`);
    expect(ledger.map((row) => row.step_id).toSorted((a, b) => a.localeCompare(b))).toEqual(
      authMigrationSteps
        .filter((step) => step.version === '0.2.0')
        .map((step) => step.id)
        .toSorted((a, b) => a.localeCompare(b)),
    );
  });

  it('AUTH-10 a user, a session and an account are written and read through the schemas', async () => {
    const db = await open([]);
    const userId = await makeUser(db);
    await runInUnitOfWork(db, async (em) => {
      em.create(AuthSession, {
        id: uuid7(),
        userId,
        token: 't-1',
        expiresAt: LATER,
        createdAt: NOW,
        updatedAt: NOW,
        ipAddress: '203.0.113.1',
        userAgent: 'test',
      });
      em.create(AuthAccount, {
        id: uuid7(),
        userId,
        externalId: userId,
        providerId: 'credential',
        password: 'salt:hash',
        createdAt: NOW,
        updatedAt: NOW,
      });
      await em.flush();
    });
    const rows: { external_account_ref: string }[] = await db.orm.em
      .getConnection()
      .execute('select external_account_ref from auth_accounts');
    expect(rows).toHaveLength(1);
    const columns: unknown[] = await db.orm.em.getConnection().execute('select * from auth_accounts where 1 = 0');
    expect(columns).toEqual([]);
  });

  it('AUTH-10 the column of the external account is not called account_id', async () => {
    const db = await open([]);
    await expect(db.orm.em.getConnection().execute('select account_id from auth_accounts')).rejects.toBeInstanceOf(
      Error,
    );
  });

  it('DATA-14 an id that is not a UUID is refused before the database sees it', async () => {
    const db = await open([]);
    await expect(
      runInUnitOfWork(db, async (em) => {
        em.create(AuthUser, {
          id: 'not-a-uuid',
          name: 'x',
          email: 'x@example.vn',
          emailVerified: false,
          createdAt: NOW,
          updatedAt: NOW,
        });
        await em.flush();
      }),
    ).rejects.toMatchObject({ code: 'DATA_UUID_INVALID' });
  });

  it('AUTH-10 an email is unique, and so is a session token', async () => {
    const db = await open([]);
    const userId = await makeUser(db, 'same@example.vn');
    await expect(makeUser(db, 'same@example.vn')).rejects.toBeInstanceOf(Error);
    const session = (token: string) =>
      runInUnitOfWork(db, async (em) => {
        em.create(AuthSession, { id: uuid7(), userId, token, expiresAt: LATER, createdAt: NOW, updatedAt: NOW });
        await em.flush();
      });
    await session('one');
    await expect(session('one')).rejects.toBeInstanceOf(Error);
  });

  it('AUTH-09 deleting a user deletes its sessions and its accounts', async () => {
    const db = await open([]);
    const userId = await makeUser(db);
    await runInUnitOfWork(db, async (em) => {
      em.create(AuthSession, { id: uuid7(), userId, token: 't-2', expiresAt: LATER, createdAt: NOW, updatedAt: NOW });
      em.create(AuthAccount, {
        id: uuid7(),
        userId,
        externalId: userId,
        providerId: 'credential',
        createdAt: NOW,
        updatedAt: NOW,
      });
      await em.flush();
    });
    await runInUnitOfWork(db, async (em) => {
      await em.nativeDelete(AuthUser, { id: userId });
    });
    for (const table of ['auth_users', 'auth_sessions', 'auth_accounts']) {
      expect(await db.orm.em.getConnection().execute(`select * from ${table}`)).toEqual([]);
    }
  });

  it('AUTH-06 a rate limit counter has a unique key', async () => {
    const db = await open([]);
    const make = () =>
      runInUnitOfWork(db, async (em) => {
        em.create(AuthRateLimit, { id: uuid7(), key: '203.0.113.1/sign-in/email', count: 1, lastRequest: Date.now() });
        await em.flush();
      });
    await make();
    await expect(make()).rejects.toBeInstanceOf(Error);
  });
});
