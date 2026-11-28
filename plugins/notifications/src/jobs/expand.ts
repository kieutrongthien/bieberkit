/**
 * BieberKit
 *
 * @file        plugins/notifications/src/jobs/expand.ts
 * @description The job that delivers a notification to many recipients in parts (NTF-06).
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
import { AuthUserRole } from '@bieberkit/auth';
import { MAX_DIRECT, boundOf } from '../services/notifier.ts';
import type { SendInput } from '../services/types.ts';

interface ExpandInput {
  readonly roleId: string;
  readonly tenant: string;
  readonly notification: Record<string, unknown>;
}

/** Sends to the holders of a large role, 100 at a time. The dedupe key of the job makes a second delivery send nothing (Q-01). */
export const expandJob: JobDef<ExpandInput> = defineJob<ExpandInput>({
  name: 'notifications.expand',
  input: z.object({ roleId: z.string(), tenant: z.string(), notification: z.record(z.string(), z.unknown()) }),
  async handler(job, context) {
    const { db, notifier } = boundOf();
    const holders = await runInTransaction(db, async (em) =>
      (await em.find(AuthUserRole, { tenant: job.tenant, roleId: job.roleId })).map((row) => row.userId),
    );
    // The payload went through JSON: the input was a SendInput without `to`, and its expiry is text now.
    // oxlint-disable-next-line typescript/no-unsafe-type-assertion
    const sent = job.notification as unknown as Omit<SendInput, 'to' | 'expiresAt'> & { readonly expiresAt?: string };
    const { expiresAt, ...notification } = sent;
    for (let start = 0; start < holders.length; start += MAX_DIRECT) {
      await notifier.send({
        ...notification,
        ...(expiresAt === undefined ? {} : { expiresAt: new Date(expiresAt) }),
        dedupeKey: notification.dedupeKey ?? `expand:${context.jobId}`,
        to: holders.slice(start, start + MAX_DIRECT),
      });
    }
  },
});
