/**
 * BieberKit
 *
 * @file        packages/http/src/entity-files.test.ts
 * @description Tests of the file fields of an entity: a write names a media record, and it is refused at the field unless the file is uploaded, is of a type that the field takes, and is the caller's to use (UI-11, ADR 0036).
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

import { createContainer } from '@bieberkit/core';
import { describe, expect, it } from 'vitest';
import { entityApp } from './entity-app.ts';
import { acceptsType } from './files.ts';
import { HttpError } from './problem.ts';

const BASE = '/api/v1/crm/accounts';
const PDF = '11111111-1111-4111-8111-111111111111';
const PNG = '22222222-2222-4222-8222-222222222222';
const PENDING = '33333333-3333-4333-8333-333333333333';
const OTHER = '44444444-4444-4444-8444-444444444444';

const FILES: Record<string, { status: string; contentType: string }> = {
  [PDF]: { status: 'ready', contentType: 'application/pdf' },
  [PNG]: { status: 'ready', contentType: 'image/png' },
  [PENDING]: { status: 'pending', contentType: 'application/pdf' },
};

/** The services of an app that has a media plugin: `get` answers a file, or 404 for one that is not there or is of another tenant. */
async function withMedia() {
  const container = createContainer();
  // The media plugin declares this name in its own package; the test stands in for it.
  // @ts-expect-error `media` is a name of the plugin, not of the packages that this test sees
  container.register('media', {
    scope: 'singleton',
    create: () => ({
      get: async (id: string) => {
        const found = FILES[id];
        if (found === undefined) throw new HttpError('MEDIA_NOT_FOUND', 404, 'No such file.', 'Check the id.');
        return found;
      },
    }),
  });
  await container.boot();
  return container.services;
}

let seq = 0;
const make = (extra: Record<string, unknown>) => ({ code: `F${(seq += 1)}`, name: `File ${seq}`, ...extra });

const errors = (body: string): { path: string; code: string }[] => JSON.parse(body).errors ?? [];

describe('UI-11 the types that a file field takes', () => {
  it('UI-11 a pattern with a star takes the types of its family, an exact type takes itself, and none takes any', () => {
    expect(acceptsType(['image/*'], 'image/png')).toBe(true);
    expect(acceptsType(['image/*'], 'application/pdf')).toBe(false);
    expect(acceptsType(['application/pdf'], 'Application/PDF; charset=x')).toBe(true);
    expect(acceptsType(['application/pdf', 'image/png'], 'image/png')).toBe(true);
    expect(acceptsType([], 'anything/at-all')).toBe(true);
  });
});

describe('UI-11 a write that names a file', () => {
  it('UI-11 is accepted when the file is uploaded and of a type that the field takes, and null clears it', async () => {
    const app = await entityApp({ services: await withMedia() });
    const made = await app.server.inject({ method: 'POST', url: BASE, payload: make({ contract: PDF, logo: PNG }) });
    expect(`${String(made.statusCode)} ${made.body.slice(0, 160)}`).toMatch(/^201 /);
    const data = JSON.parse(made.body).data;
    expect([data.contract, data.logo]).toEqual([PDF, PNG]);
    const cleared = await app.server.inject({
      method: 'PATCH',
      url: `${BASE}/${String(data.id)}`,
      headers: { 'if-match': String(data.version) },
      payload: { contract: null },
    });
    expect(cleared.statusCode).toBe(200);
    expect(JSON.parse(cleared.body).data.contract).toBeNull();
  });

  it('UI-11 is refused at the field when the file is not uploaded, is of another type, or is not there, and nothing is made', async () => {
    const app = await entityApp({ services: await withMedia() });
    const send = (payload: Record<string, unknown>) =>
      app.server.inject({ method: 'POST', url: BASE, payload: make(payload) });
    const pending = await send({ contract: PENDING });
    expect([pending.statusCode, errors(pending.body)[0]?.path]).toEqual([400, 'body.contract']);
    const wrong = await send({ contract: PNG });
    expect([wrong.statusCode, errors(wrong.body)[0]?.path]).toEqual([400, 'body.contract']);
    const notImage = await send({ logo: PDF });
    expect([notImage.statusCode, errors(notImage.body)[0]?.path]).toEqual([400, 'body.logo']);
    const gone = await send({ logo: OTHER });
    expect([gone.statusCode, errors(gone.body)[0]?.path]).toEqual([400, 'body.logo']);
    const list = JSON.parse((await app.server.inject({ method: 'GET', url: BASE })).body);
    expect(list.data).toEqual([]);
  });

  it('UI-11 says all the files that are wrong together', async () => {
    const app = await entityApp({ services: await withMedia() });
    const reply = await app.server.inject({ method: 'POST', url: BASE, payload: make({ contract: PNG, logo: PDF }) });
    expect(
      errors(reply.body)
        .map((issue) => issue.path)
        .toSorted(),
    ).toEqual(['body.contract', 'body.logo']);
  });

  it('UI-11 a record with no file does not need the media plugin, and one that names a file without it is a server problem', async () => {
    const app = await entityApp();
    expect((await app.server.inject({ method: 'POST', url: BASE, payload: make({}) })).statusCode).toBe(201);
    const reply = await app.server.inject({ method: 'POST', url: BASE, payload: make({ contract: PDF }) });
    expect(reply.statusCode).toBe(500);
    expect(JSON.parse(reply.body).code).toBe('HTTP_MEDIA_MISSING');
  });
});
