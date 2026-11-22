/**
 * BieberKit
 *
 * @file        packages/data/src/orm/features.dialects.test.ts
 * @description Tests of the record features: comments, tags, attachments and timeline on generic tables, with the tenant of the parent record (MOD-13).
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

import { requestContext } from '@bieberkit/core';
import { expect, it } from 'vitest';
import { uuid7 } from '../keys/uuid7.ts';
import { defineEntity, f } from '../schema/index.ts';
import { describeDialects } from '../testing/dialects.ts';
import { TENANT_A, TENANT_B } from '../testing/crm.ts';
import { compileEntities } from './compile.ts';
import type { OrmSchema } from './compile.ts';
import { runInUnitOfWork } from './connect.ts';
import type { Database } from './connect.ts';
import {
  addAttachment,
  addComment,
  addTag,
  addTimeline,
  deleteComment,
  listAttachments,
  listComments,
  listTags,
  listTimeline,
  removeAttachment,
  removeTag,
} from './features.ts';
import { Comment, Tag, TimelineEntry } from './framework.ts';
import { transition } from './state.ts';

const Deal = defineEntity({
  name: 'crm.Deal',
  table: 'crm_deals',
  tenant: true,
  softDelete: true,
  features: ['attachments', 'comments', 'timeline', 'tags'],
  fields: {
    id: f.id(),
    title: f.string({ max: 50 }),
    status: f.state({ initial: 'open', transitions: { win: { from: ['open'], to: 'won' } } }),
  },
});
const Plain = defineEntity({
  name: 'crm.Plain',
  table: 'crm_plain',
  tenant: true,
  fields: { id: f.id(), title: f.string({ max: 50 }) },
});
const Memo = defineEntity({
  name: 'crm.Memo',
  table: 'crm_memos',
  features: ['comments', 'tags'],
  fields: { id: f.id(), title: f.string({ max: 50 }) },
});

const schemas = compileEntities([Deal, Plain, Memo]);

function schemaAt(index: number): OrmSchema {
  const schema = schemas[index];
  if (schema === undefined) throw new Error('The sample entities did not compile.');
  return schema;
}
const DealSchema = schemaAt(0);
const PlainSchema = schemaAt(1);
const MemoSchema = schemaAt(2);

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : '';
}

async function failureOf(run: () => Promise<unknown>): Promise<unknown> {
  try {
    await run();
  } catch (error) {
    return error;
  }
  throw new Error('Expected the call to fail.');
}

const USER = uuid7();

const as = <T>(tenant: string, fn: Parameters<typeof runInUnitOfWork<T>>[1], db: Database): Promise<T> =>
  requestContext.run({ requestId: 'req', tenantId: tenant, userId: USER }, () => runInUnitOfWork(db, fn));

async function seed(db: Database, schema: OrmSchema = DealSchema, tenant: string = TENANT_A): Promise<string> {
  return as(
    tenant,
    async (em) => {
      const row = em.create(schema, { title: 'Big deal' });
      await em.flush();
      return String(row['id']);
    },
    db,
  );
}

async function seedGlobal(db: Database): Promise<string> {
  return runInUnitOfWork(db, async (em) => {
    const row = em.create(MemoSchema, { title: 'Memo' });
    await em.flush();
    return String(row['id']);
  });
}

describeDialects('MOD-13 record features', ({ openFramework }) => {
  const open = (): Promise<Database> => openFramework(schemas);

  it('MOD-13 a comment keeps its body, its record, its author and the tenant of the record', async () => {
    const db = await open();
    const id = await seed(db);
    const made = await as(
      TENANT_A,
      async (em) => {
        const row = await addComment(em, DealSchema, id, { body: 'Call them back' });
        await em.flush();
        return row;
      },
      db,
    );
    expect(made).toMatchObject({ body: 'Call them back', createdBy: USER });
    const stored = await runInUnitOfWork(db, (em) => em.find(Comment, {}));
    expect(stored).toHaveLength(1);
    expect(stored[0]).toMatchObject({ entity: 'crm.Deal', recordId: id, tenant: TENANT_A, body: 'Call them back' });
  });

  it('MOD-13 comments are listed in the order they were written, a page at a time', async () => {
    const db = await open();
    const id = await seed(db);
    await as(
      TENANT_A,
      async (em) => {
        for (const body of ['one', 'two', 'three', 'four', 'five']) await addComment(em, DealSchema, id, { body });
        await em.flush();
      },
      db,
    );
    const first = await as(TENANT_A, (em) => listComments(em, DealSchema, id, { limit: 2 }), db);
    expect(first.rows.map((row) => row.body)).toEqual(['one', 'two']);
    expect(first.limit).toBe(2);
    expect(first.nextCursor).not.toBeNull();
    const second = await as(
      TENANT_A,
      (em) => listComments(em, DealSchema, id, { limit: 2, cursor: first.nextCursor ?? '' }),
      db,
    );
    expect(second.rows.map((row) => row.body)).toEqual(['three', 'four']);
    const last = await as(
      TENANT_A,
      (em) => listComments(em, DealSchema, id, { limit: 2, cursor: second.nextCursor ?? '' }),
      db,
    );
    expect(last.rows.map((row) => row.body)).toEqual(['five']);
    expect(last.nextCursor).toBeNull();
  });

  it('MOD-13 a page has at most 100 rows, and 25 when no size is asked', async () => {
    const db = await open();
    const id = await seed(db);
    await as(
      TENANT_A,
      async (em) => {
        for (let n = 0; n < 130; n += 1) await addComment(em, DealSchema, id, { body: `c${n}` });
        await em.flush();
      },
      db,
    );
    expect((await as(TENANT_A, (em) => listComments(em, DealSchema, id), db)).rows).toHaveLength(25);
    expect((await as(TENANT_A, (em) => listComments(em, DealSchema, id, { limit: 500 }), db)).rows).toHaveLength(100);
    expect(
      await failureOf(() => as(TENANT_A, (em) => listComments(em, DealSchema, id, { limit: 0 }), db)),
    ).toMatchObject({ code: 'DATA_PAGE_LIMIT' });
  });

  it('MOD-13 a comment is deleted from its own record only', async () => {
    const db = await open();
    const one = await seed(db);
    const two = await seed(db);
    const comment = await as(
      TENANT_A,
      async (em) => {
        const row = await addComment(em, DealSchema, one, { body: 'mine' });
        await em.flush();
        return row;
      },
      db,
    );
    expect(await as(TENANT_A, async (em) => deleteComment(em, DealSchema, two, comment.id), db)).toBe(false);
    expect(
      await as(
        TENANT_A,
        async (em) => {
          const gone = await deleteComment(em, DealSchema, one, comment.id);
          await em.flush();
          return gone;
        },
        db,
      ),
    ).toBe(true);
    expect((await as(TENANT_A, (em) => listComments(em, DealSchema, one), db)).rows).toEqual([]);
  });

  it.each([
    ['a blank comment', ' \n '],
    ['a comment of more than 10000 characters', 'x'.repeat(10_001)],
  ])('MOD-13 refuses %s', async (_name, body) => {
    const db = await open();
    const id = await seed(db);
    const error = await failureOf(() => as(TENANT_A, (em) => addComment(em, DealSchema, id, { body }), db));
    expect(error).toMatchObject({ code: 'DATA_FEATURE_INVALID', status: 400 });
  });

  it('MOD-13 a tag is added once, in NFC and trimmed, and the same tag again writes nothing', async () => {
    const db = await open();
    const id = await seed(db);
    const first = await as(
      TENANT_A,
      async (em) => {
        const row = await addTag(em, DealSchema, id, '  Đườnǵ ');
        await em.flush();
        return row;
      },
      db,
    );
    expect(first.tag).toBe('Đườnǵ'.normalize('NFC'));
    const again = await as(
      TENANT_A,
      async (em) => {
        const row = await addTag(em, DealSchema, id, 'Đườnǵ'.normalize('NFC'));
        await em.flush();
        return row;
      },
      db,
    );
    expect(again.id).toBe(first.id);
    expect(await runInUnitOfWork(db, (em) => em.count(Tag))).toBe(1);
  });

  it('MOD-13 tags are listed and removed, and Vip and vip are one tag on every database', async () => {
    const db = await open();
    const id = await seed(db);
    await as(
      TENANT_A,
      async (em) => {
        await addTag(em, DealSchema, id, 'Vip');
        await addTag(em, DealSchema, id, 'vip');
        await addTag(em, DealSchema, id, 'Hot');
        await em.flush();
      },
      db,
    );
    expect((await as(TENANT_A, (em) => listTags(em, DealSchema, id), db)).rows.map((row) => row.tag)).toEqual([
      'Vip',
      'Hot',
    ]);
    expect(
      await as(
        TENANT_A,
        async (em) => {
          const gone = await removeTag(em, DealSchema, id, 'VIP');
          await em.flush();
          return gone;
        },
        db,
      ),
    ).toBe(true);
    expect(await as(TENANT_A, (em) => removeTag(em, DealSchema, id, 'missing'), db)).toBe(false);
    expect((await as(TENANT_A, (em) => listTags(em, DealSchema, id), db)).rows.map((row) => row.tag)).toEqual(['Hot']);
  });

  it.each([
    ['a blank tag', '  '],
    ['a tag of 65 code points', 'x'.repeat(65)],
  ])('MOD-13 refuses %s', async (_name, tag) => {
    const db = await open();
    const id = await seed(db);
    expect(await failureOf(() => as(TENANT_A, (em) => addTag(em, DealSchema, id, tag), db))).toMatchObject({
      code: 'DATA_FEATURE_INVALID',
    });
  });

  it('MOD-13 an attachment keeps what the storage said about the file', async () => {
    const db = await open();
    const id = await seed(db);
    const made = await as(
      TENANT_A,
      async (em) => {
        const row = await addAttachment(em, DealSchema, id, {
          key: 'a/b/contract.pdf',
          name: 'Hợp đồng.pdf',
          contentType: 'application/pdf',
          size: 52_341,
        });
        await em.flush();
        return row;
      },
      db,
    );
    expect(made).toMatchObject({
      key: 'a/b/contract.pdf',
      name: 'Hợp đồng.pdf',
      contentType: 'application/pdf',
      size: 52_341,
      createdBy: USER,
    });
    const listed = await as(TENANT_A, (em) => listAttachments(em, DealSchema, id), db);
    expect(listed.rows).toHaveLength(1);
    expect(listed.rows[0]).toMatchObject({ id: made.id, size: 52_341 });
    expect(
      await as(
        TENANT_A,
        async (em) => {
          const gone = await removeAttachment(em, DealSchema, id, made.id);
          await em.flush();
          return gone;
        },
        db,
      ),
    ).toBe(true);
  });

  it.each([
    ['a blank key', { key: '', name: 'a', contentType: 'text/plain', size: 1 }],
    ['a blank name', { key: 'k', name: ' ', contentType: 'text/plain', size: 1 }],
    ['a negative size', { key: 'k', name: 'a', contentType: 'text/plain', size: -1 }],
    ['a size that is not whole', { key: 'k', name: 'a', contentType: 'text/plain', size: 1.5 }],
    [
      'a size beyond the safe range',
      { key: 'k', name: 'a', contentType: 'text/plain', size: Number.MAX_SAFE_INTEGER + 1 },
    ],
  ])('MOD-13 refuses an attachment with %s', async (_name, input) => {
    const db = await open();
    const id = await seed(db);
    expect(await failureOf(() => as(TENANT_A, (em) => addAttachment(em, DealSchema, id, input), db))).toMatchObject({
      code: 'DATA_FEATURE_INVALID',
    });
  });

  it('MOD-13 the timeline has the entries of the record, with the actor and the data', async () => {
    const db = await open();
    const id = await seed(db);
    await as(
      TENANT_A,
      async (em) => {
        await addTimeline(em, DealSchema, id, { type: 'call', data: { minutes: 12 } });
        await em.flush();
      },
      db,
    );
    const listed = await as(TENANT_A, (em) => listTimeline(em, DealSchema, id), db);
    expect(listed.rows).toHaveLength(1);
    expect(listed.rows[0]).toMatchObject({ type: 'call', data: { minutes: 12 }, actorId: USER });
    expect(listed.rows[0]?.at).toBeInstanceOf(Date);
  });

  it('MOD-13 a transition of a record with a timeline writes an entry', async () => {
    const db = await open();
    const id = await seed(db);
    await as(
      TENANT_A,
      async (em) => {
        await transition(em, DealSchema, await em.findOneOrFail(DealSchema, { id }), 'win');
        await em.flush();
      },
      db,
    );
    const rows = await runInUnitOfWork(db, (em) => em.find(TimelineEntry, {}));
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ type: 'transition', recordId: id, tenant: TENANT_A });
    expect(JSON.parse(String(rows[0]?.data))).toEqual({ name: 'win', from: 'open', to: 'won' });
  });

  it('MOD-13 a feature that the entity did not turn on is refused', async () => {
    const db = await open();
    const id = await seed(db, PlainSchema);
    const attempts = [
      () => as(TENANT_A, (em) => addComment(em, PlainSchema, id, { body: 'x' }), db),
      () => as(TENANT_A, (em) => addTag(em, PlainSchema, id, 'x'), db),
      () => as(TENANT_A, (em) => listTimeline(em, PlainSchema, id), db),
      () =>
        as(
          TENANT_A,
          (em) => addAttachment(em, PlainSchema, id, { key: 'k', name: 'n', contentType: 't/t', size: 1 }),
          db,
        ),
    ];
    for (const attempt of attempts) expect(await failureOf(attempt)).toMatchObject({ code: 'DATA_FEATURE_DISABLED' });
    const memo = await seedGlobal(db);
    expect(await failureOf(() => runInUnitOfWork(db, (em) => listTimeline(em, MemoSchema, memo)))).toMatchObject({
      code: 'DATA_FEATURE_DISABLED',
    });
  });

  it('MOD-13 a record of another tenant, a missing record and a deleted record are all not found', async () => {
    const db = await open();
    const id = await seed(db);
    const other = await failureOf(() => as(TENANT_B, (em) => addComment(em, DealSchema, id, { body: 'x' }), db));
    expect(other).toMatchObject({ code: 'DATA_RECORD_NOT_FOUND', status: 404 });
    const missing = await failureOf(() => as(TENANT_A, (em) => addComment(em, DealSchema, uuid7(), { body: 'x' }), db));
    expect(missing).toMatchObject({ code: 'DATA_RECORD_NOT_FOUND' });
    expect(messageOf(other)).toBe(messageOf(missing));
    await as(
      TENANT_A,
      async (em) => {
        (await em.findOneOrFail(DealSchema, { id }))['deletedAt'] = new Date();
        await em.flush();
      },
      db,
    );
    expect(await failureOf(() => as(TENANT_A, (em) => listComments(em, DealSchema, id), db))).toMatchObject({
      code: 'DATA_RECORD_NOT_FOUND',
    });
  });

  it('MOD-13 without a tenant in the request nothing is read or written', async () => {
    const db = await open();
    const id = await seed(db);
    const error = await failureOf(() => runInUnitOfWork(db, (em) => listComments(em, DealSchema, id)));
    expect(error).toMatchObject({ code: 'DATA_TENANT_REQUIRED' });
  });

  it('MOD-13 inside asSystem the record of any tenant is found, and the row keeps the tenant of the record', async () => {
    const db = await open();
    const id = await seed(db, DealSchema, TENANT_B);
    await db.asSystem('support', () =>
      runInUnitOfWork(db, async (em) => {
        await addComment(em, DealSchema, id, { body: 'from support' });
        await em.flush();
      }),
    );
    expect((await runInUnitOfWork(db, (em) => em.find(Comment, {})))[0]).toMatchObject({ tenant: TENANT_B });
    expect((await as(TENANT_B, (em) => listComments(em, DealSchema, id), db)).rows.map((row) => row.body)).toEqual([
      'from support',
    ]);
  });

  it('MOD-13 a stray row of another tenant for the same record is not listed', async () => {
    const db = await open();
    const id = await seed(db);
    await as(
      TENANT_A,
      async (em) => {
        await addComment(em, DealSchema, id, { body: 'real' });
        await em.flush();
      },
      db,
    );
    await runInUnitOfWork(db, async (em) => {
      em.create(Comment, {
        tenant: TENANT_B,
        entity: 'crm.Deal',
        recordId: id,
        body: 'planted',
        createdAt: new Date(),
      });
      await em.flush();
    });
    expect((await as(TENANT_A, (em) => listComments(em, DealSchema, id), db)).rows.map((row) => row.body)).toEqual([
      'real',
    ]);
  });

  it('MOD-13 two records have separate features', async () => {
    const db = await open();
    const one = await seed(db);
    const two = await seed(db);
    await as(
      TENANT_A,
      async (em) => {
        await addTag(em, DealSchema, one, 'hot');
        await addTag(em, DealSchema, two, 'hot');
        await addComment(em, DealSchema, two, { body: 'only two' });
        await em.flush();
      },
      db,
    );
    expect((await as(TENANT_A, (em) => listComments(em, DealSchema, one), db)).rows).toEqual([]);
    expect((await as(TENANT_A, (em) => listTags(em, DealSchema, two), db)).rows).toHaveLength(1);
  });

  it('MOD-13 an entity without a tenant keeps its features under the nil tenant, and a tag is still unique', async () => {
    const db = await open();
    const id = await seedGlobal(db);
    for (let round = 0; round < 2; round += 1) {
      await runInUnitOfWork(db, async (em) => {
        await addTag(em, MemoSchema, id, 'pinned');
        await addComment(em, MemoSchema, id, { body: `note ${round}` });
        await em.flush();
      });
    }
    expect((await runInUnitOfWork(db, (em) => listTags(em, MemoSchema, id))).rows).toHaveLength(1);
    expect((await runInUnitOfWork(db, (em) => listComments(em, MemoSchema, id))).rows).toHaveLength(2);
    expect((await runInUnitOfWork(db, (em) => em.find(Tag, {})))[0]?.tenant).toBe(
      '00000000-0000-0000-0000-000000000000',
    );
  });

  it('MOD-13 the features of a record commit with its unit of work, and roll back with it', async () => {
    const db = await open();
    const id = await seed(db);
    await failureOf(() =>
      as(
        TENANT_A,
        async (em) => {
          await addComment(em, DealSchema, id, { body: 'lost' });
          em.create(DealSchema, {});
          await em.flush();
        },
        db,
      ),
    );
    expect(await runInUnitOfWork(db, (em) => em.count(Comment))).toBe(0);
  });
});
