/**
 * BieberKit
 *
 * @file        plugins/audit-log/src/scale.dialects.test.ts
 * @description Tests that the audit list reads 100 000 entries through an index and answers inside a bound on three dialects (OPS-05).
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
import { uuid7 } from '@bieberkit/data';
import { AuditLog, runInUnitOfWork } from '@bieberkit/data/orm';
import { analyze, createTestApp, describeDialects, fullScans, planOf } from '@bieberkit/testing';
import plugin from './index.ts';

const ROWS = 100_000;
const CHUNK = 2000;
const ENTRIES = '/api/v1/audit-log/entries';
// Generous, so that a loaded CI machine passes. A scan of the whole table on this data is slower than this by a wide margin.
const BOUND_MS = 3000;

describeDialects('OPS-05 the audit list at 100 000 entries', ({ open, dialect }) => {
  it(
    'OPS-05 every filter of the list reads through an index and the first page is fast',
    { timeout: 180_000 },
    async () => {
      const queries: string[] = [];
      const app = await createTestApp({
        modules: [plugin.module],
        open: (schemas) => open(schemas, { queryLog: (text) => void queries.push(text) }),
        roles: { auditor: ['audit-log.read'] },
      });
      const actor = app.newUser();
      const record = uuid7();
      const base = Date.now() - ROWS * 1000;
      for (let from = 0; from < ROWS; from += CHUNK) {
        await runInUnitOfWork(app.db, async (em) => {
          for (let n = from; n < from + CHUNK; n += 1) {
            em.create(AuditLog, {
              id: uuid7(),
              at: new Date(base + n * 1000),
              action: `scale.action.${String(n % 50)}`,
              entity: `scale.Entity${String(n % 20)}`,
              recordId: n === 777 ? record : uuid7(),
              actorId: n % 1000 === 0 ? actor.id : uuid7(),
              requestId: `req-${String(n)}`,
              tenant: app.tenant,
            });
          }
          await em.flush();
        });
      }
      await analyze(app.db, 'bk_audit_log');
      const auditor = await app.actingAs(app.newUser(), ['auditor']);
      const filters = [
        '',
        'action=scale.action.7',
        'action=scale.action.1*',
        'entity=scale.Entity3',
        `recordId=${record}`,
        `actorId=${actor.id}`,
        'requestId=req-5000',
      ];
      for (const filter of filters) {
        queries.length = 0;
        const started = Date.now();
        const reply = await auditor.get(`${ENTRIES}?${filter}`);
        const took = Date.now() - started;
        expect(reply.status).toBe(200);
        expect(took, `${filter || 'no filter'} took ${String(took)} ms`).toBeLessThan(BOUND_MS);
        const select = queries.find((text) => /from\s+["`]?bk_audit_log\b/i.test(text) && /limit/i.test(text));
        expect(select, `no list query for ${filter}`).toBeDefined();
        // No COUNT(*) unless the caller asks for withTotal (OPS-05).
        expect(queries.filter((text) => /\bcount\s*\(/i.test(text))).toEqual([]);
        const plan = await planOf(app.db, String(select));
        expect(fullScans(plan, dialect), `${filter || 'no filter'}: ${plan.join(' | ')}`).toEqual([]);
      }
      await app.close();
    },
  );
});
