/**
 * BieberKit
 *
 * @file        packages/queue/src/adapters/redis/index.ts
 * @description Subpath @bieberkit/queue/redis: the BullMQ driver of the queue, and the queue that QUEUE_DRIVER selects (Q-11).
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

import type { ErrorReporter, Logger, Metrics, Tracer } from '@bieberkit/core';
import type { Database } from '@bieberkit/data/orm';
import { queueError } from '../../contract.ts';
import type { JobDef, Queue } from '../../contract.ts';
import { createQueue } from '../../queue.ts';
import { createRedisQueue } from './queue.ts';

export { createRedisQueue } from './queue.ts';
export type { RedisQueueOptions } from './queue.ts';

/** The part of the validated config (`CoreEnv`) that decides the queue. */
export interface QueueConfig {
  readonly QUEUE_DRIVER: 'sync' | 'database' | 'redis';
  readonly REDIS_URL: string | undefined;
}

export interface QueueFromConfigOptions {
  readonly jobs: readonly JobDef[];
  /** For the `database` driver. */
  readonly db?: Database;
  readonly logger?: Logger;
  readonly errorReporter?: ErrorReporter;
  readonly tracer?: Tracer;
  readonly metrics?: Metrics;
  /** Isolates apps that share one Valkey. Defaults to `bk`. */
  readonly prefix?: string;
}

/** The queue for `QUEUE_DRIVER`. Switching the driver changes this and nothing in the application (Q-11). */
export async function createQueueFromConfig(config: QueueConfig, options: QueueFromConfigOptions): Promise<Queue> {
  const common = {
    jobs: options.jobs,
    ...(options.logger === undefined ? {} : { logger: options.logger }),
    ...(options.errorReporter === undefined ? {} : { errorReporter: options.errorReporter }),
    ...(options.tracer === undefined ? {} : { tracer: options.tracer }),
    ...(options.metrics === undefined ? {} : { metrics: options.metrics }),
  };
  if (config.QUEUE_DRIVER === 'redis') {
    if (config.REDIS_URL === undefined) {
      throw queueError(
        'QUEUE_DRIVER_UNSUPPORTED',
        500,
        'QUEUE_DRIVER=redis needs REDIS_URL.',
        'Set REDIS_URL to the Valkey of the queue. It is not the one of the cache, and it needs maxmemory-policy noeviction (Q-08).',
      );
    }
    return createRedisQueue({
      ...common,
      url: config.REDIS_URL,
      ...(options.prefix === undefined ? {} : { prefix: options.prefix }),
    });
  }
  return createQueue({
    ...common,
    driver: config.QUEUE_DRIVER,
    ...(options.db === undefined ? {} : { db: options.db }),
  });
}
