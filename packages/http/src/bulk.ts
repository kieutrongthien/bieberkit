/**
 * BieberKit
 *
 * @file        packages/http/src/bulk.ts
 * @description The port that sends a bulk call of more than 100 rows to a queued job, and the shape of what it sends (API-14, PERF-05).
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

import type { Principal } from './ports.ts';

/** What a queued bulk call needs to run again as the caller: the entity, the body that the route had validated, and who asked. */
export interface BulkInput {
  readonly entity: string;
  readonly body: Readonly<Record<string, unknown>>;
  readonly principal: Principal | undefined;
}

export interface BulkQueue {
  /** Queues the call and answers the id of the job and the path where its state and its result are read. */
  enqueue(input: BulkInput): Promise<{ readonly id: string; readonly location: string }>;
}

/** Rows at most that a bulk call changes while the caller waits, in one transaction. Above this the call is a job (API-14). */
export const MAX_BULK_INLINE: number = 100;
/** Rows at most in one bulk call (API-14). */
export const MAX_BULK: number = 500;
