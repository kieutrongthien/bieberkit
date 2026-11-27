/**
 * BieberKit
 *
 * @file        packages/http/src/entity-conditions.test.ts
 * @description Tests of the conditions of a field on the routes of an entity: a field that is hidden is dropped, a field that is required by its condition is refused at the field, on create, update and bulk update (UI-11).
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
import { entityApp } from './entity-app.ts';
import type { EntityApp } from './entity-app.ts';

const BASE = '/api/v1/crm/accounts';

interface Body {
  data?: Record<string, unknown> & { id?: string; version?: number };
  errors?: { path: string; code: string; message: string }[];
}

const json = (text: string): Body => (text === '' ? {} : JSON.parse(text));

let seq = 0;
const valid = (extra: Record<string, unknown> = {}): Record<string, unknown> => ({
  code: `C${(seq += 1)}`,
  name: `Cond ${seq}`,
  ...extra,
});

const post = (app: EntityApp, payload: Record<string, unknown>) =>
  app.server.inject({ method: 'POST', url: BASE, payload: valid(payload) });

describe('UI-11 a field that its condition requires', () => {
  it('UI-11 is refused at the field when it has no value, and accepted when it has one', async () => {
    const app = await entityApp();
    const missing = await post(app, { active: false });
    expect(missing.statusCode).toBe(400);
    expect(json(missing.body).errors).toEqual([expect.objectContaining({ path: 'body.reason', code: 'required' })]);
    expect((await post(app, { active: false, reason: 'closed' })).statusCode).toBe(201);
  });

  it('UI-11 is not required when its condition does not hold', async () => {
    const app = await entityApp();
    expect((await post(app, { active: true })).statusCode).toBe(201);
    expect((await post(app, {})).statusCode).toBe(201);
  });

  it('UI-11 on an update it counts the value that the row has, so a change of the other field asks for it', async () => {
    const app = await entityApp();
    const made = json((await post(app, {})).body).data;
    const url = `${BASE}/${String(made?.id)}`;
    const headers = { 'if-match': String(made?.version) };
    const refused = await app.server.inject({ method: 'PATCH', url, headers, payload: { active: false } });
    expect(refused.statusCode).toBe(400);
    expect(json(refused.body).errors?.[0]?.path).toBe('body.reason');
    const done = await app.server.inject({
      method: 'PATCH',
      url,
      headers,
      payload: { active: false, reason: 'closed' },
    });
    expect(done.statusCode).toBe(200);
    // The field has its value now, so a later change that leaves the tier alone does not ask again.
    const next = await app.server.inject({
      method: 'PATCH',
      url,
      headers: { 'if-match': String(json(done.body).data?.version) },
      payload: { name: 'Renamed' },
    });
    expect(next.statusCode).toBe(200);
  });
});

describe('UI-11 a field that its condition hides', () => {
  it('UI-11 is not part of a write: a value that is sent for it is dropped', async () => {
    const app = await entityApp();
    const made = await post(app, { active: true, reason: 'ignored' });
    expect(made.statusCode).toBe(201);
    expect(json(made.body).data?.['reason']).toBeNull();
  });

  it('UI-11 keeps the value that a stored row has when the field is hidden by a later change', async () => {
    const app = await entityApp();
    const made = json((await post(app, { active: false, reason: 'first' })).body).data;
    const changed = await app.server.inject({
      method: 'PATCH',
      url: `${BASE}/${String(made?.id)}`,
      headers: { 'if-match': String(made?.version) },
      payload: { active: true, reason: 'second' },
    });
    expect(changed.statusCode).toBe(200);
    expect(json(changed.body).data?.['reason']).toBe('first');
  });
});

describe('UI-11 the same rules in a bulk update', () => {
  it('UI-11 a row that the change would leave without a required value is invalid, and the others are changed', async () => {
    const app = await entityApp();
    const withBonus = json((await post(app, { active: false, reason: 'has one' })).body).data;
    const without = json((await post(app, {})).body).data;
    const response = await app.server.inject({
      method: 'POST',
      url: `${BASE}/bulk`,
      payload: {
        operation: 'update',
        data: { active: false },
        items: [
          { id: withBonus?.id, version: withBonus?.version },
          { id: without?.id, version: without?.version },
        ],
      },
    });
    expect(response.statusCode).toBe(200);
    const answer: { data: { id: string; status: string; error?: { code: string } }[] } = JSON.parse(response.body);
    const outcomes = answer.data;
    expect(outcomes.map((outcome) => outcome.status)).toEqual(['ok', 'invalid']);
    expect(outcomes[1]?.error?.code).toBe('HTTP_VALIDATION_FAILED');
  });
});
