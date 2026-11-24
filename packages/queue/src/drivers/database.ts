/**
 * BieberKit
 *
 * @file        packages/queue/src/drivers/database.ts
 * @description The database driver of the queue: jobs in a table, claimed with SKIP LOCKED (one writer on SQLite), with a lease, retries with backoff and a dead-letter list (Q-04, Q-05, ADR 0010).
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
import type { Kysely, Transaction } from 'kysely';
import type { Dialect } from '@bieberkit/core';
import type { StepDatabase } from '@bieberkit/data';
import { rawKysely, retryOnDeadlock } from '@bieberkit/data/orm';
import type { Database, OutboxPublisher } from '@bieberkit/data/orm';
import { emptyCounts, isQueueName, queueError } from '../contract.ts';
import type {
  DeadJob,
  DeadLetterPage,
  DispatchOptions,
  Dispatched,
  JobDef,
  JobStatus,
  Queue,
  QueueName,
  QueueStats,
  Worker,
  WorkerOptions,
} from '../contract.ts';
import { prepare } from '../shared.ts';
import type { Prepared, Shared } from '../shared.ts';
import { JOBS_TABLE, WAKE_CHANNEL } from '../tables.ts';
import { createDatabaseWorker } from '../worker.ts';

type Raw = Kysely<StepDatabase> | Transaction<StepDatabase>;

const SEVEN_DAYS_MS = 7 * 86_400_000;

/** Adds a job, unless one with this `job_id` exists (Q-01). It says whether a row was added. */
async function insertJob(db: Raw, dialect: Dialect, prepared: Prepared, now: number): Promise<boolean> {
  const values = {
    id: randomUUID(),
    job_id: prepared.jobId,
    queue: prepared.queue,
    name: prepared.job.name,
    input: JSON.stringify(prepared.input ?? null),
    tenant_id: prepared.context.tenantId ?? null,
    user_id: prepared.context.userId ?? null,
    request_id: prepared.context.requestId ?? null,
    status: 'waiting',
    attempts: 0,
    max_attempts: prepared.job.attempts,
    available_at: now + prepared.delayMs,
    created_at: now,
  };
  const insert = db.insertInto(JOBS_TABLE).values(values);
  const result =
    dialect === 'mysql'
      ? await insert.ignore().executeTakeFirst()
      : await insert.onConflict((conflict) => conflict.column('job_id').doNothing()).executeTakeFirst();
  const inserted = Number(result.numInsertedOrUpdatedRows ?? 0) > 0;
  // PostgreSQL holds a notification until the transaction commits, so a worker that wakes finds the job, and a rolled back insert wakes
  // nobody. The other dialects have no notification: their workers poll.
  if (inserted && dialect === 'postgres') await sql`select pg_notify(${WAKE_CHANNEL}, ${prepared.queue})`.execute(db);
  return inserted;
}

const numberOf = (value: unknown): number => Number(value ?? 0);
const queueOf = (value: unknown): QueueName => (isQueueName(value) ? value : 'default');
const textOf = (value: unknown): string => (typeof value === 'string' ? value : '');

/** The driver of the queue on the database of the project, with the tables of `queueMigrationSteps`. */
export async function createDatabaseQueue(db: Database, shared: Shared): Promise<Queue> {
  const kysely = await rawKysely(db);
  const dialect = db.dialect;

  async function dispatch<Input>(job: JobDef<Input>, input: Input, options?: DispatchOptions): Promise<Dispatched> {
    const prepared = await prepare(shared, job, input, options);
    const inserted = await retryOnDeadlock(() => insertJob(kysely, dialect, prepared, shared.now()));
    return { id: prepared.jobId, duplicate: !inserted };
  }

  const publisher: OutboxPublisher = {
    async publish(message, trx) {
      const subscription = shared.subscriptions.get(message.name);
      if (subscription === undefined) return;
      const prepared = await prepare(
        shared,
        subscription.job,
        subscription.map(message),
        { jobId: message.jobId },
        {
          ...(message.tenantId === undefined ? {} : { tenantId: message.tenantId }),
          ...(message.userId === undefined ? {} : { userId: message.userId }),
          ...(message.requestId === undefined ? {} : { requestId: message.requestId }),
        },
      );
      // The claiming transaction of the dispatcher inserts the job, so the move from the outbox to the queue is one commit (ADR 0010).
      await insertJob(trx, dialect, prepared, shared.now());
    },
  };

  async function exists(jobId: string): Promise<'none' | 'dead' | 'other'> {
    const row = await kysely.selectFrom(JOBS_TABLE).select('status').where('job_id', '=', jobId).executeTakeFirst();
    if (row === undefined) return 'none';
    return row['status'] === 'dead' ? 'dead' : 'other';
  }

  const refuse = async (jobId: string): Promise<never> => {
    if ((await exists(jobId)) === 'none')
      throw queueError('QUEUE_JOB_NOT_FOUND', 404, 'The job does not exist.', 'Check the id of the job.');
    throw queueError(
      'QUEUE_JOB_NOT_DEAD',
      409,
      'Only a dead job can be retried or discarded.',
      'Look in the dead letters.',
    );
  };

  const workers = new Set<Worker>();

  return {
    driver: 'database',
    dispatch,
    subscribe(event, job, map) {
      shared.subscriptions.set(event, {
        job: job,
        map: map === undefined ? (message) => message.payload : map,
      });
    },
    publisher,
    createWorker(options?: WorkerOptions): Worker {
      const worker = createDatabaseWorker({ kysely, dialect, shared }, options);
      workers.add(worker);
      return worker;
    },
    async status(jobId): Promise<JobStatus | undefined> {
      const row = await kysely.selectFrom(JOBS_TABLE).selectAll().where('job_id', '=', jobId).executeTakeFirst();
      if (row === undefined) return undefined;
      const state = textOf(row['status']);
      const result = typeof row['result'] === 'string' ? row['result'] : undefined;
      return {
        id: textOf(row['job_id']),
        name: textOf(row['name']),
        queue: queueOf(row['queue']),
        status: state === 'active' || state === 'done' || state === 'dead' ? state : 'waiting',
        attempts: numberOf(row['attempts']),
        ...(result === undefined ? {} : { result: JSON.parse(result) }),
        ...(typeof row['last_error'] === 'string' ? { error: row['last_error'] } : {}),
        ...(typeof row['tenant_id'] === 'string' ? { tenantId: row['tenant_id'] } : {}),
        ...(typeof row['user_id'] === 'string' ? { userId: row['user_id'] } : {}),
        createdAt: numberOf(row['created_at']),
        ...(row['finished_at'] === null || row['finished_at'] === undefined
          ? {}
          : { finishedAt: numberOf(row['finished_at']) }),
      };
    },
    async deadLetters(options = {}): Promise<DeadLetterPage> {
      const limit = Math.min(Math.max(options.limit ?? 50, 1), 200);
      let query = kysely.selectFrom(JOBS_TABLE).selectAll().where('status', '=', 'dead');
      if (options.queue !== undefined) query = query.where('queue', '=', options.queue);
      if (options.cursor !== undefined) {
        const [at = '0', id = ''] = Buffer.from(options.cursor, 'base64url').toString('utf8').split(':');
        query = query.where((eb) =>
          eb.or([eb('finished_at', '<', Number(at)), eb.and([eb('finished_at', '=', Number(at)), eb('id', '<', id)])]),
        );
      }
      const rows = await query
        .orderBy('finished_at', 'desc')
        .orderBy('id', 'desc')
        .limit(limit + 1)
        .execute();
      const shown = rows.slice(0, limit);
      const last = shown.at(-1);
      const jobs: DeadJob[] = shown.map((row) => ({
        id: textOf(row['job_id']),
        name: textOf(row['name']),
        queue: queueOf(row['queue']),
        input: JSON.parse(textOf(row['input'])),
        error: textOf(row['last_error']),
        attempts: numberOf(row['attempts']),
        ...(typeof row['tenant_id'] === 'string' ? { tenantId: row['tenant_id'] } : {}),
        diedAt: numberOf(row['finished_at']),
      }));
      return {
        jobs,
        nextCursor:
          rows.length > limit && last !== undefined
            ? Buffer.from(`${numberOf(last['finished_at'])}:${textOf(last['id'])}`).toString('base64url')
            : null,
      };
    },
    async retry(jobId) {
      const result = await kysely
        .updateTable(JOBS_TABLE)
        .set({
          status: 'waiting',
          attempts: 0,
          available_at: shared.now(),
          last_error: null,
          finished_at: null,
          locked_by: null,
          locked_until: null,
        })
        .where('job_id', '=', jobId)
        .where('status', '=', 'dead')
        .executeTakeFirst();
      if (Number(result.numUpdatedRows) === 0) await refuse(jobId);
    },
    async discard(jobId) {
      const result = await kysely
        .deleteFrom(JOBS_TABLE)
        .where('job_id', '=', jobId)
        .where('status', '=', 'dead')
        .executeTakeFirst();
      if (Number(result.numDeletedRows) === 0) await refuse(jobId);
    },
    async stats(): Promise<QueueStats> {
      const rows = await kysely
        .selectFrom(JOBS_TABLE)
        .select(['queue', 'status', sql<number>`count(*)`.as('n')])
        .groupBy(['queue', 'status'])
        .execute();
      const out = { critical: emptyCounts(), default: emptyCounts(), reports: emptyCounts() };
      for (const row of rows) {
        const queue = textOf(row['queue']);
        const status = textOf(row['status']);
        if (
          isQueueName(queue) &&
          (status === 'waiting' || status === 'active' || status === 'done' || status === 'dead')
        ) {
          out[queue][status] = numberOf(row['n']);
        }
      }
      return out;
    },
    async purge(options = {}) {
      const before = shared.now() - (options.olderThanMs ?? SEVEN_DAYS_MS);
      const result = await kysely
        .deleteFrom(JOBS_TABLE)
        .where('status', '=', 'done')
        .where('finished_at', '<', before)
        .executeTakeFirst();
      return Number(result.numDeletedRows);
    },
    async close() {
      await Promise.all([...workers].map((worker) => worker.stop()));
      workers.clear();
    },
  };
}
