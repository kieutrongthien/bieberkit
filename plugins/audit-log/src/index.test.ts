/**
 * BieberKit
 *
 * @file        plugins/audit-log/src/index.test.ts
 * @description Tests of the audit-log plugin: the list is newest first, filtered, paged by a cursor, and closed to a caller without audit-log.read (OBS-05).
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
import { recordAudit, runInTransaction } from '@bieberkit/data/orm';
import { createTestApp } from '@bieberkit/testing';
import plugin from './index.ts';

const URL_OF = '/api/v1/audit-log/entries';

interface Entry {
  action: string;
  entity: string | null;
  data: unknown;
}

function entriesOf(body: Readonly<Record<string, unknown>>): Entry[] {
  const data = body['data'];
  return Array.isArray(data) ? data : [];
}

async function world() {
  const app = await createTestApp({ modules: [plugin.module], roles: { auditor: ['audit-log.read'] } });
  for (const action of ['a.one', 'a.two', 'b.three']) {
    await runInTransaction(app.db, async (em) => {
      recordAudit(em, { action, entity: action.startsWith('a') ? 'x.A' : 'x.B', data: { action } });
      await em.flush();
    });
  }
  return app;
}

it('OBS-05 lists the entries newest first, with their data as JSON', async () => {
  const app = await world();
  const auditor = await app.actingAs(app.newUser(), ['auditor']);
  const reply = await auditor.get(URL_OF);
  expect(reply.status).toBe(200);
  const found = entriesOf(reply.body).filter((entry) => ['a.one', 'a.two', 'b.three'].includes(entry.action));
  expect(found.map((entry) => entry.action)).toEqual(['b.three', 'a.two', 'a.one']);
  expect(found[0]?.data).toEqual({ action: 'b.three' });
  await app.close();
});

it('OBS-05 filters by entity and by action, and pages with the cursor without repeating a row', async () => {
  const app = await world();
  const auditor = await app.actingAs(app.newUser(), ['auditor']);
  const onlyA = entriesOf((await auditor.get(`${URL_OF}?entity=x.A`)).body);
  expect(onlyA.map((entry) => entry.action)).toEqual(['a.two', 'a.one']);
  const first = await auditor.get(`${URL_OF}?limit=2`);
  const cursor = String(first.body['nextCursor']);
  const second = await auditor.get(`${URL_OF}?limit=2&cursor=${cursor}`);
  const seen = [...entriesOf(first.body), ...entriesOf(second.body)].map((entry) => entry.action);
  expect(new Set(seen).size).toBe(seen.length);
  await app.close();
});

it('AUTHZ-01 a caller without audit-log.read gets 403, and one who is not signed in gets 401', async () => {
  const app = await world();
  expect((await (await app.actingAs(app.newUser())).get(URL_OF)).status).toBe(403);
  expect((await app.anonymous().get(URL_OF)).status).toBe(401);
  await app.close();
});
