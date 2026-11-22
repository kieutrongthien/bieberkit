/**
 * BieberKit
 *
 * @file        packages/data/src/orm/framework.dialects.test.ts
 * @description Tests of the framework tables, the events and audit entries of a unit of work, and the append-only audit log (MOD-03, MOD-18, OBS-05, AUTHZ-05, DATA-25).
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

import { randomBytes } from 'node:crypto';
import { sql } from 'kysely';
import { requestContext } from '@bieberkit/core';
import { expect, it } from 'vitest';
import { DataError } from '../errors.ts';
import { uuid7 } from '../keys/uuid7.ts';
import { compileEntities } from './compile.ts';
import { createDatabase } from './connect.ts';
import { defineEntity, f } from '../schema/index.ts';
import { describeDialects } from '../testing/dialects.ts';
import { recordAudit } from './audit.ts';
import { AuditLog, DATA_PLUGIN, OutboxEntry, dataMigrationSteps, grantAuditLog } from './framework.ts';
import { kyselyOf } from './internals.ts';
import { emitEvent } from './outbox.ts';
import { runInUnitOfWork } from './connect.ts';
import { runPluginMigrations } from './plugin-migrate.ts';

const Thing = defineEntity({
  name: 'things.Thing',
  table: 'things_things',
  fields: { id: f.id(), code: f.string({ max: 20 }).unique() },
});
const [ThingSchema] = compileEntities([Thing]);
if (ThingSchema === undefined) throw new Error('The sample entity did not compile.');

async function failureOf(run: () => Promise<unknown>): Promise<unknown> {
  try {
    await run();
  } catch (error) {
    return error;
  }
  throw new Error('Expected the call to fail.');
}

const TENANT = '0191a2b3-0000-7000-8000-000000000001';
const USER = '0191a2b3-0000-7000-8000-000000000002';

describeDialects('MOD-18 framework tables', ({ dialect, openFramework, emptyDatabase }) => {
  it('DATA-24 the steps of the data plugin are in the ledger of plugin steps', async () => {
    const db = await openFramework();
    const { rows } = await sql<{ plugin: string }>`select distinct plugin from bieberkit_plugin_migrations`.execute(
      await kyselyOf(db.orm.em),
    );
    expect(rows).toEqual([{ plugin: DATA_PLUGIN }]);
  });

  it('DATA-24 running the steps again changes nothing', async () => {
    const db = await openFramework();
    const run = await runPluginMigrations(await kyselyOf(db.orm.em), dialect, dataMigrationSteps, {
      pluginOrder: [DATA_PLUGIN],
    });
    expect(run.applied).toEqual([]);
  });

  it('DATA-24 the steps and the schemas of the ORM describe the same tables', async () => {
    const db = await openFramework();
    const statements = await db.orm.schema.getUpdateSchemaSQL({ safe: true });
    const touching = statements.split(';').filter((text) => /bieberkit_|audit_log/.test(text) && text.trim() !== '');
    expect(touching).toEqual([]);
  });

  it('MOD-03 an event and an audit entry commit with the data of the unit of work', async () => {
    const db = await openFramework([ThingSchema]);
    await runInUnitOfWork(db, async (em) => {
      em.create(ThingSchema, { code: 'A1' });
      emitEvent(em, { name: 'things.thing.created', payload: { code: 'A1' } });
      recordAudit(em, { action: 'things.thing.create', entity: 'things.Thing' });
      await em.flush();
    });
    const em = db.fork();
    expect(await em.count(OutboxEntry)).toBe(1);
    expect(await em.count(AuditLog)).toBe(1);
  });

  it('MOD-03 a write that fails leaves no event and no audit entry', async () => {
    const db = await openFramework([ThingSchema]);
    await runInUnitOfWork(db, async (em) => {
      em.create(ThingSchema, { code: 'DUP' });
      await em.flush();
    });
    const error = await failureOf(() =>
      runInUnitOfWork(db, async (em) => {
        em.create(ThingSchema, { code: 'DUP' });
        emitEvent(em, { name: 'things.thing.created', payload: {} });
        recordAudit(em, { action: 'things.thing.create' });
        await em.flush();
      }),
    );
    expect(error).toBeDefined();
    const em = db.fork();
    expect(await em.count(OutboxEntry)).toBe(0);
    expect(await em.count(AuditLog)).toBe(0);
  });

  it('MOD-18 an event keeps its name, version, record, key and payload, and the context it came from', async () => {
    const db = await openFramework();
    const recordId = uuid7();
    await requestContext.run({ requestId: 'req-1', tenantId: TENANT, userId: USER }, () =>
      runInUnitOfWork(db, async (em) => {
        emitEvent(em, {
          name: 'crm.deal.won',
          version: 2,
          payload: { amount: 'Đồng 5' },
          record: { entity: 'crm.Deal', id: recordId, version: 7 },
          idempotencyKey: 'charge-1',
        });
        await em.flush();
      }),
    );
    const [row] = await db.fork().find(OutboxEntry, {});
    expect(row).toMatchObject({
      event: 'crm.deal.won',
      eventVersion: 2,
      entity: 'crm.Deal',
      recordId,
      recordVersion: 7,
      idempotencyKey: 'charge-1',
      requestId: 'req-1',
      tenant: TENANT,
      userId: USER,
      attempts: 0,
    });
    expect(JSON.parse(String(row?.payload))).toEqual({ amount: 'Đồng 5' });
  });

  it('MOD-18 an event made outside a request has no tenant and no user', async () => {
    const db = await openFramework();
    await runInUnitOfWork(db, async (em) => {
      emitEvent(em, { name: 'system.tick', payload: null });
      await em.flush();
    });
    const [row] = await db.fork().find(OutboxEntry, {});
    expect(row?.tenant ?? null).toBeNull();
    expect(row?.userId ?? null).toBeNull();
  });

  it.each([
    ['a blank name', { name: ' ', payload: {} }],
    ['a version below one', { name: 'a.b', version: 0, payload: {} }],
    ['a version that is not whole', { name: 'a.b', version: 1.5, payload: {} }],
    ['a payload that is not JSON', { name: 'a.b', payload: 10n }],
    ['a payload that is undefined', { name: 'a.b', payload: undefined }],
  ])('MOD-18 refuses %s', async (_name, event) => {
    const db = await openFramework();
    const em = db.fork();
    let caught: unknown;
    try {
      emitEvent(em, event);
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(DataError);
    expect(caught).toMatchObject({ code: 'DATA_OUTBOX_INVALID' });
  });

  it('OBS-05 an audit entry keeps the actor, the request, the tenant and the data', async () => {
    const db = await openFramework();
    const recordId = uuid7();
    await requestContext.run({ requestId: 'req-2', tenantId: TENANT, userId: USER }, () =>
      runInUnitOfWork(db, async (em) => {
        recordAudit(em, {
          action: 'auth.role.update',
          entity: 'auth.Role',
          recordId,
          reason: 'support ticket 41',
          data: { added: ['crm.customer.read'] },
        });
        await em.flush();
      }),
    );
    const [row] = await db.fork().find(AuditLog, {});
    expect(row).toMatchObject({
      action: 'auth.role.update',
      entity: 'auth.Role',
      recordId,
      reason: 'support ticket 41',
      actorId: USER,
      requestId: 'req-2',
      tenant: TENANT,
    });
    expect(row?.at).toBeInstanceOf(Date);
    expect(JSON.parse(String(row?.data))).toEqual({ added: ['crm.customer.read'] });
  });

  it('OBS-05 an audit entry may name another tenant than the context, for the system actor', async () => {
    const db = await openFramework();
    await runInUnitOfWork(db, async (em) => {
      recordAudit(em, { action: 'tenant.create', tenantId: TENANT });
      await em.flush();
    });
    const [row] = await db.fork().find(AuditLog, {});
    expect(row?.tenant).toBe(TENANT);
  });

  it('OBS-05 refuses an audit entry without an action', async () => {
    const db = await openFramework();
    expect(() => recordAudit(db.fork(), { action: '' })).toThrow(DataError);
  });

  it('DATA-25 the unit of work refuses to change or delete an audit entry', async () => {
    const db = await openFramework();
    await runInUnitOfWork(db, async (em) => {
      recordAudit(em, { action: 'a.b' });
      await em.flush();
    });
    const changing = await failureOf(async () => {
      const em = db.fork();
      const [row] = await em.find(AuditLog, {});
      if (row === undefined) throw new Error('no row');
      row.action = 'changed';
      await em.flush();
    });
    expect(changing).toMatchObject({ code: 'DATA_AUDIT_APPEND_ONLY' });
    const deleting = await failureOf(async () => {
      const em = db.fork();
      em.remove(await em.find(AuditLog, {}));
      await em.flush();
    });
    expect(deleting).toMatchObject({ code: 'DATA_AUDIT_APPEND_ONLY' });
    expect(await db.fork().count(AuditLog)).toBe(1);
  });

  it.runIf(dialect === 'sqlite')('DATA-25 on SQLite a trigger stops even a raw update or delete', async () => {
    const db = await openFramework();
    await runInUnitOfWork(db, async (em) => {
      recordAudit(em, { action: 'a.b' });
      await em.flush();
    });
    const kysely = await kyselyOf(db.orm.em);
    expect(await failureOf(() => sql`update audit_log set action = 'x'`.execute(kysely))).toBeDefined();
    expect(await failureOf(() => sql`delete from audit_log`.execute(kysely))).toBeDefined();
    expect(await db.fork().count(AuditLog)).toBe(1);
  });

  it.runIf(dialect !== 'sqlite')(
    'DATA-25 the application role can read and add to the audit log and nothing more',
    async () => {
      const { url } = await emptyDatabase();
      const owner = await createDatabase(
        { DB_CONNECTION: dialect, DATABASE_URL: url, DATABASE_READ_URLS: [], DB_POOL_MAX: 2 },
        { entities: [] },
      );
      const role = `bk_app_${randomBytes(4).toString('hex')}`;
      const password = randomBytes(8).toString('hex');
      const kysely = await kyselyOf(owner.orm.em);
      try {
        await runPluginMigrations(kysely, dialect, dataMigrationSteps, { pluginOrder: [DATA_PLUGIN] });
        if (dialect === 'postgres') {
          await sql.raw(`create role "${role}" login password '${password}'`).execute(kysely);
        } else {
          await sql.raw(`create user '${role}'@'%' identified by '${password}'`).execute(kysely);
        }
        await kysely.transaction().execute((trx) => grantAuditLog(trx, dialect, role));

        const asApp = new URL(url);
        asApp.username = role;
        asApp.password = password;
        const app = await createDatabase(
          { DB_CONNECTION: dialect, DATABASE_URL: asApp.toString(), DATABASE_READ_URLS: [], DB_POOL_MAX: 2 },
          { entities: [] },
        );
        try {
          await runInUnitOfWork(app, async (em) => {
            recordAudit(em, { action: 'a.b' });
            await em.flush();
          });
          expect(await app.fork().count(AuditLog)).toBe(1);
          const appKysely = await kyselyOf(app.orm.em);
          expect(await failureOf(() => sql`update audit_log set action = 'x'`.execute(appKysely))).toBeDefined();
          expect(await failureOf(() => sql`delete from audit_log`.execute(appKysely))).toBeDefined();
          expect(await failureOf(() => sql`drop table audit_log`.execute(appKysely))).toBeDefined();
        } finally {
          await app.close();
        }
      } finally {
        if (dialect === 'postgres') {
          await sql
            .raw(`drop owned by "${role}"`)
            .execute(kysely)
            .catch(() => undefined);
          await sql
            .raw(`drop role if exists "${role}"`)
            .execute(kysely)
            .catch(() => undefined);
        } else {
          await sql
            .raw(`drop user if exists '${role}'@'%'`)
            .execute(kysely)
            .catch(() => undefined);
        }
        await owner.close();
      }
    },
  );

  it('DATA-25 refuses a role name that is not a name', async () => {
    const db = await openFramework();
    const kysely = await kyselyOf(db.orm.em);
    const error = await failureOf(() =>
      kysely.transaction().execute((trx) => grantAuditLog(trx, dialect, 'x"; drop table audit_log; --')),
    );
    expect(error).toMatchObject({ code: 'DATA_IDENTIFIER_INVALID' });
  });

  it('AUTHZ-05 with the table sink, every use of asSystem is an audit entry written before the function runs', async () => {
    const db = await openFramework([], { audit: 'table' });
    const seenInside: number[] = [];
    await requestContext.run({ requestId: 'req-3', tenantId: TENANT, userId: USER }, () =>
      db.asSystem('nightly import', async () => {
        seenInside.push(await db.fork().count(AuditLog));
      }),
    );
    expect(seenInside).toEqual([1]);
    const [row] = await db.fork().find(AuditLog, {});
    expect(row).toMatchObject({ action: 'system.scope', reason: 'nightly import', actorId: USER, requestId: 'req-3' });
  });

  it('AUTHZ-05 a function of asSystem that fails still leaves its entry', async () => {
    const db = await openFramework([], { audit: 'table' });
    await failureOf(() =>
      db.asSystem('doomed', async () => {
        throw new Error('boom');
      }),
    );
    expect(await db.fork().count(AuditLog)).toBe(1);
  });
});
