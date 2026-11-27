/**
 * BieberKit
 *
 * @file        plugins/media/src/index.test.ts
 * @description Tests of the media plugin: the upload flow, fixed visibility, read URLs, deletion after commit, metadata, folders, filters and limits (S-01, S-02, MED-01 to MED-08).
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

import { createHash } from 'node:crypto';
import { afterEach, expect, it, vi } from 'vitest';
import { addTag, AuditLog, entityOfSchema, listTags, runAsTenant, runInUnitOfWork } from '@bieberkit/data/orm';
import { createTestApp, describeDialects, TENANT_HEADER, USER_HEADER } from '@bieberkit/testing';
import type { Client, TestApp, TestAppOptions } from '@bieberkit/testing';
import plugin, { deleteObjectJob, Media, pathOf, prunePendingJob } from './index.ts';

const MEDIA = '/api/v1/media/media';
const FOLDERS = '/api/v1/media/folders';
const HOUR = 3_600_000;
/** A one pixel PNG, which the storage recognises by its bytes and not by its name. */
const PNG = Uint8Array.from(
  Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
    'base64',
  ),
);
const TEXT = new TextEncoder().encode('hello, world\n');

const dataOf = (body: Readonly<Record<string, unknown>>): Record<string, unknown> => Object(body['data']);
const listOf = (body: Readonly<Record<string, unknown>>): Record<string, unknown>[] => {
  const data = body['data'];
  return Array.isArray(data) ? data : [];
};

const events = async (app: TestApp): Promise<{ event: string; payload: unknown }[]> =>
  (await app.db.orm.em.getConnection().execute('select event, payload from bk_outbox order by created_at')).map(
    (row: { event: string; payload: unknown }) => ({
      event: row.event,
      payload: typeof row.payload === 'string' ? JSON.parse(row.payload) : row.payload,
    }),
  );

const audits = async (app: TestApp): Promise<string[]> =>
  runInUnitOfWork(app.db, async (em) =>
    (await em.find(AuditLog, {}, { orderBy: { at: 'asc' } }))
      .map((row) => row.action)
      .filter((action) => action.startsWith('media.')),
  );

const keys = (app: TestApp): string[] => [...app.disk.files.keys()].toSorted();

interface NewFile {
  readonly filename: string;
  readonly contentType: string;
  readonly size?: number;
  readonly visibility?: 'private' | 'public';
  readonly folderId?: string;
  readonly alt?: string;
}

/** A record, a signed URL, the bytes sent as a browser would, and the confirmation. Answers the id. */
async function uploaded(app: TestApp, client: Client, file: NewFile, bytes: Uint8Array): Promise<string> {
  const made = await client.post(MEDIA, { size: bytes.length, ...file });
  expect(made.status).toBe(201);
  const id = String(dataOf(made.body)['id']);
  const signed = await client.post(`${MEDIA}/${id}/upload-url`, {});
  expect(signed.status).toBe(200);
  await app.disk.upload(String(signed.body['url']), Object(signed.body['headers']), bytes);
  const confirmed = await client.post(`${MEDIA}/${id}/confirm`, {});
  expect(confirmed.status).toBe(200);
  return id;
}

afterEach(() => {
  vi.useRealTimers();
});

describeDialects('MED the media plugin', ({ open }) => {
  async function world(options: Partial<TestAppOptions> = {}) {
    const app = await createTestApp({
      modules: [plugin.module],
      open,
      roles: {
        uploader: ['media.upload', 'media.read'],
        reader: ['media.read'],
        manager: ['media.read', 'media.upload', 'media.manage'],
      },
      ...options,
    });
    const uploader = await app.actingAs(app.newUser(), ['uploader']);
    const manager = await app.actingAs(app.newUser(), ['manager']);
    return { app, uploader, manager };
  }

  it('S-01 the upload flow makes the file ready under the folder of its tenant, with the type that the bytes are', async () => {
    const { app, uploader } = await world();
    const id = await uploaded(app, uploader, { filename: 'logo.png', contentType: 'image/png' }, PNG);
    const row = dataOf((await uploader.get(`${MEDIA}/${id}`)).body);
    expect(row).toMatchObject({
      status: 'ready',
      size: PNG.length,
      contentType: 'image/png',
      kind: 'image',
      visibility: 'private',
    });
    expect(pathOf({ id, filename: 'logo.png', tenantId: app.tenant })).toBe(`${app.tenant}/media/${id}/logo.png`);
    expect(keys(app)).toEqual([`private/${app.tenant}/media/${id}/logo.png`]);
    await app.close();
  });

  it('MED-08 refused bytes leave a rejected record and no object; a good confirm emits media.file.confirmed', async () => {
    const { app, uploader } = await world();
    const made = await uploader.post(MEDIA, { filename: 'fake.png', contentType: 'image/png', size: 5 });
    const fake = String(dataOf(made.body)['id']);
    const signed = await uploader.post(`${MEDIA}/${fake}/upload-url`, {});
    await app.disk.upload(
      String(signed.body['url']),
      Object(signed.body['headers']),
      new TextEncoder().encode('hello'),
    );
    const refused = await uploader.post(`${MEDIA}/${fake}/confirm`, {});
    expect(refused.status).toBe(422);
    expect(refused.body['code']).toBe('STORAGE_UPLOAD_REJECTED');
    expect(dataOf((await uploader.get(`${MEDIA}/${fake}`)).body)['status']).toBe('rejected');
    expect(keys(app)).toEqual([]);
    expect((await uploader.post(`${MEDIA}/${fake}/confirm`, {})).body['code']).toBe('MEDIA_NOT_PENDING');

    const good = await uploaded(app, uploader, { filename: 'logo.png', contentType: 'image/png' }, PNG);
    expect((await events(app)).filter((row) => row.event === 'media.file.confirmed')).toEqual([
      { event: 'media.file.confirmed', payload: { id: good, path: `${app.tenant}/media/${good}/logo.png` } },
    ]);
    expect((await uploader.post(`${MEDIA}/${good}/confirm`, {})).status).toBe(409);
    expect((await uploader.post(`${MEDIA}/${good}/upload-url`, {})).body['code']).toBe('MEDIA_ALREADY_READY');
    await app.close();
  });

  it('MED-01 visibility is chosen when the record is made, is the key prefix, and never changes', async () => {
    const { app, uploader, manager } = await world();
    const id = await uploaded(
      app,
      uploader,
      { filename: 'banner.png', contentType: 'image/png', visibility: 'public' },
      PNG,
    );
    expect(keys(app)).toEqual([`public/${app.tenant}/media/${id}/banner.png`]);
    const changed = await manager.patch(`${MEDIA}/${id}`, { visibility: 'private' }, 1);
    expect(changed.status).toBe(400);
    expect(dataOf((await manager.get(`${MEDIA}/${id}`)).body)['visibility']).toBe('public');
    await app.close();
  });

  it('OPS-04 a download of a private file is audited when MEDIA_AUDIT_DOWNLOADS is on, a public one never, and by default none', async () => {
    const on = await world({
      pluginEnv: { MEDIA_AUDIT_DOWNLOADS: true },
      disk: { signing: true, publicBaseUrl: 'https://cdn.example.test' },
    });
    const secret = await uploaded(on.app, on.uploader, { filename: 'secret.png', contentType: 'image/png' }, PNG);
    const shown = await uploaded(
      on.app,
      on.uploader,
      { filename: 'open.png', contentType: 'image/png', visibility: 'public' },
      PNG,
    );
    await on.uploader.get(`${MEDIA}/${secret}/url`);
    await on.uploader.get(`${MEDIA}/${shown}/url`);
    expect((await audits(on.app)).filter((action) => action === 'media.file.downloaded')).toHaveLength(1);
    const [entry] = await runInUnitOfWork(on.app.db, (em) => em.find(AuditLog, { action: 'media.file.downloaded' }));
    expect(JSON.parse(String(entry?.data))).toMatchObject({ filename: 'secret.png', via: 'url' });
    await on.app.close();
    const off = await world({ disk: { signing: true, publicBaseUrl: 'https://cdn.example.test' } });
    const quiet = await uploaded(off.app, off.uploader, { filename: 'quiet.png', contentType: 'image/png' }, PNG);
    await off.uploader.get(`${MEDIA}/${quiet}/url`);
    expect((await audits(off.app)).filter((action) => action === 'media.file.downloaded')).toHaveLength(0);
    await off.app.close();
  });

  it('MED-02 a private file gets a signed URL and never a public one; a public file gets its public URL', async () => {
    const { app, uploader } = await world({ disk: { signing: true, publicBaseUrl: 'https://cdn.example.test' } });
    const secret = await uploaded(app, uploader, { filename: 'secret.png', contentType: 'image/png' }, PNG);
    const shown = await uploaded(
      app,
      uploader,
      { filename: 'open.png', contentType: 'image/png', visibility: 'public' },
      PNG,
    );
    const signed = await uploader.get(`${MEDIA}/${secret}/url`);
    expect(signed.status).toBe(200);
    expect(String(signed.body['url'])).toMatch(/^memory:\/\//);
    expect(signed.body['expiresAt']).toEqual(expect.any(Number));
    await expect(
      app.services.storage.url(pathOf({ id: secret, filename: 'secret.png', tenantId: app.tenant })),
    ).rejects.toMatchObject({ code: 'STORAGE_NOT_PUBLIC' });
    expect((await uploader.get(`${MEDIA}/${shown}/url`)).body).toEqual({
      url: `https://cdn.example.test/public/${app.tenant}/media/${shown}/open.png`,
      expiresAt: null,
    });
    const pending = String(
      dataOf((await uploader.post(MEDIA, { filename: 'later.png', contentType: 'image/png', size: 9 })).body)['id'],
    );
    expect((await uploader.get(`${MEDIA}/${pending}/url`)).body['code']).toBe('MEDIA_NOT_READY');
    const stranger = await app.actingAs(app.newUser());
    expect((await stranger.get(`${MEDIA}/${secret}/url`)).status).toBe(403);
    await app.close();
  });

  it('MED-02 on a disk that cannot sign, the URL is the content route, which streams the file after the permission check', async () => {
    const { app, uploader } = await world({ disk: { signing: false } });
    const made = await uploader.post(MEDIA, { filename: 'notes.txt', contentType: 'text/plain', size: TEXT.length });
    const id = String(dataOf(made.body)['id']);
    // No browser upload without signing: the bytes are put where a signed upload would have put them.
    await app.services.storage.put(pathOf({ id, filename: 'notes.txt', tenantId: app.tenant }), TEXT);
    expect((await uploader.post(`${MEDIA}/${id}/confirm`, {})).status).toBe(200);
    expect((await uploader.get(`${MEDIA}/${id}/url`)).body).toEqual({ url: `${MEDIA}/${id}/content`, expiresAt: null });
    const reader = app.newUser();
    await app.actingAs(reader, ['reader']);
    const reply = await app.server.inject({
      method: 'GET',
      url: `${MEDIA}/${id}/content`,
      headers: { [USER_HEADER]: reader.id, [TENANT_HEADER]: app.tenant },
    });
    expect(reply.statusCode).toBe(200);
    // The answer of inject is text, so the case streams a text file.
    expect(reply.body).toBe('hello, world\n');
    expect(reply.headers['content-type']).toBe('text/plain');
    expect(reply.headers['x-content-type-options']).toBe('nosniff');
    expect(String(reply.headers['content-disposition'])).toMatch(/^attachment; filename="notes.txt"/);
    const anonymous = await app.server.inject({
      method: 'GET',
      url: `${MEDIA}/${id}/content`,
      headers: { [TENANT_HEADER]: app.tenant },
    });
    expect(anonymous.statusCode).toBe(401);
    await app.close();
  });

  it('MED-03 deleting a record removes its object only after commit, through the outbox', async () => {
    const { app, uploader, manager } = await world();
    const id = await uploaded(app, uploader, { filename: 'logo.png', contentType: 'image/png' }, PNG);
    expect((await uploader.delete(`${MEDIA}/${id}`, 1)).status).toBe(403);
    expect((await manager.delete(`${MEDIA}/${id}`, 1)).status).toBe(204);
    expect((await manager.get(`${MEDIA}/${id}`)).status).toBe(404);
    expect((await events(app)).filter((row) => row.event === 'media.file.deleted')).toEqual([
      { event: 'media.file.deleted', payload: { path: `${app.tenant}/media/${id}/logo.png` } },
    ]);
    // The row is gone, the object waits for the worker.
    expect(keys(app)).toHaveLength(1);
    while ((await app.runOutbox()) > 0);
    expect(keys(app)).toEqual([]);
    expect(plugin.module.contributions['subscriptions']).toEqual([
      { event: 'media.file.deleted', job: deleteObjectJob },
    ]);
    await app.close();
  });

  it('MED-03 a record still pending after MEDIA_PENDING_TTL_HOURS is deleted with its object by a scheduled job', async () => {
    const { app, uploader } = await world({ pluginEnv: { MEDIA_PENDING_TTL_HOURS: 2 } });
    const stale = String(
      dataOf((await uploader.post(MEDIA, { filename: 'stale.png', contentType: 'image/png', size: PNG.length })).body)[
        'id'
      ],
    );
    const signed = await uploader.post(`${MEDIA}/${stale}/upload-url`, {});
    await app.disk.upload(String(signed.body['url']), Object(signed.body['headers']), PNG);
    const ready = await uploaded(app, uploader, { filename: 'kept.png', contentType: 'image/png' }, PNG);
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(Date.now() + 3 * HOUR);
    const fresh = String(
      dataOf((await uploader.post(MEDIA, { filename: 'fresh.png', contentType: 'image/png', size: 9 })).body)['id'],
    );
    await app.queue.dispatch(prunePendingJob, {});
    while ((await app.runOutbox()) > 0);
    expect((await uploader.get(`${MEDIA}/${stale}`)).status).toBe(404);
    expect((await uploader.get(`${MEDIA}/${fresh}`)).status).toBe(200);
    expect((await uploader.get(`${MEDIA}/${ready}`)).status).toBe(200);
    expect(keys(app)).toEqual([`private/${app.tenant}/media/${ready}/kept.png`]);
    expect(await audits(app)).toContain('media.file.expired');
    expect(plugin.module.contributions['schedules']).toEqual([{ job: prunePendingJob, cron: '41 * * * *' }]);
    await app.close();
  });

  it('MED-04 confirm stores the SHA-256 of the bytes; PATCH changes alt, description and folder only', async () => {
    const { app, uploader, manager } = await world();
    const id = await uploaded(app, uploader, { filename: 'logo.png', contentType: 'image/png', alt: 'A dot' }, PNG);
    expect(dataOf((await manager.get(`${MEDIA}/${id}`)).body)).toMatchObject({
      alt: 'A dot',
      checksum: createHash('sha256').update(PNG).digest('hex'),
    });
    const folder = String(dataOf((await manager.post(FOLDERS, { name: 'Logos' })).body)['id']);
    const changed = await manager.patch(
      `${MEDIA}/${id}`,
      { alt: 'The logo', description: 'Used in the header', folderId: folder },
      1,
    );
    expect(changed.status).toBe(200);
    expect(dataOf(changed.body)).toMatchObject({
      alt: 'The logo',
      description: 'Used in the header',
      folderId: folder,
    });
    for (const field of [{ filename: 'other.png' }, { size: 1 }, { contentType: 'text/plain' }, { checksum: 'x' }])
      expect((await manager.patch(`${MEDIA}/${id}`, field, 1)).status).toBe(400);
    expect(
      (await manager.patch(`${MEDIA}/${id}`, { folderId: '0190f6b2-7c4e-7000-8000-0000000000c1' }, 1)).body['code'],
    ).toBe('MEDIA_FOLDER_NOT_FOUND');
    expect((await uploader.patch(`${MEDIA}/${id}`, { alt: 'x' }, 1)).status).toBe(403);
    await app.close();
  });

  it('MED-05 folders nest to a depth of 8, names are unique in a parent, and only an empty folder is deleted', async () => {
    const { app, uploader, manager } = await world();
    const root = String(dataOf((await manager.post(FOLDERS, { name: 'Brand' })).body)['id']);
    expect((await manager.post(FOLDERS, { name: 'Brand' })).body['code']).toBe('MEDIA_FOLDER_NAME_TAKEN');
    expect((await manager.post(FOLDERS, { name: 'Brand', parentId: root })).status).toBe(201);
    let parent = root;
    for (let depth = 2; depth <= 8; depth += 1)
      parent = String(
        dataOf((await manager.post(FOLDERS, { name: `Level ${String(depth)}`, parentId: parent })).body)['id'],
      );
    const tooDeep = await manager.post(FOLDERS, { name: 'Level 9', parentId: parent });
    expect(tooDeep.status).toBe(422);
    expect(tooDeep.body['code']).toBe('MEDIA_FOLDER_TOO_DEEP');
    const children = listOf((await manager.get(`${FOLDERS}?parentId=${root}`)).body).map((row) => row['name']);
    expect(children.toSorted((a, b) => String(a).localeCompare(String(b)))).toEqual(['Brand', 'Level 2']);
    expect(listOf((await manager.get(FOLDERS)).body).map((row) => row['name'])).toEqual(['Brand']);

    const renamed = await manager.patch(`${FOLDERS}/${root}`, { name: 'Brand assets' }, 1);
    expect(dataOf(renamed.body)['name']).toBe('Brand assets');
    const leaf = String(dataOf((await manager.post(FOLDERS, { name: 'Leaf' })).body)['id']);
    await uploaded(app, uploader, { filename: 'logo.png', contentType: 'image/png', folderId: leaf }, PNG);
    expect((await manager.delete(`${FOLDERS}/${leaf}`, 1)).body['code']).toBe('MEDIA_FOLDER_NOT_EMPTY');
    expect((await manager.delete(`${FOLDERS}/${root}`, 1)).status).toBe(409);
    const empty = String(dataOf((await manager.post(FOLDERS, { name: 'Empty' })).body)['id']);
    expect((await manager.delete(`${FOLDERS}/${empty}`, 1)).status).toBe(204);
    expect((await manager.delete(`${FOLDERS}/${empty}`, 1)).body['code']).toBe('MEDIA_FOLDER_NOT_FOUND');
    expect((await uploader.post(FOLDERS, { name: 'Mine' })).status).toBe(403);
    await app.close();
  });

  it('MED-05 tags use the tags feature of the entity', async () => {
    const { app, uploader } = await world();
    const id = await uploaded(app, uploader, { filename: 'logo.png', contentType: 'image/png' }, PNG);
    expect(Media.features).toEqual(['tags']);
    const schema = app.schemas.find((each) => entityOfSchema(each).name === Media.name);
    if (schema === undefined) throw new Error('The media entity did not compile.');
    const tags = await runAsTenant(app.tenant, () =>
      runInUnitOfWork(app.db, async (em) => {
        await addTag(em, schema, id, 'brand');
        await em.flush();
        return (await listTags(em, schema, id)).rows.map((row) => row.tag);
      }),
    );
    expect(tags).toEqual(['brand']);
    await app.close();
  });

  it('MED-06 the list filters by name prefix, kind, folder, status, visibility, size and creation', async () => {
    const { app, uploader, manager } = await world();
    const folder = String(dataOf((await manager.post(FOLDERS, { name: 'Docs' })).body)['id']);
    const logo = await uploaded(app, uploader, { filename: 'Logo.png', contentType: 'image/png' }, PNG);
    const notes = await uploaded(
      app,
      uploader,
      { filename: 'notes.txt', contentType: 'text/plain', folderId: folder, visibility: 'public' },
      TEXT,
    );
    const pending = String(
      dataOf((await uploader.post(MEDIA, { filename: 'logo-2.png', contentType: 'image/png', size: 500 })).body)['id'],
    );
    const ids = async (query: string): Promise<unknown[]> =>
      listOf((await uploader.get(`${MEDIA}?${query}`)).body).map((row) => row['id']);
    expect(await ids('')).toEqual([pending, notes, logo]);
    expect(await ids('q=logo')).toEqual([pending, logo]);
    expect(await ids('q=LOGO-')).toEqual([pending]);
    expect(await ids('q=%25')).toEqual([]);
    expect(await ids('kind=image')).toEqual([pending, logo]);
    expect(await ids('kind=document')).toEqual([notes]);
    expect(await ids(`folderId=${folder}`)).toEqual([notes]);
    expect(await ids('status=pending')).toEqual([pending]);
    expect(await ids('visibility=public')).toEqual([notes]);
    expect(await ids(`sizeMin=${String(TEXT.length + 1)}&sizeMax=${String(PNG.length)}`)).toEqual([logo]);
    const now = Date.now();
    expect(await ids(`createdFrom=${new Date(now - HOUR).toISOString()}`)).toHaveLength(3);
    expect(await ids(`createdTo=${new Date(now - HOUR).toISOString()}`)).toEqual([]);
    expect((await uploader.get(`${MEDIA}?kind=spreadsheet`)).status).toBe(400);
    await app.close();
  });

  it('BPL-06 the list pages with a keyset cursor of at most 100 rows and counts with withTotal', async () => {
    const { app, uploader } = await world();
    for (let index = 0; index < 3; index += 1)
      await uploader.post(MEDIA, { filename: `f${String(index)}.png`, contentType: 'image/png', size: 9 });
    const first = await uploader.get(`${MEDIA}?pageSize=2&withTotal=true`);
    expect(listOf(first.body)).toHaveLength(2);
    expect(first.body['meta']).toMatchObject({ pageSize: 2, total: 3, nextCursor: expect.any(String) });
    const meta: Record<string, unknown> = Object(first.body['meta']);
    const second = await uploader.get(`${MEDIA}?pageSize=2&cursor=${encodeURIComponent(String(meta['nextCursor']))}`);
    expect(listOf(second.body)).toHaveLength(1);
    expect(second.body['meta']).toMatchObject({ nextCursor: null });
    // A larger page is clamped to 100 (DATA-06).
    expect((await uploader.get(`${MEDIA}?pageSize=101`)).body['meta']).toMatchObject({ pageSize: 100 });
    await app.close();
  });

  it('MED-07 size, type and the quota of the tenant are checked before a signed URL is given', async () => {
    const { app, uploader } = await world({
      pluginEnv: { MEDIA_MAX_SIZE_MB: 1, MEDIA_ALLOWED_TYPES: 'image/png,text/plain', MEDIA_TENANT_QUOTA_MB: 2 },
    });
    const MB = 1024 * 1024;
    const big = await uploader.post(MEDIA, { filename: 'big.png', contentType: 'image/png', size: MB + 1 });
    expect(big.status).toBe(413);
    expect(big.body['code']).toBe('MEDIA_TOO_LARGE');
    const pdf = await uploader.post(MEDIA, { filename: 'doc.pdf', contentType: 'application/pdf', size: 10 });
    expect(pdf.status).toBe(422);
    expect(pdf.body['code']).toBe('MEDIA_TYPE_REFUSED');
    expect((await uploader.post(MEDIA, { filename: 'a.png', contentType: 'image/png', size: MB })).status).toBe(201);
    const second = String(
      dataOf((await uploader.post(MEDIA, { filename: 'b.png', contentType: 'image/png', size: MB })).body)['id'],
    );
    const over = await uploader.post(MEDIA, { filename: 'c.png', contentType: 'image/png', size: 1 });
    expect(over.status).toBe(422);
    expect(over.body['code']).toBe('MEDIA_QUOTA_EXCEEDED');
    // Another tenant has its own quota.
    const other = app.withTenant('0190a0a0-0000-7000-8000-000000000001');
    const elsewhere = await other.actingAs(other.newUser(), ['uploader']);
    expect((await elsewhere.post(MEDIA, { filename: 'c.png', contentType: 'image/png', size: 1 })).status).toBe(201);
    // Before the URL the quota counts the other files only, so a file inside the quota is signed.
    expect((await uploader.post(`${MEDIA}/${second}/upload-url`, {})).status).toBe(200);
    await app.close();
  });

  it('BPL-05 each change writes its audit entry in its transaction', async () => {
    const { app, uploader, manager } = await world();
    const folder = String(dataOf((await manager.post(FOLDERS, { name: 'One' })).body)['id']);
    await manager.patch(`${FOLDERS}/${folder}`, { name: 'Two' }, 1);
    const id = await uploaded(app, uploader, { filename: 'logo.png', contentType: 'image/png' }, PNG);
    await manager.patch(`${MEDIA}/${id}`, { alt: 'x' }, 1);
    await manager.delete(`${MEDIA}/${id}`, 1);
    await manager.delete(`${FOLDERS}/${folder}`, 1);
    expect(await audits(app)).toEqual([
      'media.folder.created',
      'media.folder.renamed',
      'media.file.created',
      'media.file.confirmed',
      'media.file.updated',
      'media.file.deleted',
      'media.folder.deleted',
    ]);
    await app.close();
  });

  it('DATA-09 a file or folder of another tenant is not found', async () => {
    const { app, uploader, manager } = await world();
    const id = await uploaded(app, uploader, { filename: 'logo.png', contentType: 'image/png' }, PNG);
    const folder = String(dataOf((await manager.post(FOLDERS, { name: 'Mine' })).body)['id']);
    const other = app.withTenant('0190a0a0-0000-7000-8000-000000000002');
    const stranger = await other.actingAs(other.newUser(), ['manager']);
    expect((await stranger.get(`${MEDIA}/${id}`)).status).toBe(404);
    expect((await stranger.get(`${MEDIA}/${id}/url`)).status).toBe(404);
    expect((await stranger.delete(`${MEDIA}/${id}`, 1)).status).toBe(404);
    expect((await stranger.delete(`${FOLDERS}/${folder}`, 1)).status).toBe(404);
    expect(listOf((await stranger.get(MEDIA)).body)).toEqual([]);
    expect(keys(app)).toHaveLength(1);
    await app.close();
  });
});
