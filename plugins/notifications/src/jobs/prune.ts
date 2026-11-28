/**
 * BieberKit
 *
 * @file        plugins/notifications/src/jobs/prune.ts
 * @description The job that deletes read notifications after their retention (NTF-05).
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
import { recordAudit, runInTransaction } from '@bieberkit/data/orm';
import { boundOf, classOf } from '../services/notifier.ts';
import { Notification } from '../entities/notification.ts';

/** Deletes read notifications older than the retention, and every expired one (NTF-05). */
export const pruneJob: JobDef<Record<string, never>> = defineJob<Record<string, never>>({
  name: 'notifications.prune',
  input: z.object({}),
  async handler() {
    const { db, retentionDays } = boundOf();
    const now = Date.now();
    await runInTransaction(db, async (em) => {
      const removed = await em.nativeDelete(classOf(em, Notification.name), {
        $or: [{ readAt: { $lt: new Date(now - retentionDays * 86_400_000) } }, { expiresAt: { $lt: new Date(now) } }],
      });
      recordAudit(em, {
        action: 'notifications.notification.pruned',
        entity: Notification.name,
        data: { count: removed },
      });
      await em.flush();
    });
  },
});
