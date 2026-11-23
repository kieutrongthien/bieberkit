/**
 * BieberKit
 *
 * @file        packages/data/src/orm/encrypted.dialects.test.ts
 * @description Tests of encrypted fields in the ORM: ciphertext in the column and clear text for the code, the refusals that follow, boot without a key, and the rotation of the key (SEC-08).
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
import { describe, expect, it } from 'vitest';
import { DataError } from '../errors.ts';
import { defineEntity } from '../schema/define-entity.ts';
import { f } from '../schema/fields.ts';
import { describeDialects } from '../testing/dialects.ts';
import { uuid7 } from '../keys/uuid7.ts';
import { aggregate } from './aggregate.ts';
import { compileEntities } from './compile.ts';
import { createDatabase, runInUnitOfWork } from './connect.ts';
import type { Database } from './connect.ts';
import { reencryptAll } from './reencrypt.ts';
import { useEncryptionKeys } from './encryption.ts';
import { listPage } from './query.ts';
import { findScoped } from './scoped.ts';
import { runAsTenant } from './tenant.ts';

const Vault = defineEntity({
  name: 'vault.Secret',
  table: 'vault_secrets',
  tenant: true,
  fields: {
    id: f.id(),
    label: f.string({ max: 50 }).index(),
    note: f.text().optional().encrypted(),
    taxId: f.string({ max: 20 }).optional().encrypted().pii(),
    nick: f.string({ max: 30 }).optional().pii(),
  },
});

const key = (): string => randomBytes(32).toString('base64');
const raw = async (db: Database): Promise<Record<string, unknown>[]> =>
  db.orm.em.getConnection().execute('select * from vault_secrets order by label');
const TENANT_A = uuid7();
const TENANT_B = uuid7();

const failure = async (run: () => Promise<unknown>): Promise<DataError> => {
  try {
    await run();
  } catch (error) {
    if (error instanceof DataError) return error;
    throw error;
  }
  throw new Error('Expected a DataError.');
};

describeDialects('SEC-08 encrypted fields', ({ open }) => {
  async function setup(ring = { current: key() }) {
    useEncryptionKeys(ring);
    const [schema] = compileEntities([Vault]);
    if (schema === undefined) throw new Error('no schema');
    const db = await open([schema]);
    useEncryptionKeys(ring);
    return { db, schema, ring };
  }

  const make = (
    db: Database,
    schema: NonNullable<Awaited<ReturnType<typeof setup>>['schema']>,
    tenant: string,
    data: Record<string, unknown>,
  ) =>
    runAsTenant(tenant, () =>
      runInUnitOfWork(db, async (em) => {
        const row = em.create(schema, { label: 'one', ...data });
        await em.flush();
        return String(row['id']);
      }),
    );

  it('SEC-08 the column holds ciphertext, and the clear text is in no column of the row', async () => {
    const { db, schema } = await setup();
    await make(db, schema, TENANT_A, { note: 'the secret note', taxId: '0123456789', nick: 'visible' });
    const [row] = await raw(db);
    expect(String(row?.['note'])).toMatch(/^bk1\./);
    expect(String(row?.['tax_id'])).toMatch(/^bk1\./);
    expect(JSON.stringify(row)).not.toContain('the secret note');
    expect(JSON.stringify(row)).not.toContain('0123456789');
    expect(row?.['nick']).toBe('visible');
  });

  it('SEC-08 the code reads clear text: a list, a get by id, and an entity that is loaded', async () => {
    const { db, schema } = await setup();
    const id = await make(db, schema, TENANT_A, { note: 'the secret note', taxId: '0123456789' });
    const page = await runAsTenant(TENANT_A, () => runInUnitOfWork(db, (em) => listPage(em, schema, {})));
    expect(page.rows[0]).toMatchObject({ note: 'the secret note', taxId: '0123456789' });
    const found = await runAsTenant(TENANT_A, () => runInUnitOfWork(db, (em) => findScoped(em, schema, id, undefined)));
    expect(found?.['note']).toBe('the secret note');
  });

  it('SEC-08 an update writes the new value encrypted, and a value that is set to null is null in the column', async () => {
    const { db, schema } = await setup();
    const id = await make(db, schema, TENANT_A, { note: 'first' });
    await runAsTenant(TENANT_A, () =>
      runInUnitOfWork(db, async (em) => {
        const row = await em.findOneOrFail(schema, { id });
        row['note'] = 'second';
        row['taxId'] = 'T-1';
        await em.flush();
      }),
    );
    let [row] = await raw(db);
    expect(String(row?.['note'])).toMatch(/^bk1\./);
    expect(String(row?.['note'])).not.toContain('second');
    await runAsTenant(TENANT_A, () =>
      runInUnitOfWork(db, async (em) => {
        const found = await em.findOneOrFail(schema, { id });
        found['note'] = null;
        await em.flush();
      }),
    );
    [row] = await raw(db);
    expect(row?.['note']).toBeNull();
  });

  it('SEC-08 a field that was never set is null, and null is not encrypted', async () => {
    const { db, schema } = await setup();
    await make(db, schema, TENANT_A, {});
    const [row] = await raw(db);
    expect([row?.['note'], row?.['tax_id']]).toEqual([null, null]);
  });

  it('SEC-08 two rows with the same clear text have different ciphertext', async () => {
    const { db, schema } = await setup();
    await make(db, schema, TENANT_A, { label: 'a', note: 'same' });
    await make(db, schema, TENANT_A, { label: 'b', note: 'same' });
    const rows = await raw(db);
    expect(rows[0]?.['note']).not.toBe(rows[1]?.['note']);
  });

  it('SEC-08 it cannot be used to find a row: a filter, a scope and a group by it are refused', async () => {
    const { db, schema } = await setup();
    await make(db, schema, TENANT_A, { note: 'x' });
    const run = (fn: (em: Parameters<Parameters<typeof runInUnitOfWork>[1]>[0]) => Promise<unknown>) =>
      failure(() => runAsTenant(TENANT_A, () => runInUnitOfWork(db, fn)));
    expect((await run((em) => listPage(em, schema, { where: { note: 'x' } }))).code).toMatch(
      /^DATA_(FIELD_NOT_INDEXED|QUERY_INVALID)$/,
    );
    expect((await run((em) => listPage(em, schema, { scope: { note: 'x' } }))).code).toBe('DATA_QUERY_INVALID');
    expect((await run((em) => listPage(em, schema, { scope: { taxId: { $ne: null } } }))).code).toBe(
      'DATA_QUERY_INVALID',
    );
    expect((await run((em) => aggregate(em, schema, { groupBy: ['note'] }))).code).toBe('DATA_AGGREGATE_INVALID');
    const ok = await runAsTenant(TENANT_A, () =>
      runInUnitOfWork(db, (em) => listPage(em, schema, { scope: { nick: null } })),
    );
    expect(ok.rows).toHaveLength(1);
  });

  it('SEC-08 a value that no key opens is DATA_DECRYPTION_FAILED, and never shows the ciphertext', async () => {
    const { db, schema } = await setup();
    await make(db, schema, TENANT_A, { note: 'the secret note' });
    const [stored] = await raw(db);
    useEncryptionKeys({ current: key() });
    const error = await failure(() =>
      runAsTenant(TENANT_A, () => runInUnitOfWork(db, (em) => listPage(em, schema, {}))),
    );
    expect(error.code).toBe('DATA_DECRYPTION_FAILED');
    expect(error.message).not.toContain(String(stored?.['note']));
  });

  it('SEC-08 a row that was written before the field was encrypted is read as it is, and is encrypted by the rotation', async () => {
    const { db, schema, ring } = await setup();
    const id = await make(db, schema, TENANT_A, { note: 'later' });
    await db.orm.em.getConnection().execute(`update vault_secrets set note = 'written before'`);
    const page = await runAsTenant(TENANT_A, () => runInUnitOfWork(db, (em) => listPage(em, schema, {})));
    expect(page.rows[0]).toMatchObject({ id, note: 'written before' });
    expect(await reencryptAll(db, [schema], { batchSize: 10 })).toMatchObject({ rows: 1 });
    expect(String((await raw(db))[0]?.['note'])).toMatch(/^bk1\./);
    expect(ring.current).toBeTruthy();
  });
});

const read = (db: Database, schema: Parameters<typeof listPage>[1], tenant: string) =>
  runAsTenant(tenant, () => runInUnitOfWork(db, (em) => listPage(em, schema, { sort: [{ field: 'label' }] })));

describeDialects('SEC-08 the rotation of the key', ({ open }) => {
  const OLD = key();
  const NEW = key();

  async function seeded() {
    useEncryptionKeys({ current: OLD });
    const [schema] = compileEntities([Vault]);
    if (schema === undefined) throw new Error('no schema');
    const db = await open([schema]);
    useEncryptionKeys({ current: OLD });
    for (const [tenant, label] of [
      [TENANT_A, 'a1'],
      [TENANT_A, 'a2'],
      [TENANT_B, 'b1'],
    ] as const) {
      await runAsTenant(tenant, () =>
        runInUnitOfWork(db, async (em) => {
          em.create(schema, { label, note: `note of ${label}`, taxId: `tax ${label}` });
          await em.flush();
        }),
      );
    }
    return { db, schema };
  }

  it('SEC-08 with the old key as previous, what the old key wrote is still read, and what is written is made by the new key', async () => {
    const { db, schema } = await seeded();
    useEncryptionKeys({ current: NEW, previous: [OLD] });
    expect((await read(db, schema, TENANT_A)).rows.map((row) => row['note'])).toEqual(['note of a1', 'note of a2']);
    await runAsTenant(TENANT_A, () =>
      runInUnitOfWork(db, async (em) => {
        em.create(schema, { label: 'a3', note: 'fresh' });
        await em.flush();
      }),
    );
    const rows = await db.orm.em.getConnection().execute('select * from vault_secrets order by label');
    expect(new Set(rows.map((row: Record<string, unknown>) => String(row['note']).split('.')[1])).size).toBe(2);
  });

  it('SEC-08 reencryptAll rewrites the rows that carry the old key, in every tenant, and says how many; a second run finds none', async () => {
    const { db, schema } = await seeded();
    useEncryptionKeys({ current: NEW, previous: [OLD] });
    const first = await reencryptAll(db, [schema], { batchSize: 2 });
    expect(first).toEqual({ rows: 3, fields: 6 });
    expect(await reencryptAll(db, [schema], { batchSize: 2 })).toEqual({ rows: 0, fields: 0 });
    const ids = (await db.orm.em.getConnection().execute('select * from vault_secrets')).flatMap(
      (row: Record<string, unknown>) => [String(row['note']).split('.')[1], String(row['tax_id']).split('.')[1]],
    );
    expect(new Set(ids).size).toBe(1);
  });

  it('SEC-08 after the rotation the old key can be dropped, and everything is still read', async () => {
    const { db, schema } = await seeded();
    useEncryptionKeys({ current: NEW, previous: [OLD] });
    await reencryptAll(db, [schema], {});
    useEncryptionKeys({ current: NEW });
    expect((await read(db, schema, TENANT_B)).rows[0]).toMatchObject({ note: 'note of b1', taxId: 'tax b1' });
  });

  it('SEC-08 without the old key as previous, the rows of the old key cannot be read, and the rotation refuses them', async () => {
    const { db, schema } = await seeded();
    useEncryptionKeys({ current: NEW });
    expect((await failure(() => read(db, schema, TENANT_A))).code).toBe('DATA_DECRYPTION_FAILED');
    expect((await failure(() => reencryptAll(db, [schema], {}))).code).toBe('DATA_DECRYPTION_FAILED');
  });

  it('SEC-08 a batch size that is not a positive whole number is refused', async () => {
    const { db, schema } = await seeded();
    for (const batchSize of [0, -1, 1.5]) {
      expect((await failure(() => reencryptAll(db, [schema], { batchSize }))).code).toBe('DATA_REENCRYPT_INVALID');
    }
  });
});

describe('SEC-08 boot', () => {
  it('SEC-08 a database with an encrypted field and no key does not start', async () => {
    useEncryptionKeys(undefined);
    const schemas = compileEntities([Vault]);
    const error = await failure(() =>
      createDatabase(
        { DB_CONNECTION: 'sqlite', DATABASE_URL: ':memory:', DATABASE_READ_URLS: [], DB_POOL_MAX: 1 },
        { entities: schemas },
      ),
    );
    expect(error.code).toBe('DATA_ENCRYPTION_KEY_MISSING');
  });

  it('SEC-08 a database with no encrypted field needs no key, and one that is given is checked', async () => {
    useEncryptionKeys(undefined);
    const plain = compileEntities([
      defineEntity({ name: 'vault.Plain', table: 'vault_plain', fields: { id: f.id(), title: f.string({ max: 5 }) } }),
    ]);
    const db = await createDatabase(
      { DB_CONNECTION: 'sqlite', DATABASE_URL: ':memory:', DATABASE_READ_URLS: [], DB_POOL_MAX: 1 },
      { entities: plain },
    );
    await db.close();
    const error = await failure(() =>
      createDatabase(
        { DB_CONNECTION: 'sqlite', DATABASE_URL: ':memory:', DATABASE_READ_URLS: [], DB_POOL_MAX: 1 },
        { entities: plain, encryption: { current: 'short' } },
      ),
    );
    expect(error.code).toBe('DATA_ENCRYPTION_KEY_INVALID');
  });

  it('SEC-08 createDatabase takes the keys from its options', async () => {
    useEncryptionKeys(undefined);
    const schemas = compileEntities([Vault]);
    const db = await createDatabase(
      { DB_CONNECTION: 'sqlite', DATABASE_URL: ':memory:', DATABASE_READ_URLS: [], DB_POOL_MAX: 1 },
      { entities: schemas, encryption: { current: key() } },
    );
    expect(db.dialect).toBe('sqlite');
    await db.close();
  });
});
