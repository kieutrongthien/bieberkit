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
    expect((await client.signIn('a@b.co', 'secret')).id).toBe('u1');
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
