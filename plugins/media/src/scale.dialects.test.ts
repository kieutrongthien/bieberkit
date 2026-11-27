/**
 * BieberKit
 *
 * @file        plugins/media/src/scale.dialects.test.ts
 * @description Tests that the media list reads 100 000 files through an index and answers inside a bound on three dialects (OPS-05).
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
import { entityOfSchema, runInUnitOfWork } from '@bieberkit/data/orm';
import { analyze, createTestApp, describeDialects, fullScans, planOf } from '@bieberkit/testing';
import plugin, { Media } from './index.ts';

const ROWS = 100_000;
const CHUNK = 2000;
const LIST = '/api/v1/media/media';
const BOUND_MS = 3000;

describeDialects('OPS-05 the media list at 100 000 files', ({ open, dialect }) => {
  it(
    'OPS-05 the list and its filters read through an index and the first page is fast',
    { timeout: 180_000 },
    async () => {
      const queries: string[] = [];
      const app = await createTestApp({
        modules: [plugin.module],
        open: (schemas) => open(schemas, { queryLog: (text) => void queries.push(text) }),
        roles: { reader: ['media.read'] },
      });
      const schema = app.schemas.find((each) => entityOfSchema(each).name === Media.name);
      if (schema === undefined) throw new Error('The media entity did not compile.');
      const now = new Date();
      for (let from = 0; from < ROWS; from += CHUNK) {
        await runInUnitOfWork(app.db, async (em) => {
          const rows = [];
          for (let n = from; n < from + CHUNK; n += 1) {
            rows.push({
              id: uuid7(),
              tenantId: app.tenant,
              filename: `file-${String(n)}.png`,
              nameKey: `file-${String(n)}.png`,
              contentType: 'image/png',
              kind: n % 2 === 0 ? 'image' : 'document',
              size: 1000 + n,
              status: 'ready',
              visibility: 'private',
              createdAt: now,
              updatedAt: now,
              version: 1,
            });
          }
          await em.insertMany(schema, rows);
        });
      }
      await analyze(app.db, 'bk_media');
      const reader = await app.actingAs(app.newUser(), ['reader']);
      const filters = ['', 'q=file-77', 'kind=image', 'status=ready'];
      for (const filter of filters) {
        queries.length = 0;
        const started = Date.now();
        const reply = await reader.get(`${LIST}?${filter}`);
        const took = Date.now() - started;
        expect(reply.status).toBe(200);
        expect(took, `${filter || 'no filter'} took ${String(took)} ms`).toBeLessThan(BOUND_MS);
        const select = queries.find((text) => /from\s+["`]?bk_media\b/i.test(text) && /limit/i.test(text));
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
