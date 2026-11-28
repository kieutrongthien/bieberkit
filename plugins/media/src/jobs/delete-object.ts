/**
 * BieberKit
 *
 * @file        plugins/media/src/jobs/delete-object.ts
 * @description The job that deletes the object of a removed record from the storage, after commit.
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
import { boundOf } from '../services/media.ts';

/** Deletes the object of a deleted record, after commit. A delivery that fails is retried; a final failure leaves the job dead. */
export const deleteObjectJob: JobDef<{ readonly path: string }> = defineJob<{ readonly path: string }>({
  name: 'media.delete-object',
  input: z.object({ path: z.string() }),
  attempts: 10,
  async handler(job) {
    await boundOf().storage.delete(job.path);
  },
});
