/**
 * BieberKit
 *
 * @file        packages/auth/src/impersonation.dialects.test.ts
 * @description Tests of the audit of impersonation: both ids and the reason are kept with the entry in one transaction, a start needs a reason, and nobody impersonates themselves (AUTHZ-05).
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
import { AuditLog, runInTransaction, runInUnitOfWork } from '@bieberkit/data/orm';
import type { Database } from '@bieberkit/data/orm';
import { recordImpersonationEnd, recordImpersonationStart } from './impersonation.ts';
import { describeDialects } from './testing/dialects.ts';

const TENANT = uuid7();
const ADMIN = uuid7();
const CUSTOMER = uuid7();

const asAdmin = <T>(run: () => Promise<T>): Promise<T> =>
  requestContext.run({ requestId: uuid7(), userId: ADMIN, tenantId: TENANT }, run);

async function entries(db: Database) {
  return runInUnitOfWork(db, async (em) =>
    (await em.find(AuditLog, {}, { orderBy: { at: 'asc' } }))
      .filter((row) => row.action.startsWith('auth.impersonation.'))
      .map((row) => ({
        action: row.action,
        recordId: row.recordId ?? null,
        reason: row.reason ?? null,
        tenant: row.tenant ?? null,
        data: row.data === null || row.data === undefined ? null : JSON.parse(row.data),
      })),
  );
}

describeDialects('AUTHZ-05 the audit of impersonation', ({ open }) => {
  it('AUTHZ-05 a start and an end are entries with both ids, the reason, the tenant and an outbox event each', async () => {
    const db = await open([]);
    await asAdmin(() =>
      runInTransaction(db, async (em) => {
        recordImpersonationStart(em, {
          actorId: ADMIN,
          targetId: CUSTOMER,
          tenantId: TENANT,
          reason: ' support ticket 4821 ',
        });
      }),
    );
    await asAdmin(() =>
      runInTransaction(db, async (em) => {
        recordImpersonationEnd(em, { actorId: ADMIN, targetId: CUSTOMER, tenantId: TENANT });
      }),
    );
    expect(await entries(db)).toEqual([
      {
        action: 'auth.impersonation.start',
        recordId: CUSTOMER,
        reason: 'support ticket 4821',
        tenant: TENANT,
        data: { actorId: ADMIN, targetId: CUSTOMER, phase: 'start' },
      },
      {
        action: 'auth.impersonation.end',
        recordId: CUSTOMER,
        reason: null,
        tenant: TENANT,
        data: { actorId: ADMIN, targetId: CUSTOMER, phase: 'end' },
      },
    ]);
    const events = await db.orm.em.getConnection().execute('select event from bk_outbox order by created_at');
    expect(events.map((row: { event: string }) => row.event)).toEqual([
      'auth.impersonation.start',
      'auth.impersonation.end',
    ]);
  });

  it('AUTHZ-05 the entry names the real actor even when the request already speaks for the user that is acted as', async () => {
    const db = await open([]);
    await requestContext.run({ requestId: uuid7(), userId: CUSTOMER, tenantId: TENANT }, () =>
      runInTransaction(db, async (em) => {
        recordImpersonationEnd(em, { actorId: ADMIN, targetId: CUSTOMER, tenantId: TENANT });
      }),
    );
    const [entry] = await entries(db);
    expect(entry?.data).toMatchObject({ actorId: ADMIN, targetId: CUSTOMER });
  });

  it('AUTHZ-05 a start with no reason, a blank one or one that is too long is refused, and nothing is written', async () => {
    const db = await open([]);
    for (const reason of [undefined, '', '   ', 'x'.repeat(501)]) {
      await expect(
        asAdmin(() =>
          runInTransaction(db, async (em) => {
            recordImpersonationStart(em, {
              actorId: ADMIN,
              targetId: CUSTOMER,
              ...(reason === undefined ? {} : { reason }),
            });
          }),
        ),
      ).rejects.toMatchObject({ code: 'AUTHZ_IMPERSONATION_INVALID' });
    }
    expect(await entries(db)).toEqual([]);
  });

  it('AUTHZ-05 nobody impersonates themselves, at the start or at the end', async () => {
    const db = await open([]);
    await expect(
      asAdmin(() =>
        runInTransaction(db, async (em) => {
          recordImpersonationStart(em, { actorId: ADMIN, targetId: ADMIN, reason: 'testing' });
        }),
      ),
    ).rejects.toMatchObject({ code: 'AUTHZ_IMPERSONATION_INVALID' });
    await expect(
      asAdmin(() =>
        runInTransaction(db, async (em) => {
          recordImpersonationEnd(em, { actorId: ADMIN, targetId: ADMIN });
        }),
      ),
    ).rejects.toMatchObject({ code: 'AUTHZ_IMPERSONATION_INVALID' });
  });

  it('AUTHZ-05 an impersonation whose transaction is rolled back leaves no entry and no event', async () => {
    const db = await open([]);
    await expect(
      asAdmin(() =>
        runInTransaction(db, async (em) => {
          recordImpersonationStart(em, { actorId: ADMIN, targetId: CUSTOMER, reason: 'ticket' });
          await em.flush();
          throw new Error('the session could not be made');
        }),
      ),
    ).rejects.toThrow('the session could not be made');
    expect(await entries(db)).toEqual([]);
    expect(await db.orm.em.getConnection().execute('select event from bk_outbox')).toEqual([]);
  });
});
