/**
 * BieberKit
 *
 * @file        packages/queue/src/testing/tasks/burn.ts
 * @description A task for the tests of the pool: it keeps the CPU busy for a given time, and answers the id of its thread.
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

import { threadId } from 'node:worker_threads';

export default async function burn(input: { ms: number }): Promise<{ thread: number }> {
  const until = Date.now() + input.ms;
  // A loop that never gives the thread back, as a PDF or a spreadsheet would not.
  while (Date.now() < until) Math.sqrt(Math.random());
  return { thread: threadId };
}
