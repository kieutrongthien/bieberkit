/**
 * BieberKit
 *
 * @file        plugins/audit-log/src/jobs/mirror.ts
 * @description The job that copies an audit entry to the log for a SIEM, after commit (AUD-07).
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

/** What the outbox event of an audit entry carries (AUD-07). */
export interface RecordedEntry {
  readonly id: string;
  readonly at: string;
  readonly action: string;
  readonly entity: string | null;
  readonly recordId: string | null;
  readonly actorId: string | null;
  readonly requestId: string | null;
  readonly tenant: string | null;
  readonly reason: string | null;
  readonly data: unknown;
}

/** Copies an audit entry to the log as one structured line, after commit, for a shipper to carry to a SIEM (AUD-07). */
export const mirrorJob: JobDef<RecordedEntry> = defineJob<RecordedEntry>({
  name: 'audit-log.mirror',
  input: z.object({
    id: z.string(),
    at: z.string(),
    action: z.string(),
    entity: z.nullable(z.string()),
    recordId: z.nullable(z.string()),
    actorId: z.nullable(z.string()),
    requestId: z.nullable(z.string()),
    tenant: z.nullable(z.string()),
    reason: z.nullable(z.string()),
    data: z.unknown(),
  }),
  attempts: 10,
  handler(recorded, context) {
    // The logger redacts secrets and the configured keys (SEC-09). The entry had its personal data masked when it was written.
    context.log.info('audit', { audit: true, ...recorded });
  },
});
