/**
 * BieberKit
 *
 * @file        packages/queue/src/adapters/redis/clean.ts
 * @description Removes the keys that the tests of the redis driver made, by prefix, from the Valkey of the tests.
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

import { Redis } from 'ioredis';

/** Deletes every key under each of `prefixes`. Used by the tests, which give each queue a prefix of its own. */
export async function removeKeys(url: string, prefixes: readonly string[]): Promise<void> {
  const client = new Redis(url);
  try {
    for (const prefix of prefixes) {
      const keys = await client.keys(`${prefix}:*`);
      if (keys.length > 0) await client.del(...keys);
    }
  } finally {
    client.disconnect();
  }
}
