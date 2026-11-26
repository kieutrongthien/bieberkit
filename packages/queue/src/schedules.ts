/**
 * BieberKit
 *
 * @file        packages/queue/src/schedules.ts
 * @description The schedules that modules contribute, turned into the schedules of the scheduler, named after their jobs and checked before it starts (Q-07, NTF-05).
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

import type { ModuleDef } from '@bieberkit/core';
import type { JobDef } from './contract.ts';
import { queueError } from './contract.ts';
import { parseCron } from './cron.ts';
import type { Schedule } from './scheduler.ts';

/** A job that a module runs on a clock: `cron` has five fields, in UTC. The input defaults to an empty object. */
export interface ScheduleContribution<Input = unknown> {
  readonly job: JobDef<Input>;
  readonly cron: string;
  readonly input?: Input;
}

/** The schedules of the modules, for `createScheduler`. A cron that does not parse, or a job scheduled twice, stops the boot. */
export function schedulesOf(modules: readonly ModuleDef[]): Schedule[] {
  const out: Schedule[] = [];
  const names = new Set<string>();
  for (const module of modules) {
    const listed: unknown = module.contributions['schedules'];
    if (!Array.isArray(listed)) continue;
    // A module that declares the key gives the list of this type, by the declaration merging below.
    // oxlint-disable-next-line typescript/no-unsafe-type-assertion
    for (const item of listed as readonly ScheduleContribution[]) {
      parseCron(item.cron);
      if (names.has(item.job.name)) {
        throw queueError(
          'QUEUE_SCHEDULE_DUPLICATE',
          500,
          `The job ${item.job.name} is scheduled twice.`,
          'Give each job one schedule, or make a second job.',
        );
      }
      names.add(item.job.name);
      out.push({ name: item.job.name, cron: item.cron, job: item.job, input: item.input ?? {} });
    }
  }
  return out;
}
