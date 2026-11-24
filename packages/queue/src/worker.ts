/**
 * BieberKit
 *
 * @file        packages/queue/src/worker.ts
 * @description The worker of the database driver: it claims jobs queue by queue with their own slots, renews the lease while they run, and settles each delivery (Q-03, Q-05, Q-10).
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
import { sql } from 'kysely';
import type { Kysely } from 'kysely';
import type { Dialect } from '@bieberkit/core';
import type { StepDatabase } from '@bieberkit/data';
import { createWakeSignal } from '@bieberkit/data/orm';
import { QUEUE_NAMES } from './contract.ts';
import type { QueueName, WakeSource, Worker, WorkerOptions } from './contract.ts';
import { reportDead, runDelivery } from './shared.ts';
import type { Shared } from './shared.ts';
import { JOBS_TABLE } from './tables.ts';

interface Claimed {
  readonly id: string;
  readonly jobId: string;
  readonly name: string;
  readonly input: string;
  readonly attempt: number;
  readonly maxAttempts: number;
  readonly queue: QueueName;
  readonly context: { tenantId?: string; userId?: string; requestId?: string };
}

const numberOf = (value: unknown): number => Number(value ?? 0);
const textOf = (value: unknown): string => (typeof value === 'string' ? value : '');
const optional = (value: unknown): string | undefined =>
  typeof value === 'string' && value !== '' ? value : undefined;

export function slotsOf(options: WorkerOptions, queue: QueueName): number {
  const set = options.concurrency;
  const value = typeof set === 'number' ? set : (set?.[queue] ?? 4);
  return Math.max(0, Math.floor(value));
}

/**
 * One worker takes jobs from the queues that it is given. Each queue has its own slots and its own loop, so a busy `reports` never
 * keeps `critical` waiting (Q-03). A job is claimed in a short transaction (`FOR UPDATE SKIP LOCKED`, or the one writer of SQLite),
 * owned for a lease that a heartbeat renews, and settled by its outcome. A job whose lease ran out, because its worker died, is
 * claimed again (ADR 0010).
 */
export function createDatabaseWorker(
  db: { readonly kysely: Kysely<StepDatabase>; readonly dialect: Dialect; readonly shared: Shared },
  options: WorkerOptions = {},
): Worker {
  const { kysely, dialect, shared } = db;
  const id = `w-${randomUUID().slice(0, 8)}`;
  const queues = options.queues ?? QUEUE_NAMES;
  const pollMs = options.pollMs ?? 200;
  const leaseMs = options.leaseMs ?? 30_000;
  const heartbeatMs = options.heartbeatMs ?? Math.max(Math.floor(leaseMs / 3), 10);
  const stopTimeoutMs = options.stopTimeoutMs ?? 10_000;
  const state = { running: false, crashed: false };
  const loops: Promise<void>[] = [];
  const running = new Set<Promise<void>>();
  const heartbeats = new Set<NodeJS.Timeout>();
  let unlisten: (() => Promise<void>) | undefined;

  async function claim(queue: QueueName, limit: number): Promise<Claimed[]> {
    const now = shared.now();
    // On MySQL the default isolation (REPEATABLE READ) keeps gap locks, so claims of two queues that run together lock each other's rows,
    // and SKIP LOCKED then skips a job that is due. READ COMMITTED locks only the rows that a claim takes.
    const transaction =
      dialect === 'mysql' ? kysely.transaction().setIsolationLevel('read committed') : kysely.transaction();
    return transaction.execute(async (trx) => {
      let query = trx
        .selectFrom(JOBS_TABLE)
        .selectAll()
        .where('queue', '=', queue)
        .where((eb) =>
          eb.or([
            eb.and([eb('status', '=', 'waiting'), eb('available_at', '<=', now)]),
            eb.and([eb('status', '=', 'active'), eb('locked_until', '<', now)]),
          ]),
        )
        .orderBy('available_at')
        .orderBy('created_at')
        .orderBy('id')
        .limit(limit);
      if (dialect !== 'sqlite') query = query.forUpdate().skipLocked();
      const rows = await query.execute();
      const claimed: Claimed[] = [];
      const exhausted: string[] = [];
      const taken: string[] = [];
      for (const row of rows) {
        const attempt = numberOf(row['attempts']) + 1;
        const maxAttempts = numberOf(row['max_attempts']);
        // A job whose lease ran out so often that it has no delivery left is dead, and does not run again.
        if (textOf(row['status']) === 'active' && attempt > maxAttempts) {
          exhausted.push(textOf(row['id']));
          reportDead(
            shared,
            {
              jobId: textOf(row['job_id']),
              name: textOf(row['name']),
              queue,
              attempt: maxAttempts,
              context: {
                ...(optional(row['tenant_id']) === undefined ? {} : { tenantId: textOf(row['tenant_id']) }),
                ...(optional(row['user_id']) === undefined ? {} : { userId: textOf(row['user_id']) }),
                ...(optional(row['request_id']) === undefined ? {} : { requestId: textOf(row['request_id']) }),
              },
            },
            new Error('The lease ran out on every delivery.'),
          );
          continue;
        }
        taken.push(textOf(row['id']));
        const tenantId = optional(row['tenant_id']);
        const userId = optional(row['user_id']);
        const requestId = optional(row['request_id']);
        claimed.push({
          id: textOf(row['id']),
          jobId: textOf(row['job_id']),
          name: textOf(row['name']),
          input: textOf(row['input']),
          attempt,
          maxAttempts,
          queue,
          context: {
            ...(tenantId === undefined ? {} : { tenantId }),
            ...(userId === undefined ? {} : { userId }),
            ...(requestId === undefined ? {} : { requestId }),
          },
        });
      }
      if (taken.length > 0) {
        await trx
          .updateTable(JOBS_TABLE)
          .set({ status: 'active', locked_by: id, locked_until: now + leaseMs, attempts: sql`attempts + 1` })
          .where('id', 'in', taken)
          .execute();
      }
      if (exhausted.length > 0) {
        await trx
          .updateTable(JOBS_TABLE)
          .set({
            status: 'dead',
            finished_at: now,
            locked_by: null,
            locked_until: null,
            last_error: 'The lease ran out on every delivery.',
          })
          .where('id', 'in', exhausted)
          .execute();
      }
      return claimed;
    });
  }

  async function settle(job: Claimed, outcome: Awaited<ReturnType<typeof runDelivery>>): Promise<void> {
    const now = shared.now();
    if (outcome.ok) {
      await kysely
        .updateTable(JOBS_TABLE)
        .set({
          status: 'done',
          finished_at: now,
          locked_by: null,
          locked_until: null,
          result: outcome.result ?? null,
        })
        .where('id', '=', job.id)
        .where('locked_by', '=', id)
        .execute();
      return;
    }
    const definition = shared.jobs.get(job.name);
    const last = !outcome.retry || job.attempt >= job.maxAttempts;
    if (last) reportDead(shared, job, outcome.cause);
    await kysely
      .updateTable(JOBS_TABLE)
      .set(
        last
          ? {
              status: 'dead',
              finished_at: now,
              locked_by: null,
              locked_until: null,
              last_error: outcome.error.slice(0, 4000),
            }
          : {
              status: 'waiting',
              available_at: now + (definition?.backoffMs(job.attempt) ?? 1000),
              locked_by: null,
              locked_until: null,
              last_error: outcome.error.slice(0, 4000),
            },
      )
      .where('id', '=', job.id)
      .where('locked_by', '=', id)
      .execute();
  }

  async function runOne(job: Claimed): Promise<void> {
    const beat = setInterval(() => {
      if (state.crashed) return;
      void kysely
        .updateTable(JOBS_TABLE)
        .set({ locked_until: shared.now() + leaseMs })
        .where('id', '=', job.id)
        .where('locked_by', '=', id)
        .execute()
        .catch((error: unknown) =>
          shared.logger.warn('lease not renewed', { jobId: job.jobId, reason: String(error) }),
        );
    }, heartbeatMs);
    heartbeats.add(beat);
    try {
      const outcome = await runDelivery(shared, {
        jobId: job.jobId,
        name: job.name,
        input: job.input,
        attempt: job.attempt,
        context: job.context,
      });
      if (!state.crashed) await settle(job, outcome);
    } catch (error) {
      shared.logger.error('job could not be settled', {
        jobId: job.jobId,
        reason: error instanceof Error ? error.message : String(error),
      });
    } finally {
      clearInterval(beat);
      heartbeats.delete(beat);
    }
  }

  /** One signal for each loop, so that a hint that arrives while a loop is busy is kept and the loop does not go to sleep for a whole poll. */
  const signals = new Set<ReturnType<typeof createWakeSignal>>();
  const wakeAll = (): void => {
    for (const signal of signals) signal.wake();
  };

  async function loop(queue: QueueName): Promise<void> {
    const slots = slotsOf(options, queue);
    const signal = createWakeSignal();
    signals.add(signal);
    let busy = 0;
    while (state.running && !state.crashed) {
      let claimed: Claimed[] = [];
      try {
        if (slots - busy > 0) claimed = await claim(queue, slots - busy);
      } catch (error) {
        shared.logger.error('claim failed', { queue, reason: error instanceof Error ? error.message : String(error) });
      }
      for (const job of claimed) {
        busy += 1;
        const task = runOne(job).finally(() => {
          busy -= 1;
          running.delete(task);
          wakeAll();
        });
        running.add(task);
      }
      // With slots free and nothing to take, look again after the poll time. With every slot busy, wait for one to end.
      if (state.running && !state.crashed && (claimed.length === 0 || slots - busy <= 0))
        await signal.sleep(claimed.length === 0 ? pollMs : Math.max(pollMs, 20));
    }
  }

  /** The source is a hint. If it cannot be reached the worker keeps polling, so a failure here is a warning and nothing more. */
  async function startWake(source: WakeSource): Promise<void> {
    try {
      const stop = await source.listen(() => wakeAll());
      if (state.running && !state.crashed) unlisten = stop;
      else await stop();
    } catch (error) {
      shared.logger.warn('the wake source could not start; the worker polls', {
        reason: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return {
    start() {
      if (state.running || state.crashed) return;
      state.running = true;
      for (const queue of queues) loops.push(loop(queue));
      if (options.wake !== undefined) void startWake(options.wake);
    },
    async stop() {
      state.running = false;
      const stopListening = unlisten;
      unlisten = undefined;
      await stopListening?.().catch(() => undefined);
      wakeAll();
      await Promise.all(loops);
      loops.length = 0;
      let timer: NodeJS.Timeout | undefined;
      await Promise.race([
        Promise.all(running),
        new Promise<void>((resolve) => {
          timer = setTimeout(resolve, stopTimeoutMs);
        }),
      ]);
      if (timer !== undefined) clearTimeout(timer);
      for (const beat of heartbeats) clearInterval(beat);
      heartbeats.clear();
    },
    crash() {
      state.crashed = true;
      state.running = false;
      void unlisten?.().catch(() => undefined);
      unlisten = undefined;
      for (const beat of heartbeats) clearInterval(beat);
      heartbeats.clear();
      wakeAll();
    },
  };
}
