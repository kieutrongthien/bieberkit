/**
 * BieberKit
 *
 * @file        plugins/media/src/admin/lib/api.test.ts
 * @description The calls of the media library: a file sent to it, the record of a file and the address that shows it (UI-11, ADR 0036).
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

import { createAdminClient } from '@bieberkit/admin-core';
import { describe, expect, it } from 'vitest';
import { mediaApi } from './api.ts';
import type { MediaApi } from './api.ts';

interface Call {
  url: string;
  method: string;
  headers: Record<string, string>;
  body: unknown;
}

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

/** The calls of the library: those of the API through the client of the admin, and the bytes of a file straight to the storage. */
const api = (fetcher: typeof fetch): MediaApi => mediaApi(createAdminClient({ fetch: fetcher }), fetcher);

describe('UI-11 the media library', () => {
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
    const done = await api(fetcher).uploadFile(file);
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
    await expect(api(unsupported.fetch).uploadFile(file)).rejects.toMatchObject({
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
    await expect(api(refused.fetch).uploadFile(file)).rejects.toMatchObject({
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
    const client = api(fetcher);
    expect((await client.mediaFile('m1')).filename).toBe('a.pdf');
    expect(await client.mediaUrl('m1')).toBe('https://bucket.test/signed');
  });
});
