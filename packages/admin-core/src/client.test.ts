/**
 * BieberKit
 *
 * @file        packages/admin-core/src/client.test.ts
 * @description Tests of the client of the admin: the session, the sign in, the metadata, the list with its paging and sort, a save with If-Match, and the problems of the API as one error (UI-02, API-13).
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
import { AdminApiError, createAdminClient } from './client.ts';
import type { MetaEntity } from './types.ts';

interface Call {
  url: string;
  method: string;
  headers: Record<string, string>;
  body: unknown;
}

const ENTITY: MetaEntity = {
  name: 'settings.Setting',
  path: '/api/v1/settings/settings',
  label: { en: 'Setting' },
  operations: { list: true, get: true, create: true, update: true, delete: true },
  can: { read: true, create: true, update: true, delete: true },
  softDelete: false,
  tenant: false,
  list: ['key'],
  form: ['key', 'value'],
  fields: [],
};

function fake(answer: (call: Call) => Response): { fetch: typeof fetch; calls: Call[] } {
  const calls: Call[] = [];
  const fetcher: typeof fetch = async (input, init) => {
    const headers = Object.fromEntries(Object.entries(Object(init?.headers))) as Record<string, string>;
    const call: Call = {
      url: typeof input === 'string' ? input : input instanceof URL ? input.href : input.url,
      method: init?.method ?? 'GET',
      headers,
      body: typeof init?.body === 'string' ? JSON.parse(init.body) : undefined,
    };
    calls.push(call);
    return answer(call);
  };
  return { fetch: fetcher, calls };
}

const json = (body: unknown, status = 200): Response =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

describe('UI-18 the 412 of an update', () => {
  it('UI-18 carries the row as it is now, so that the form can show what changed', async () => {
    const answered = fake(() =>
      json(
        {
          code: 'DATA_VERSION_STALE',
          detail: 'The row changed.',
          fix: 'Reload.',
          current: { id: 'r1', version: 3, updatedBy: 'u2' },
        },
        412,
      ),
    );
    const error = await createAdminClient({ fetch: answered.fetch })
      .update(ENTITY, 'r1', { key: 'k' }, 2)
      .catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(AdminApiError);
    expect(error).toMatchObject({ status: 412, current: { id: 'r1', version: 3, updatedBy: 'u2' } });
  });

  it('UI-18 has no current row for another failure', async () => {
    const answered = fake(() => json({ code: 'X' }, 500));
    const error = await createAdminClient({ fetch: answered.fetch })
      .get(ENTITY, 'r1')
      .catch((caught: unknown) => caught);
    expect(error).toMatchObject({ status: 500, current: undefined });
  });
});

describe('UI-02 the client of the admin', () => {
  it('reads the user of the session, and says there is none when the answer has no user', async () => {
    const some = fake(() => json({ user: { id: 'u1', email: 'a@b.co', name: 'Ann' }, session: {} }));
    expect(await createAdminClient({ fetch: some.fetch }).session()).toEqual({
      id: 'u1',
      email: 'a@b.co',
      name: 'Ann',
    });
    expect(some.calls[0]?.url).toBe('/api/auth/get-session');
    const none = fake(() => json(null));
    expect(await createAdminClient({ fetch: none.fetch }).session()).toBeUndefined();
  });

  it('signs in with the email and the password, and signs out', async () => {
    const { fetch: fetcher, calls } = fake((call) =>
      call.url.endsWith('sign-in/email')
        ? json({ user: { id: 'u1', email: 'a@b.co', name: 'Ann' } })
        : json({ success: true }),
    );
    const client = createAdminClient({ fetch: fetcher });
    expect(await client.signIn('a@b.co', 'secret')).toMatchObject({ kind: 'signedIn', user: { id: 'u1' } });
    await client.signOut();
    expect(calls.map((call) => [call.method, call.url])).toEqual([
      ['POST', '/api/auth/sign-in/email'],
      ['POST', '/api/auth/sign-out'],
    ]);
    expect(calls[0]?.body).toEqual({ email: 'a@b.co', password: 'secret' });
  });

  it('lists a page with the paging and the sort that were asked, and the total', async () => {
    const { fetch: fetcher, calls } = fake(() =>
      json({ data: [{ id: '1', key: 'a' }], meta: { pageSize: 10, page: 2, total: 31 } }),
    );
    const page = await createAdminClient({ fetch: fetcher, baseUrl: 'http://x.test' }).list(ENTITY, {
      page: 2,
      pageSize: 10,
      sort: '-key',
      fields: ['id', 'key'],
    });
    expect(page).toEqual({ rows: [{ id: '1', key: 'a' }], page: 2, pageSize: 10, total: 31 });
    expect(calls[0]?.url).toBe(
      'http://x.test/api/v1/settings/settings?page=2&pageSize=10&withTotal=true&sort=-key&fields=id%2Ckey',
    );
  });

  it('UI-03 sends the filters as filter[field][op], and refuses one that the API would refuse before any call is made', async () => {
    const { fetch: fetcher, calls } = fake(() => json({ data: [], meta: { page: 1, pageSize: 25 } }));
    const entity: MetaEntity = {
      ...ENTITY,
      fields: [
        {
          key: 'tier',
          kind: 'oneOf',
          widget: 'select',
          required: false,
          readOnly: false,
          filterable: true,
          sortable: false,
          values: ['basic', 'gold'],
        },
      ],
    };
    const client = createAdminClient({ fetch: fetcher, baseUrl: 'http://x.test' });
    await client.list(entity, { filters: [{ field: 'tier', op: 'in', value: 'gold,basic' }] });
    expect(decodeURIComponent(calls[0]?.url ?? '')).toContain('filter[tier][in]=gold,basic');
    await expect(client.list(entity, { filters: [{ field: 'tier', op: 'eq', value: 'platinum' }] })).rejects.toThrow(
      /tier/,
    );
    expect(calls).toHaveLength(1);
  });

  it('UI-03 a bulk call names the rows with the version that was read, and gives back the outcome of each', async () => {
    const { fetch: fetcher, calls } = fake(() =>
      json({
        data: [
          { id: '1', status: 'ok', version: 2 },
          { id: '2', status: 'conflict', error: { code: 'DATA_VERSION_STALE', message: 'Changed.' } },
        ],
      }),
    );
    const client = createAdminClient({ fetch: fetcher });
    const result = await client.bulk(
      ENTITY,
      [
        { id: '1', version: 1 },
        { id: '2', version: 4 },
      ],
      { operation: 'delete' },
    );
    expect(calls[0]?.method).toBe('POST');
    expect(calls[0]?.url).toBe('/api/v1/settings/settings/bulk');
    expect(calls[0]?.body).toEqual({
      operation: 'delete',
      items: [
        { id: '1', version: 1 },
        { id: '2', version: 4 },
      ],
    });
    expect(result).toEqual({
      kind: 'done',
      outcomes: [
        { id: '1', status: 'ok', version: 2 },
        { id: '2', status: 'conflict', error: { code: 'DATA_VERSION_STALE', message: 'Changed.' } },
      ],
    });
  });

  it('UI-11 a file goes to the library: a record, the bytes to the storage with the signed headers and no cookie, then the confirm', async () => {
    const made = {
      id: 'm1',
      filename: 'logo.png',
      contentType: 'image/png',
      kind: 'image',
      size: 4,
      status: 'pending',
    };
    const { fetch: fetcher, calls } = fake((call) => {
      if (call.url === '/api/v1/media' && call.method === 'POST') return json({ data: made }, 201);
      if (call.url.endsWith('/upload-url'))
        return json({
          url: 'https://bucket.test/k?sig=1',
          method: 'PUT',
          headers: { 'content-type': 'image/png' },
          expiresAt: 1,
        });
      if (call.url.startsWith('https://bucket.test')) return new Response(null, { status: 200 });
      if (call.url.endsWith('/confirm')) return json({ id: 'm1', status: 'ready', size: 4 });
      return json({ data: { ...made, status: 'ready' } });
    });
    const file = new File([new Uint8Array([1, 2, 3, 4])], 'Logo (new).png', { type: 'image/png' });
    const done = await createAdminClient({ fetch: fetcher }).uploadFile(file);
    expect(done).toMatchObject({ id: 'm1', status: 'ready' });
    expect(calls.map((call) => [call.method, call.url])).toEqual([
      ['POST', '/api/v1/media'],
      ['POST', '/api/v1/media/m1/upload-url'],
      ['PUT', 'https://bucket.test/k?sig=1'],
      ['POST', '/api/v1/media/m1/confirm'],
      ['GET', '/api/v1/media/m1'],
    ]);
    expect(calls[0]?.body).toEqual({ filename: 'Logo_new_.png', contentType: 'image/png', size: 4 });
    expect(calls[2]?.headers['content-type']).toBe('image/png');
  });

  it('UI-11 a disk that cannot sign is an error with its code, and a storage that refuses the bytes is one too', async () => {
    const unsupported = fake((call) =>
      call.url === '/api/v1/media'
        ? json(
            {
              data: {
                id: 'm1',
                filename: 'a.png',
                contentType: 'image/png',
                kind: 'image',
                size: 1,
                status: 'pending',
              },
            },
            201,
          )
        : json({ code: 'STORAGE_SIGNING_UNSUPPORTED', detail: 'The local disk cannot sign URLs.' }, 500),
    );
    const file = new File([new Uint8Array([1])], 'a.png', { type: 'image/png' });
    await expect(createAdminClient({ fetch: unsupported.fetch }).uploadFile(file)).rejects.toMatchObject({
      code: 'STORAGE_SIGNING_UNSUPPORTED',
    });
    const refused = fake((call) => {
      if (call.url === '/api/v1/media')
        return json(
          {
            data: { id: 'm1', filename: 'a.png', contentType: 'image/png', kind: 'image', size: 1, status: 'pending' },
          },
          201,
        );
      if (call.url.endsWith('/upload-url'))
        return json({ url: 'https://bucket.test/k', method: 'PUT', headers: {}, expiresAt: 1 });
      return new Response(null, { status: 403 });
    });
    await expect(createAdminClient({ fetch: refused.fetch }).uploadFile(file)).rejects.toMatchObject({
      code: 'ADMIN_UPLOAD_REFUSED',
    });
  });

  it('UI-11 reads the record of a file and an address that shows it', async () => {
    const { fetch: fetcher } = fake((call) =>
      call.url.endsWith('/url')
        ? json({ url: 'https://bucket.test/signed', expiresAt: 1 })
        : json({
            data: {
              id: 'm1',
              filename: 'a.pdf',
              contentType: 'application/pdf',
              kind: 'document',
              size: 9,
              status: 'ready',
            },
          }),
    );
    const client = createAdminClient({ fetch: fetcher });
    expect((await client.mediaFile('m1')).filename).toBe('a.pdf');
    expect(await client.mediaUrl('m1')).toBe('https://bucket.test/signed');
  });

  it('UI-11 a list asks for a search with q, and leaves it out when the text is empty', async () => {
    const { fetch: fetcher, calls } = fake(() => json({ data: [], meta: { page: 1, pageSize: 20 } }));
    const client = createAdminClient({ fetch: fetcher });
    await client.list(ENTITY, { pageSize: 20, q: ' nguyen l ' });
    await client.list(ENTITY, { q: '   ', include: ['owner'] });
    expect(calls[0]?.url).toContain('q=nguyen+l');
    expect(calls[1]?.url).not.toContain('q=');
    expect(calls[1]?.url).toContain('include=owner');
  });

  it('UI-03 the history of a row is read from the audit log by entity and record', async () => {
    const { fetch: fetcher, calls } = fake(() =>
      json({
        data: [
          {
            id: 'e1',
            at: '2026-03-05T10:00:00.000Z',
            action: 'settings.Setting.update',
            actor: { name: 'Ann' },
            data: { fields: ['value'] },
          },
        ],
      }),
    );
    const entries = await createAdminClient({ fetch: fetcher }).history(ENTITY, '1');
    expect(calls[0]?.url).toBe('/api/v1/audit-log/entries?entity=settings.Setting&recordId=1&pageSize=20');
    expect(entries.map((entry) => [entry.who, entry.fields])).toEqual([['Ann', ['value']]]);
  });

  it('UI-03 a move of a state field is a POST to the action of the row, with If-Match and the input', async () => {
    const { fetch: fetcher, calls } = fake(() => json({ data: { id: '1', status: 'closed', version: 3 } }));
    const row = await createAdminClient({ fetch: fetcher }).transition(ENTITY, '1', 'close', 2, { reason: 'done' });
    expect(row['status']).toBe('closed');
    expect([calls[0]?.method, calls[0]?.url, calls[0]?.headers['if-match'], calls[0]?.body]).toEqual([
      'POST',
      '/api/v1/settings/settings/1/actions/close',
      '2',
      { reason: 'done' },
    ]);
  });

  it('UI-03 a bulk call that is too large to wait for is a job, and the client says so', async () => {
    const { fetch: fetcher } = fake(() => json({ data: { jobId: 'job-1', status: 'queued' } }, 202));
    const result = await createAdminClient({ fetch: fetcher }).bulk(ENTITY, [{ id: '1', version: 1 }], {
      operation: 'update',
      data: { value: 'x' },
    });
    expect(result).toEqual({ kind: 'queued', jobId: 'job-1' });
  });

  it('creates, updates with If-Match, and deletes with If-Match', async () => {
    const { fetch: fetcher, calls } = fake((call) =>
      call.method === 'DELETE'
        ? new Response(null, { status: 204 })
        : json({ data: { id: '1', version: 2 } }, call.method === 'POST' ? 201 : 200),
    );
    const client = createAdminClient({ fetch: fetcher });
    expect((await client.create(ENTITY, { key: 'a' }))['id']).toBe('1');
    await client.update(ENTITY, '1', { value: 'b' }, 1);
    await client.remove(ENTITY, '1', 2);
    expect(calls.map((call) => [call.method, call.headers['if-match']])).toEqual([
      ['POST', undefined],
      ['PATCH', '1'],
      ['DELETE', '2'],
    ]);
  });

  it('turns a problem of the API into one error with its code, its fix and the fields that were refused', async () => {
    const { fetch: fetcher } = fake(() =>
      json(
        {
          code: 'HTTP_VALIDATION_FAILED',
          detail: 'The request is not valid.',
          fix: 'Fix the fields.',
          errors: [{ path: 'body.key', code: 'minLength', message: 'must have at least 1 character' }],
        },
        400,
      ),
    );
    const failure = await createAdminClient({ fetch: fetcher })
      .create(ENTITY, {})
      .catch((error: unknown) => error);
    expect(failure).toBeInstanceOf(AdminApiError);
    expect(failure).toMatchObject({
      status: 400,
      code: 'HTTP_VALIDATION_FAILED',
      message: 'The request is not valid.',
      fix: 'Fix the fields.',
      problems: [{ path: 'body.key', code: 'minLength', message: 'must have at least 1 character' }],
    });
  });

  it('reads the error of Better Auth, which has a message and no detail, and an answer that is not JSON', async () => {
    const auth = fake(() => json({ code: 'INVALID_EMAIL_OR_PASSWORD', message: 'Invalid email or password' }, 401));
    expect(
      await createAdminClient({ fetch: auth.fetch })
        .signIn('a', 'b')
        .catch((error: unknown) => error),
    ).toMatchObject({
      status: 401,
      code: 'INVALID_EMAIL_OR_PASSWORD',
      message: 'Invalid email or password',
    });
    const html = fake(() => new Response('<html>', { status: 502 }));
    expect(
      await createAdminClient({ fetch: html.fetch })
        .meta()
        .catch((error: unknown) => error),
    ).toMatchObject({
      status: 502,
      code: 'HTTP_502',
    });
  });
});

describe('UI-34 the request of a plugin', () => {
  it('UI-34 a plugin calls its own routes through the client, which sends and fails like every other call', async () => {
    const answered = fake((call) =>
      call.url.endsWith('/fail') ? json({ code: 'X_NO', detail: 'No.', fix: 'Ask.' }, 409) : json({ data: [1] }),
    );
    const client = createAdminClient({ fetch: answered.fetch });
    expect(
      await client.request('POST', '/api/v1/notes/items', { body: { a: 1 }, headers: { 'if-match': '2' } }),
    ).toEqual({ data: [1] });
    expect(answered.calls[0]).toMatchObject({
      method: 'POST',
      url: '/api/v1/notes/items',
      body: { a: 1 },
      headers: { 'if-match': '2', 'content-type': 'application/json' },
    });
    await expect(client.request('GET', '/api/v1/notes/fail')).rejects.toMatchObject({
      name: 'AdminApiError',
      status: 409,
      code: 'X_NO',
      fix: 'Ask.',
    });
  });
});
