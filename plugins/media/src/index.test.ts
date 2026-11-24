/**
 * BieberKit
 *
 * @file        plugins/media/src/index.test.ts
 * @description Tests of the media plugin: a record, a signed upload URL, the confirmation that checks the bytes, and the refusal of a file that is not what it said (S-01, S-02).
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
import { createTestApp } from '@bieberkit/testing';
import plugin, { pathOf } from './index.ts';

const MEDIA = '/api/v1/media/media';
/** A one pixel PNG, which the storage recognises by its bytes and not by its name. */
const PNG = Uint8Array.from(
  Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
    'base64',
  ),
);

const rowOf = (body: Readonly<Record<string, unknown>>): Record<string, unknown> => Object(body['data']);

async function world() {
  const app = await createTestApp({
    modules: [plugin.module],
    roles: { uploader: ['media.upload', 'media.read'] },
  });
  const uploader = await app.actingAs(app.newUser(), ['uploader']);
  return { app, uploader };
}

it('S-01 a record, a signed URL, the bytes sent to the disk and the confirmation make the file ready', async () => {
  const { app, uploader } = await world();
  const made = await uploader.post(MEDIA, { filename: 'logo.png', contentType: 'image/png', size: PNG.length });
  expect(made.status).toBe(201);
  const row = rowOf(made.body);
  expect(row['status']).toBe('pending');
  const signed = await uploader.post(`${MEDIA}/${String(row['id'])}/upload-url`, {});
  expect(signed.status).toBe(200);
  await app.disk.upload(String(signed.body['url']), Object(signed.body['headers']), PNG);
  const confirmed = await uploader.post(`${MEDIA}/${String(row['id'])}/confirm`, {});
  expect(confirmed.body).toMatchObject({ status: 'ready', size: PNG.length });
  expect(rowOf((await uploader.get(`${MEDIA}/${String(row['id'])}`)).body)['status']).toBe('ready');
  expect(await app.services.storage.exists(pathOf({ id: String(row['id']), filename: 'logo.png' }))).toBe(true);
  await app.close();
});

it('S-02 bytes that are not the type that was said are refused on confirm, and the file is deleted', async () => {
  const { app, uploader } = await world();
  const made = await uploader.post(MEDIA, { filename: 'fake.png', contentType: 'image/png', size: 5 });
  const id = String(rowOf(made.body)['id']);
  const signed = await uploader.post(`${MEDIA}/${id}/upload-url`, {});
  await app.disk.upload(String(signed.body['url']), Object(signed.body['headers']), new TextEncoder().encode('hello'));
  const confirmed = await uploader.post(`${MEDIA}/${id}/confirm`, {});
  expect(confirmed.status).toBeGreaterThanOrEqual(400);
  expect(rowOf((await uploader.get(`${MEDIA}/${id}`)).body)['status']).toBe('pending');
  expect(await app.services.storage.exists(pathOf({ id, filename: 'fake.png' }))).toBe(false);
  await app.close();
});

it('12 a file that does not exist is 404, a caller without media.upload gets 403, and a ready file gets no second URL', async () => {
  const { app, uploader } = await world();
  expect((await uploader.post(`${MEDIA}/0190f6b2-7c4e-7000-8000-0000000000c1/upload-url`, {})).status).toBe(404);
  expect(
    (await (await app.actingAs(app.newUser())).post(MEDIA, { filename: 'a.png', contentType: 'image/png', size: 1 }))
      .status,
  ).toBe(403);
  const made = await uploader.post(MEDIA, { filename: 'logo.png', contentType: 'image/png', size: PNG.length });
  const id = String(rowOf(made.body)['id']);
  const signed = await uploader.post(`${MEDIA}/${id}/upload-url`, {});
  await app.disk.upload(String(signed.body['url']), Object(signed.body['headers']), PNG);
  await uploader.post(`${MEDIA}/${id}/confirm`, {});
  expect((await uploader.post(`${MEDIA}/${id}/upload-url`, {})).status).toBe(409);
  await app.close();
});
