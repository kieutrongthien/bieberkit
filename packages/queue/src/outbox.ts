/**
 * BieberKit
 *
 * @file        packages/queue/src/outbox.ts
 * @description The glue between the outbox and the queue: a dispatcher whose publisher moves a row into the queue in the transaction that claimed it (MOD-18, Q-06, ADR 0010).
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

import type { Logger } from '@bieberkit/core';
import { createOutboxDispatcher } from '@bieberkit/data/orm';
import type { Database, OutboxDispatcher, OutboxDispatcherOptions } from '@bieberkit/data/orm';
import type { Queue } from './contract.ts';

/**
 * Makes the dispatcher of the outbox that hands each event with a subscription (`queue.subscribe`) to the queue. With the `database`
 * driver the job is inserted in the transaction that claimed the row, so the move is one commit. An event that no job asked for is
 * not delivered by this dispatcher and is deleted with its batch, so a project that has subscribers of its own for an event
 * (`processOnce`) runs them from the outbox before this dispatcher, or does not give that event to it.
 */
export function registerOutbox(
  db: Database,
  queue: Queue,
  options: Omit<OutboxDispatcherOptions, 'publisher'> & { readonly logger?: Logger } = {},
): OutboxDispatcher {
  return createOutboxDispatcher(db, { ...options, publisher: queue.publisher });
}
