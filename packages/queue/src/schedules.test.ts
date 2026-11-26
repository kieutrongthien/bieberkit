/**
 * BieberKit
 *
 * @file        packages/queue/src/schedules.test.ts
 * @description Tests of the schedules that modules contribute: each becomes a schedule of the scheduler, named after its job, and a bad or repeated one is refused at boot (Q-07, NTF-05).
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
import { defineModule } from '@bieberkit/core';
import * as z from 'zod/mini';
import { defineJob } from './contract.ts';
import { schedulesOf } from './schedules.ts';

const prune = defineJob<Record<string, never>>({ name: 'notes.prune', input: z.object({}), handler: () => undefined });
const report = defineJob<{ readonly day: number }>({
  name: 'notes.report',
  input: z.object({ day: z.number() }),
  handler: () => undefined,
});

it('NTF-05 each schedule of a module becomes a schedule named after its job, with an empty input by default', () => {
  const modules = [
    defineModule({ name: 'notes', schedules: [{ job: prune, cron: '17 3 * * *' }] }),
    defineModule({ name: 'other', schedules: [{ job: report, cron: '0 6 * * 1', input: { day: 1 } }] }),
  ];
  expect(schedulesOf(modules)).toEqual([
    { name: 'notes.prune', cron: '17 3 * * *', job: prune, input: {} },
    { name: 'notes.report', cron: '0 6 * * 1', job: report, input: { day: 1 } },
  ]);
  expect(schedulesOf([defineModule({ name: 'none' })])).toEqual([]);
});

it('NTF-05 a cron that does not parse and a job scheduled twice are refused before the scheduler starts', () => {
  expect(() => schedulesOf([defineModule({ name: 'notes', schedules: [{ job: prune, cron: 'every day' }] })])).toThrow(
    expect.objectContaining({ code: 'QUEUE_CRON_INVALID' }),
  );
  const twice = defineModule({
    name: 'notes',
    schedules: [
      { job: prune, cron: '17 3 * * *' },
      { job: prune, cron: '0 4 * * *' },
    ],
  });
  expect(() => schedulesOf([twice])).toThrow(expect.objectContaining({ code: 'QUEUE_SCHEDULE_DUPLICATE' }));
});
