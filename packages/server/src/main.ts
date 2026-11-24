/**
 * BieberKit
 *
 * @file        packages/server/src/main.ts
 * @description The entry point that a project calls from apps/server/src/main.ts: it reads the role, boots it, and stops it on SIGTERM and SIGINT (section 7, section 19.4).
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

import { boot, roleOf } from './boot.ts';
import type { Running } from './boot.ts';

/**
 * Reads the role from the arguments (`web`, `worker`, `scheduler`, `migrate`, or `dev` for the first three in one process), boots it,
 * and keeps the process alive until a signal. `migrate` ends by itself. Answers the exit code.
 */
export async function main(argv: readonly string[] = process.argv.slice(2)): Promise<number> {
  const role = roleOf(argv);
  const running: Running = await boot({ role, process: true });
  if (role === 'migrate') return running.stop();
  return new Promise<number>((resolve) => {
    let stopping = false;
    const stop = (): void => {
      if (stopping) return;
      stopping = true;
      void running.stop().then(resolve);
    };
    process.once('SIGTERM', stop);
    process.once('SIGINT', stop);
  });
}
