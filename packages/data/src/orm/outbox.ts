/**
 * BieberKit
 *
 * @file        packages/data/src/orm/outbox.ts
 * @description The outbox: events written with the data, the dispatcher that moves them to the queue, and the processed ids of subscribers (MOD-03, MOD-18, Q-01, ADR 0010).
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

import { UniqueConstraintViolationException } from '@mikro-orm/core';
import type { EntityManager } from '@mikro-orm/core';
import type { Transaction } from 'kysely';
import { createLogger, requestContext } from '@bieberkit/core';
import type { Logger } from '@bieberkit/core';
import { dataError } from '../errors.ts';
import { isUuid, uuid7FromBytes } from '../keys/uuid7.ts';
import type { StepDatabase } from '../migrations/steps.ts';
import type { Database } from './connect.ts';
import { OUTBOX_TABLE, OutboxEntry, OutboxProcessed, PROCESSED_TABLE } from './framework.ts';
import { kyselyOf } from './internals.ts';

const MAX_BACKOFF_MS = 3_600_000;
const SEVEN_DAYS_MS = 7 * 86_400_000;
const DEADLOCK_TRIES = 5;

/** How long a row waits after its `attempts`th failure: one second, doubled each time, at most an hour. */
export function backoffMs(attempts: number, max: number = MAX_BACKOFF_MS): number {
  return Math.min(1000 * 2 ** (attempts - 1), max);
}

/** MySQL and MariaDB (1213, `ER_LOCK_DEADLOCK`) and PostgreSQL (`40P01`), also when the error is the cause of another. */
export function isDeadlock(error: unknown): boolean {
  for (let depth = 0, current = error; depth < 5 && typeof current === 'object' && current !== null; depth += 1) {
    const errno: unknown = Reflect.get(current, 'errno');
    const code: unknown = Reflect.get(current, 'code');
    if (errno === 1213 || code === 'ER_LOCK_DEADLOCK' || code === '40P01') return true;
    current = Reflect.get(current, 'cause');
  }
  return false;
}

/** Runs `run` again after a deadlock, up to five times. Any other error is thrown at once. */
export async function retryOnDeadlock<T>(run: () => Promise<T>): Promise<T> {
  for (let attempt = 1; ; attempt += 1) {
    try {
      return await run();
    } catch (error) {
      if (!isDeadlock(error) || attempt >= DEADLOCK_TRIES) throw error;
    }
  }
}

function invalid(message: string, fix: string): never {
  throw dataError('DATA_OUTBOX_INVALID', 500, message, fix);
}

export interface OutboxEvent {
  /** The name of the event, for example `crm.deal.won`. */
  readonly name: string;
  /** The version of the payload. Defaults to 1. */
  readonly version?: number;
  /** Anything that JSON can hold. */
  readonly payload: unknown;
  /** The record that the event is about. `version` is its version after the write, so a subscriber can ignore an older event. */
  readonly record?: { readonly entity: string; readonly id: string; readonly version?: number };
  /** For a side effect that must happen once (WP-02): passed on to the queue and to the outside system. */
  readonly idempotencyKey?: string;
}

/**
 * Adds an event to the unit of work. It is written by the flush that writes the data, in the same transaction, and a flush that
 * fails leaves no event (§7.5). The tenant, the user and the request come from the request context (Q-10).
 */
export function emitEvent(em: EntityManager, event: OutboxEvent): void {
  const name = event.name.trim();
  if (name === '' || name.length > 200)
    invalid('The name of an event has 1 to 200 characters.', 'Name it like crm.deal.won.');
  const version = event.version ?? 1;
  if (!Number.isInteger(version) || version < 1)
    invalid(`"${version}" is not a version of an event.`, 'Use a whole number, 1 or more.');
  let payload: string | undefined;
  try {
    payload = JSON.stringify(event.payload);
  } catch {
    payload = undefined;
  }
  if (payload === undefined)
    invalid(`The payload of ${name} is not JSON.`, 'Put text, numbers, booleans, null, arrays and objects in it.');
  const context = requestContext.get();
  em.create(OutboxEntry, {
    event: name,
    eventVersion: version,
    payload,
    tenant: context?.tenantId ?? null,
    userId: context?.userId ?? null,
    requestId: context?.requestId ?? null,
    entity: event.record?.entity ?? null,
    recordId: event.record?.id ?? null,
    recordVersion: event.record?.version ?? null,
    idempotencyKey: event.idempotencyKey ?? null,
    createdAt: Date.now(),
    availableAt: 0,
    attempts: 0,
  });
}

/** One row of the outbox, as the publisher receives it. */
export interface OutboxMessage {
  readonly id: string;
  /** `ob-<id>`. The same on every delivery of the row, so the queue can deduplicate (Q-01). */
  readonly jobId: string;
  readonly name: string;
  readonly version: number;
  readonly tenantId?: string;
  readonly userId?: string;
  readonly requestId?: string;
  readonly entity?: string;
  readonly recordId?: string;
  readonly recordVersion?: number;
  readonly payload: unknown;
  readonly idempotencyKey?: string;
  readonly createdAt: Date;
}

export interface OutboxPublisher {
  /**
   * Hands one message to the queue. `trx` is the transaction that claimed the row: the `database` queue driver inserts its job
   * with it, so the move is atomic (ADR 0010, rule 5). A driver on Valkey ignores it and relies on `jobId`. Throw to keep the row.
   */
  publish(message: OutboxMessage, trx: Transaction<StepDatabase>): Promise<void>;
}

export interface OutboxDispatcherOptions {
  readonly publisher: OutboxPublisher;
  /** Rows per transaction, 1 to 1000. Defaults to 100. */
  readonly batchSize?: number;
  /** Milliseconds between polls, 10 or more. Defaults to 1000. */
  readonly pollMs?: number;
  /** The longest wait after a failure. Defaults to one hour. */
  readonly maxBackoffMs?: number;
  readonly logger?: Logger;
  /** The clock, in epoch milliseconds. For tests. */
  readonly now?: () => number;
}

export interface DispatchResult {
  /** Rows that this call took. */
  readonly claimed: number;
  /** Rows that were handed to the queue and removed. Zero when one row failed, because the batch is rolled back. */
  readonly delivered: number;
  readonly failed: number;
}

export interface OutboxDispatcher {
  dispatchOnce(): Promise<DispatchResult>;
  /** Starts the loop: dispatch, then wait `pollMs` or until `wake`. */
  start(): void;
  /** Ends the wait of the loop at once. A `LISTEN/NOTIFY` listener or an emitter in the same process calls it. */
  wake(): void;
  /** Stops the loop and waits for the batch in progress. */
  stop(): Promise<void>;
}

type Row = Record<string, unknown>;

class PublishFailure extends Error {
  readonly row: Row;

  constructor(row: Row, cause: unknown) {
    super('publish failed', { cause });
    this.row = row;
  }
}

function uuidOf(value: unknown): string | undefined {
  if (typeof value === 'string') return isUuid(value) ? value.toLowerCase() : undefined;
  if (value instanceof Uint8Array && value.length === 16) return uuid7FromBytes(value);
  return undefined;
}

const textOf = (value: unknown): string | undefined => (typeof value === 'string' ? value : undefined);
const numberOf = (value: unknown): number | undefined =>
  value === null || value === undefined ? undefined : Number(value);

function toMessage(row: Row): OutboxMessage {
  const id = uuidOf(row['id']) ?? '';
  const message: Record<string, unknown> = {
    id,
    jobId: `ob-${id}`,
    name: textOf(row['event']) ?? '',
    version: numberOf(row['event_version']) ?? 1,
    payload: JSON.parse(textOf(row['payload']) ?? 'null'),
    createdAt: new Date(numberOf(row['created_at']) ?? 0),
  };
  const optional: Record<string, unknown> = {
    tenantId: uuidOf(row['tenant_id']),
    userId: uuidOf(row['user_id']),
    requestId: textOf(row['request_id']),
    entity: textOf(row['entity']),
    recordId: uuidOf(row['record_id']),
    recordVersion: numberOf(row['record_version']),
    idempotencyKey: textOf(row['idempotency_key']),
  };
  for (const [key, value] of Object.entries(optional)) if (value !== undefined) message[key] = value;
  // The record is built from the columns above, so its shape is that of OutboxMessage.
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion
  return message as unknown as OutboxMessage;
}

const sleep = (ms: number, wake: { current: () => void }): Promise<void> =>
  new Promise((resolve) => {
    const timer = setTimeout(resolve, ms);
    wake.current = () => {
      clearTimeout(timer);
      resolve();
    };
  });

/**
 * The dispatcher of the outbox (MOD-18). One call claims a batch with `FOR UPDATE SKIP LOCKED`, in the order of the index so that MySQL locks the batch and not every due row (SQLite has one writer, and its
 * transaction takes the lock), gives each row to the publisher inside the transaction, and deletes the rows in it. A row that the
 * publisher refuses rolls the batch back and waits longer each time, so one bad row never blocks the others.
 */
export function createOutboxDispatcher(db: Database, options: OutboxDispatcherOptions): OutboxDispatcher {
  const batchSize = options.batchSize ?? 100;
  const pollMs = options.pollMs ?? 1000;
  if (!Number.isInteger(batchSize) || batchSize < 1 || batchSize > 1000)
    invalid(`A batch size of ${batchSize} is not allowed.`, 'Use a whole number from 1 to 1000.');
  if (!Number.isFinite(pollMs) || pollMs < 10)
    invalid(`A poll time of ${pollMs} ms is too short.`, 'Use 10 ms or more.');
  const clock = options.now ?? Date.now;
  const logger = options.logger ?? createLogger({ level: 'info', role: 'worker' });
  const state = { running: false };
  let loop: Promise<void> | undefined;
  const wake = { current: (): void => undefined };

  async function dispatchOnce(): Promise<DispatchResult> {
    const kysely = await kyselyOf(db.orm.em);
    const now = clock();
    let claimed = 0;
    try {
      await kysely.transaction().execute(async (trx) => {
        let query = trx
          .selectFrom(OUTBOX_TABLE)
          .selectAll()
          .where('available_at', '<=', now)
          .orderBy('available_at')
          .orderBy('created_at')
          .orderBy('id')
          .limit(batchSize);
        if (db.dialect !== 'sqlite') query = query.forUpdate().skipLocked();
        const rows: Row[] = await query.execute();
        claimed = rows.length;
        for (const row of rows) {
          try {
            await options.publisher.publish(toMessage(row), trx);
          } catch (error) {
            throw new PublishFailure(row, error);
          }
        }
        const ids = rows.map((row) => row['id']);
        if (ids.length === 0) return;
        if (db.dialect === 'mysql') {
          // Range deletes deadlock between dispatchers on MySQL and MariaDB, so each row goes by its own key (ADR 0010).
          for (const id of ids)
            await retryOnDeadlock(() => trx.deleteFrom(OUTBOX_TABLE).where('id', '=', id).execute());
        } else {
          await trx.deleteFrom(OUTBOX_TABLE).where('id', 'in', ids).execute();
        }
      });
    } catch (error) {
      if (!(error instanceof PublishFailure)) throw error;
      const attempts = (numberOf(error.row['attempts']) ?? 0) + 1;
      const reason = error.cause instanceof Error ? error.cause.message : String(error.cause);
      await kysely
        .updateTable(OUTBOX_TABLE)
        .set({
          attempts,
          last_error: reason.slice(0, 2000),
          available_at: now + backoffMs(attempts, options.maxBackoffMs),
        })
        .where('id', '=', error.row['id'])
        .execute();
      logger.warn('outbox row not delivered', { event: error.row['event'], attempts, reason });
      return { claimed, delivered: 0, failed: 1 };
    }
    return { claimed, delivered: claimed, failed: 0 };
  }

  async function run(): Promise<void> {
    while (state.running) {
      let busy = false;
      try {
        const result = await dispatchOnce();
        busy = result.claimed > 0 && result.failed === 0;
      } catch (error) {
        logger.error('outbox dispatch failed', { reason: error instanceof Error ? error.message : String(error) });
      }
      if (state.running && !busy) await sleep(pollMs, wake);
    }
  }

  return {
    dispatchOnce,
    start() {
      if (state.running) return;
      state.running = true;
      loop = run();
    },
    wake: () => wake.current(),
    async stop() {
      state.running = false;
      wake.current();
      await loop;
      loop = undefined;
    },
  };
}

export interface OutboxLag {
  /** Rows that wait, including those that failed. */
  readonly pending: number;
  /** The age of the oldest row in milliseconds, or `null` when there is none. */
  readonly oldestAgeMs: number | null;
  /** Rows that failed at least once. */
  readonly failing: number;
}

/** The numbers behind the lag metric of the dispatcher (MOD-18). */
export async function outboxLag(db: Database, now: () => number = Date.now): Promise<OutboxLag> {
  const kysely = await kyselyOf(db.orm.em);
  const { pending, oldest, failing } = await kysely
    .selectFrom(OUTBOX_TABLE)
    .select((eb) => [
      eb.fn.countAll().as('pending'),
      eb.fn.min('created_at').as('oldest'),
      eb.fn.sum(eb.case().when('attempts', '>', 0).then(1).else(0).end()).as('failing'),
    ])
    .executeTakeFirstOrThrow();
  const first = numberOf(oldest);
  return {
    pending: Number(pending),
    oldestAgeMs: first === undefined ? null : Math.max(0, now() - first),
    failing: Number(failing),
  };
}

/**
 * Runs `handler` for an event once per subscriber, however often the outbox delivers it (MOD-18). The record and the writes of
 * the handler commit together: a handler that throws leaves no record, so the next delivery runs it again. Returns `false`
 * when this subscriber already handled the event.
 */
export async function processOnce(
  db: Database,
  subscriber: string,
  eventId: string,
  handler: (em: EntityManager) => Promise<void>,
): Promise<boolean> {
  try {
    return await db.fork().transactional(async (em) => {
      if ((await em.count(OutboxProcessed, { subscriber, eventId })) > 0) return false;
      em.create(OutboxProcessed, { subscriber, eventId, processedAt: Date.now() });
      await em.flush();
      await handler(em);
      return true;
    });
  } catch (error) {
    if (error instanceof UniqueConstraintViolationException) return false;
    throw error;
  }
}

export interface PurgeOptions {
  /** Records older than this are deleted. Defaults to seven days. */
  readonly olderThanMs?: number;
  readonly now?: () => number;
}

/** Deletes the processed ids that are older than seven days, and returns how many (MOD-18). */
export async function purgeProcessed(db: Database, options: PurgeOptions = {}): Promise<number> {
  const kysely = await kyselyOf(db.orm.em);
  const cutoff = (options.now ?? Date.now)() - (options.olderThanMs ?? SEVEN_DAYS_MS);
  const result = await kysely.deleteFrom(PROCESSED_TABLE).where('processed_at', '<', cutoff).executeTakeFirst();
  return Number(result.numDeletedRows);
}
