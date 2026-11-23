/**
 * BieberKit
 *
 * @file        packages/queue/src/adapters/postgres/index.ts
 * @description Subpath @bieberkit/queue/postgres: a wake source on LISTEN/NOTIFY, so that a worker takes a job that another process added at once, not at its next poll (Q-06).
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

import { Client } from 'pg';
import type { Logger } from '@bieberkit/core';
import { isQueueName } from '../../contract.ts';
import type { WakeSource } from '../../contract.ts';
import { WAKE_CHANNEL } from '../../tables.ts';

export interface PgWakeSourceOptions {
  /** The connection URL of the database of the queue (`DATABASE_URL`). The source uses one connection of its own, outside the pool. */
  readonly url: string;
  readonly logger?: Logger;
  /** The wait before the first try to connect again, doubled up to `maxRetryMs`. Defaults to 500. */
  readonly retryMs?: number;
  /** Defaults to 30 seconds. */
  readonly maxRetryMs?: number;
}

/** The name that the connection gives to itself, so that an operator sees what it is in `pg_stat_activity`. */
export const LISTENER_NAME = 'bieberkit-queue-listener';

/**
 * A connection that `LISTEN`s to the channel that `insertJob` notifies. When it is lost it connects again with a growing wait, and every
 * time that it is connected it asks the worker to look at every queue, because notifications that came while it was away are gone.
 * It never fails the worker: with no connection the worker polls, as it does without a source.
 */
export function pgWakeSource(options: PgWakeSourceOptions): WakeSource {
  const retryMs = options.retryMs ?? 500;
  const maxRetryMs = options.maxRetryMs ?? 30_000;
  return {
    async listen(onWake) {
      let stopped = false;
      let client: Client | undefined;
      let timer: NodeJS.Timeout | undefined;
      let wait = retryMs;
      let warned = false;

      const lost = (reason: unknown): void => {
        const failed = client;
        client = undefined;
        failed?.removeAllListeners();
        failed?.on('error', () => undefined);
        void failed?.end().catch(() => undefined);
        if (stopped) return;
        if (!warned) {
          warned = true;
          options.logger?.warn('the queue wake source is not connected; workers poll until it is', {
            reason: reason instanceof Error ? reason.message : String(reason),
          });
        }
        timer = setTimeout(() => void connect(), wait);
        timer.unref();
        wait = Math.min(wait * 2, maxRetryMs);
      };

      async function connect(): Promise<void> {
        if (stopped) return;
        const next = new Client({ connectionString: options.url, application_name: LISTENER_NAME, keepAlive: true });
        client = next;
        next.on('notification', (message) => {
          if (message.channel !== WAKE_CHANNEL) return;
          const queue = message.payload;
          onWake(isQueueName(queue) ? queue : undefined);
        });
        next.on('error', lost);
        next.on('end', () => {
          if (client === next) lost(new Error('The connection of the wake source ended.'));
        });
        try {
          await next.connect();
          await next.query(`LISTEN ${next.escapeIdentifier(WAKE_CHANNEL)}`);
        } catch (error) {
          if (client === next) lost(error);
          return;
        }
        if (stopped) {
          client = undefined;
          void next.end().catch(() => undefined);
          return;
        }
        if (warned) options.logger?.info('the queue wake source is connected again');
        warned = false;
        wait = retryMs;
        onWake(undefined);
      }

      await connect();
      return async () => {
        stopped = true;
        if (timer !== undefined) clearTimeout(timer);
        const last = client;
        client = undefined;
        last?.removeAllListeners();
        last?.on('error', () => undefined);
        await last?.end().catch(() => undefined);
      };
    },
  };
}
