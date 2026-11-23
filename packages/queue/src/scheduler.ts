/**
 * BieberKit
 *
 * @file        packages/queue/src/scheduler.ts
 * @description The scheduler: it dispatches the jobs of its cron schedules, once for each tick, whatever the number of schedulers that run (Q-07).
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

import { randomUUID } from 'node:crypto';
import { rawKysely } from '@bieberkit/data/orm';
import type { Database } from '@bieberkit/data/orm';
import { parseCron } from './cron.ts';
import type { Cron } from './cron.ts';
import type { JobDef, Queue } from './contract.ts';
import { queueError } from './contract.ts';
import { LOCKS_TABLE } from './tables.ts';

export interface Schedule<Input = unknown> {
  /** Unique. It names the lock and the job ids of its ticks. */
  readonly name: string;
  /** Five fields, in UTC: minute hour day month weekday. */
  readonly cron: string;
  readonly job: JobDef<Input>;
  readonly input: Input;
}

export interface Scheduler {
  /** Runs the ticks of the minute that holds `at`: takes the lock of each schedule that matches, and dispatches. It says which ones this scheduler won. */
  tick(at?: Date): Promise<readonly string[]>;
  /** Looks at the clock every few seconds and ticks each new minute. */
  start(): void;
  stop(): Promise<void>;
}

export interface SchedulerOptions {
  readonly db: Database;
  /** Who takes the lock. Defaults to a new id. */
  readonly owner?: string;
  /** How long the lock of a tick is held, in milliseconds. It must be shorter than a minute. Defaults to 50 000. */
  readonly lockMs?: number;
  readonly now?: () => number;
}

/**
 * Takes the lock of a tick with an `update ... where until < now` and then reads who holds it (ADR 0010), so a second scheduler
 * cannot run the same tick (Q-07). The job id names the tick (`sched:<name>:<minute>`), so a lock that is lost between the take and
 * the dispatch cannot run a tick twice either. A tick that was missed while no scheduler ran is skipped, not replayed.
 */
export async function createScheduler(
  queue: Queue,
  schedules: readonly Schedule[],
  options: SchedulerOptions,
): Promise<Scheduler> {
  const kysely = await rawKysely(options.db);
  const owner = options.owner ?? `s-${randomUUID().slice(0, 8)}`;
  const lockMs = options.lockMs ?? 50_000;
  if (lockMs >= 60_000)
    throw queueError(
      'QUEUE_JOB_INVALID',
      500,
      'The lock of a tick must be shorter than a minute.',
      'Use 50 000 ms or less.',
    );
  const clock = options.now ?? Date.now;
  const crons = new Map<string, Cron>();
  const names = new Set<string>();
  for (const schedule of schedules) {
    if (names.has(schedule.name))
      throw queueError(
        'QUEUE_JOB_INVALID',
        500,
        `The schedule ${schedule.name} is declared twice.`,
        'Name each schedule once.',
      );
    names.add(schedule.name);
    crons.set(schedule.name, parseCron(schedule.cron));
  }
  let timer: NodeJS.Timeout | undefined;
  let last = -1;
  let loop: Promise<unknown> = Promise.resolve();

  async function take(name: string, at: number): Promise<boolean> {
    const lock = `sched:${name}`;
    const insert = kysely.insertInto(LOCKS_TABLE).values({ name: lock, owner, until: at + lockMs });
    if (options.db.dialect === 'mysql') await insert.ignore().execute();
    else await insert.onConflict((conflict) => conflict.column('name').doNothing()).execute();
    await kysely
      .updateTable(LOCKS_TABLE)
      .set({ owner, until: at + lockMs })
      .where('name', '=', lock)
      .where('until', '<', at)
      .execute();
    const row = await kysely.selectFrom(LOCKS_TABLE).select('owner').where('name', '=', lock).executeTakeFirst();
    return row?.['owner'] === owner;
  }

  async function tick(at: Date = new Date(clock())): Promise<readonly string[]> {
    const minute = Math.floor(at.getTime() / 60_000);
    const won: string[] = [];
    for (const schedule of schedules) {
      if (crons.get(schedule.name)?.matches(at) !== true) continue;
      if (!(await take(schedule.name, at.getTime()))) continue;
      await queue.dispatch(schedule.job, schedule.input, { jobId: `sched:${schedule.name}:${minute}` });
      won.push(schedule.name);
    }
    return won;
  }

  return {
    tick,
    start() {
      if (timer !== undefined) return;
      timer = setInterval(() => {
        const minute = Math.floor(clock() / 60_000);
        if (minute === last) return;
        last = minute;
        loop = loop.then(() => tick()).catch(() => undefined);
      }, 1000);
    },
    async stop() {
      if (timer !== undefined) clearInterval(timer);
      timer = undefined;
      await loop;
    },
  };
}
