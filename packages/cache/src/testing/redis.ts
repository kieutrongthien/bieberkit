/**
 * BieberKit
 *
 * @file        packages/cache/src/testing/redis.ts
 * @description The Valkey of the cache tests: its URL comes from the config of vitest, and BK_REQUIRE_DIALECTS=all makes a missing one fail.
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

import { describe, inject, it } from 'vitest';

declare module 'vitest' {
  export interface ProvidedContext {
    cacheRedisUrl: string;
    dialectUrls: { postgres: string; mysql: string; require: string };
  }
}

/**
 * Like `describe`, with the URL of the Valkey that the cache tests use. Without a URL the suite is skipped, unless
 * `BK_REQUIRE_DIALECTS=all` is set, and then one test fails to say so.
 */
export function describeRedis(name: string, suite: (url: string) => void): void {
  const url = inject('cacheRedisUrl');
  if (url !== '') {
    describe(name, () => {
      suite(url);
    });
  } else if (inject('dialectUrls').require === 'all') {
    describe(name, () => {
      it('has a CACHE_TEST_REDIS_URL', () => {
        throw new Error('CACHE_TEST_REDIS_URL is not set and BK_REQUIRE_DIALECTS=all.');
      });
    });
  } else {
    describe.skip(name, () => {
      suite('');
    });
  }
}
