/**
 * BieberKit
 *
 * @file        packages/queue/src/testing/redis.ts
 * @description The Valkey of the queue tests: its URL comes from the config of vitest, a prefix of its own for each test, and BK_REQUIRE_DIALECTS=all makes a missing URL fail.
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

import { randomBytes } from 'node:crypto';
import { describe, inject, it } from 'vitest';
import { removeKeys } from '../adapters/redis/clean.ts';

declare module 'vitest' {
  export interface ProvidedContext {
    queueRedisUrl: string;
    dialectUrls: { postgres: string; mysql: string; require: string };
  }
}

export interface QueueRedisContext {
  readonly url: string;
  /** A prefix that no other test uses, and that `clean` removes. */
  readonly prefix: () => string;
  /** Removes every key under the prefixes that this suite made. */
  readonly clean: () => Promise<void>;
}

/**
 * Like `describe`, with the URL of the Valkey that the queue tests use, and a prefix of its own for each queue. Without a URL the suite
 * is skipped, unless `BK_REQUIRE_DIALECTS=all` is set, and then one test fails to say so.
 */
export function describeQueueRedis(name: string, suite: (context: QueueRedisContext) => void): void {
  const url = inject('queueRedisUrl');
  if (url !== '') {
    describe(name, () => {
      const used: string[] = [];
      suite({
        url,
        prefix: () => {
          const prefix = `bkt-${randomBytes(5).toString('hex')}`;
          used.push(prefix);
          return prefix;
        },
        clean: async () => removeKeys(url, used.splice(0)),
      });
    });
  } else if (inject('dialectUrls').require === 'all') {
    describe(name, () => {
      it('has a QUEUE_TEST_REDIS_URL', () => {
        throw new Error('QUEUE_TEST_REDIS_URL is not set and BK_REQUIRE_DIALECTS=all.');
      });
    });
  } else {
    describe.skip(name, () => {
      suite({ url: '', prefix: () => '', clean: async () => undefined });
    });
  }
}
