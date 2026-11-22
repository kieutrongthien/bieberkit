/**
 * BieberKit
 *
 * @file        packages/data/src/orm/localized.test.ts
 * @description Tests for localized fields: the translation table, writing a translation, and reading with a locale and a fallback (DATA-17).
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
import { DataError } from '../errors.ts';
import { cmsSchemas, inTenant, TENANT_A, TENANT_B } from '../testing/crm.ts';
import { describeDialects } from '../testing/dialects.ts';
import type { DialectContext } from '../testing/dialects.ts';
import { bulkInsert } from './bulk.ts';
import { compileEntities } from './compile.ts';
import { listPage } from './query.ts';
import { setTranslation, translationName } from './localize.ts';
import { Page, User } from '../testing/sample-entities.ts';

async function failureOf(run: () => Promise<unknown>): Promise<DataError> {
  try {
    await run();
  } catch (error) {
    if (error instanceof DataError) return error;
    throw error;
  }
  throw new Error('Expected a DataError.');
}

describe('DATA-17 the translation schema', () => {
  it('an entity with localized fields compiles to the entity and its translation, in that order', () => {
    const schemas = compileEntities([Page]);
    expect(schemas).toHaveLength(2);
    expect(Reflect.get(Object(Reflect.get(schemas[1] ?? {}, 'meta')), 'className')).toBe('cms.PageTranslation');
    expect(Reflect.get(Object(Reflect.get(schemas[1] ?? {}, 'meta')), 'tableName')).toBe('cms_pages_i18n');
  });

  it('translationName gives the name of the translation entity', () => {
    expect(translationName('cms.Page')).toBe('cms.PageTranslation');
  });

  it('an entity without localized fields has no translation schema', () => {
    expect(compileEntities([User])).toHaveLength(1);
  });

  it('the translation has its own tenant column only when the entity has one, and the foreign key follows', () => {
    const properties = (tenancy: 'single' | 'shared-schema') =>
      Object.keys(
        Object(Reflect.get(Object(Reflect.get(compileEntities([Page], { tenancy })[1] ?? {}, 'meta')), 'properties')),
      );
    expect(properties('shared-schema')).toEqual(
      expect.arrayContaining(['tenantId', 'record', 'locale', 'title', 'body']),
    );
    expect(properties('single')).not.toContain('tenantId');
  });
});

async function setup(open: DialectContext['open'], count = 3) {
  const schemas = cmsSchemas();
  const db = await open(schemas.all);
  await inTenant(db, TENANT_A, (em) =>
    bulkInsert(
      em,
      schemas.Page,
      Array.from({ length: count }, (_, n) => ({ slug: `page-${n}`, title: `Trang ${n}`, body: `Nội dung ${n}` })),
    ),
  );
  const rows = (await inTenant(db, TENANT_A, (em) => listPage(em, schemas.Page, { sort: [{ field: 'slug' }] }))).rows;
  return { db, schemas, ids: rows.map((row) => String(row['id'])) };
}

describeDialects('DATA-17 writing a translation', ({ open }) => {
  it('creates the row, and writes again over it', async () => {
    const { db, schemas, ids } = await setup(open);
    await inTenant(db, TENANT_A, (em) =>
      setTranslation(em, schemas.Page, ids[0] ?? '', 'en', { title: 'Page 0', body: 'Content 0' }),
    );
    await inTenant(db, TENANT_A, (em) => setTranslation(em, schemas.Page, ids[0] ?? '', 'en', { title: 'Page zero' }));
    const result: unknown = await db.orm.em.getConnection().execute('select title, body, locale from cms_pages_i18n');
    const rows = Array.isArray(result) ? result : [];
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ title: 'Page zero', body: 'Content 0', locale: 'en' });
  });

  it('a field that is not localized is refused, and so is a locale that is not a language tag', async () => {
    const { db, schemas, ids } = await setup(open);
    const notLocalized = await failureOf(() =>
      inTenant(db, TENANT_A, (em) => setTranslation(em, schemas.Page, ids[0] ?? '', 'en', { slug: 'x' })),
    );
    expect(notLocalized.code).toBe('DATA_FIELD_INVALID');
    expect(notLocalized.message).toContain('slug');
    for (const locale of ['', 'English', 'en_US', 'e', 'en-', '12']) {
      const error = await failureOf(() =>
        inTenant(db, TENANT_A, (em) => setTranslation(em, schemas.Page, ids[0] ?? '', locale, { title: 'x' })),
      );
      expect(error.code).toBe('DATA_LOCALE_INVALID');
      expect(error.status).toBe(400);
    }
  });

  it('a page of another tenant cannot be translated', async () => {
    const { db, schemas, ids } = await setup(open);
    const error = await failureOf(() =>
      inTenant(db, TENANT_B, (em) => setTranslation(em, schemas.Page, ids[0] ?? '', 'en', { title: 'x' })),
    );
    expect(error.code).toBe('DATA_REFERENCE_NOT_VISIBLE');
  });

  it('there is one row for a record and a locale, and the database holds to it', async () => {
    const { db, schemas, ids } = await setup(open);
    await inTenant(db, TENANT_A, (em) => setTranslation(em, schemas.Page, ids[0] ?? '', 'en', { title: 'A' }));
    await expect(
      inTenant(db, TENANT_A, async (em) => {
        em.create(schemas.Translation, {
          record: em.getReference(schemas.Page, ids[0] ?? ''),
          locale: 'en',
          title: 'duplicate',
        });
        await em.flush();
      }),
    ).rejects.toThrow(/unique|duplicate|constraint/i);
  });

  it('a translation row is not seen by another tenant', async () => {
    const { db, schemas, ids } = await setup(open);
    await inTenant(db, TENANT_A, (em) => setTranslation(em, schemas.Page, ids[0] ?? '', 'en', { title: 'A' }));
    expect(await inTenant(db, TENANT_B, (em) => em.count(schemas.Translation, {}))).toBe(0);
    expect(await inTenant(db, TENANT_A, (em) => em.count(schemas.Translation, {}))).toBe(1);
  });
});

describeDialects('DATA-17 reading with a locale', ({ open }) => {
  it('takes the translated field, and the default value for a field that has no translation', async () => {
    const { db, schemas, ids } = await setup(open);
    await inTenant(db, TENANT_A, (em) => setTranslation(em, schemas.Page, ids[0] ?? '', 'en', { title: 'Page 0' }));
    const page = await inTenant(db, TENANT_A, (em) =>
      listPage(em, schemas.Page, { sort: [{ field: 'slug' }], locale: 'en' }),
    );
    expect(page.rows.map((row) => [row['title'], row['body']])).toEqual([
      ['Page 0', 'Nội dung 0'],
      ['Trang 1', 'Nội dung 1'],
      ['Trang 2', 'Nội dung 2'],
    ]);
  });

  it('a translation that is empty (null) falls back for that field only', async () => {
    const { db, schemas, ids } = await setup(open);
    await inTenant(db, TENANT_A, (em) =>
      setTranslation(em, schemas.Page, ids[0] ?? '', 'en', { title: 'Page 0', body: null }),
    );
    const [row] = (
      await inTenant(db, TENANT_A, (em) => listPage(em, schemas.Page, { sort: [{ field: 'slug' }], locale: 'en' }))
    ).rows;
    expect([row?.['title'], row?.['body']]).toEqual(['Page 0', 'Nội dung 0']);
  });

  it('without a locale, or for a locale with no translation, the default values come back', async () => {
    const { db, schemas, ids } = await setup(open);
    await inTenant(db, TENANT_A, (em) => setTranslation(em, schemas.Page, ids[0] ?? '', 'en', { title: 'Page 0' }));
    for (const locale of [undefined, 'fr', 'vi']) {
      const page = await inTenant(db, TENANT_A, (em) =>
        listPage(em, schemas.Page, { sort: [{ field: 'slug' }], ...(locale === undefined ? {} : { locale }) }),
      );
      expect(page.rows[0]?.['title']).toBe('Trang 0');
    }
  });

  it('another language of the same record does not leak into the page', async () => {
    const { db, schemas, ids } = await setup(open);
    await inTenant(db, TENANT_A, (em) => setTranslation(em, schemas.Page, ids[0] ?? '', 'en', { title: 'English' }));
    await inTenant(db, TENANT_A, (em) => setTranslation(em, schemas.Page, ids[0] ?? '', 'zh', { title: '中文' }));
    const zh = await inTenant(db, TENANT_A, (em) =>
      listPage(em, schemas.Page, { sort: [{ field: 'slug' }], locale: 'zh' }),
    );
    expect(zh.rows[0]?.['title']).toBe('中文');
  });

  it('a locale that is not a language tag is DATA_LOCALE_INVALID', async () => {
    const { db, schemas } = await setup(open);
    const error = await failureOf(() =>
      inTenant(db, TENANT_A, (em) => listPage(em, schemas.Page, { locale: 'English' })),
    );
    expect(error.code).toBe('DATA_LOCALE_INVALID');
  });

  it('a page of 30 rows costs one query for the translations, not one per row', async () => {
    const queries: string[] = [];
    const schemas = cmsSchemas();
    const db = await open(schemas.all, { queryLog: (sql) => queries.push(sql) });
    await inTenant(db, TENANT_A, (em) =>
      bulkInsert(
        em,
        schemas.Page,
        Array.from({ length: 30 }, (_, n) => ({ slug: `p${n}`, title: `T${n}` })),
      ),
    );
    queries.length = 0;
    await inTenant(db, TENANT_A, (em) => listPage(em, schemas.Page, { locale: 'en', limit: 30 }));
    expect(queries.filter((sql) => /^\s*select/i.test(sql))).toHaveLength(2);
  });

  it('translations do not change what is stored: a later write of the entity keeps the default values', async () => {
    const { db, schemas, ids } = await setup(open);
    await inTenant(db, TENANT_A, (em) => setTranslation(em, schemas.Page, ids[0] ?? '', 'en', { title: 'Page 0' }));
    await inTenant(db, TENANT_A, async (em) => {
      (await em.findOneOrFail(schemas.Page, { id: ids[0] ?? '' }))['slug'] = 'renamed';
      await em.flush();
    });
    const [row] = (await inTenant(db, TENANT_A, (em) => listPage(em, schemas.Page, { sort: [{ field: 'slug' }] })))
      .rows;
    expect(row?.['title']).toBe('Trang 0');
  });
});
