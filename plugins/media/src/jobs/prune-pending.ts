/**
 * BieberKit
 *
 * @file        plugins/media/src/jobs/prune-pending.ts
 * @description The job that removes the records whose upload was never confirmed.
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

import { defineJob } from '@bieberkit/queue';
import type { JobDef } from '@bieberkit/queue';
import * as z from 'zod/mini';
import { runInTransaction } from '@bieberkit/data/orm';
import { boundOf } from '../services/media.ts';
import { classOf, removeWithObject } from '../services/records.ts';
import { Media } from '../entities/media.ts';

const HOUR = 3_600_000;

/** Deletes, in every tenant, the records still `pending` after the TTL, and their objects after commit (MED-03). */
export const prunePendingJob: JobDef<Record<string, never>> = defineJob<Record<string, never>>({
  name: 'media.prune-pending',
  input: z.object({}),
  async handler() {
    const { db, pendingTtlHours } = boundOf();
    const cutoff = new Date(Date.now() - pendingTtlHours * HOUR);
    await db.asSystem('media: delete files still pending after their TTL', () =>
      runInTransaction(db, async (em) => {
        const rows: unknown[] = await em.find(classOf(em, Media.name), {
          status: 'pending',
          createdAt: { $lt: cutoff },
        });
        for (const row of rows) removeWithObject(em, Object(row), 'media.file.expired');
        await em.flush();
      }),
    );
  },
});
