/**
 * BieberKit
 *
 * @file        packages/queue/src/testing/tasks/crash.ts
 * @description A task for the tests of the pool: it ends its thread, or uses more memory than its thread may.
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

export default async function crash(input: { how: 'exit' | 'memory' | 'throw-later' }): Promise<void> {
  if (input.how === 'exit') process.exit(3);
  if (input.how === 'throw-later') {
    setTimeout(() => {
      throw new Error('thrown outside the task');
    }, 5);
    return new Promise<void>(() => undefined);
  }
  const keep: number[][] = [];
  for (;;) keep.push(Array.from({ length: 1_000_000 }, () => 1));
}
