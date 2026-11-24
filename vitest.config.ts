/**
 * BieberKit
 *
 * @file        vitest.config.ts
 * @description Vitest configuration for unit tests across packages, plugins and tools.
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

import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    // Resolve workspace packages to their TypeScript sources, so tests need no build.
    conditions: ['@bieberkit/source'],
  },
  test: {
    include: ['packages/*/src/**/*.test.{ts,tsx}', 'plugins/*/src/**/*.test.{ts,tsx}', 'tools/**/*.test.ts'],
    // Artifact checks require built output and run explicitly through pnpm test:artifacts.
    exclude: ['tools/lib/plugin-artifacts.test.ts'],
    passWithNoTests: true,
    // TST-03: a test that opens a connection outside this machine fails.
    setupFiles: ['./tools/vitest-setup.ts'],
    // Database URLs for the dialect suites of @bieberkit/data (packages/data/src/testing). The `services` job of ci.yml sets
    // them, and locally they point at throwaway containers. With BK_REQUIRE_DIALECTS=all a missing URL fails the run.
    // This file is the one place where tests read the environment, as a config file (P8 covers application code).
    provide: {
      dialectUrls: {
        postgres: process.env['DATABASE_URL_POSTGRES'] ?? '',
        mysql: process.env['DATABASE_URL_MYSQL'] ?? '',
        require: process.env['BK_REQUIRE_DIALECTS'] ?? '',
      },
      // The Valkey of the cache suites of @bieberkit/cache (packages/cache/src/testing). Its policy must evict (`allkeys-lru`).
      cacheRedisUrl: process.env['CACHE_TEST_REDIS_URL'] ?? '',
      // The S3 compatible server of the storage suites of @bieberkit/storage (packages/storage/src/testing), MinIO with the default keys.
      // The Valkey of the queue suites of @bieberkit/queue (packages/queue/src/adapters/redis). Its policy must be `noeviction` (Q-08).
      queueRedisUrl: process.env['QUEUE_TEST_REDIS_URL'] ?? '',
      storageS3Endpoint: process.env['STORAGE_TEST_S3_ENDPOINT'] ?? '',
      // Hosts besides this machine that a test may call, separated by commas. For the services of a CI network. Empty by default.
      networkAllow: (process.env['TEST_NETWORK_ALLOW'] ?? '')
        .split(',')
        .map((host) => host.trim())
        .filter((host) => host !== ''),
    },
    // `pnpm test:coverage`. TST-01: 90 percent of lines for core, data, http and auth, and 80 percent for every other package.
    // The packages that are already above 90 keep it. `lines` at the top is the 80 percent of the rest, and a file that a
    // threshold of a glob covers is counted there and not in the top one.
    coverage: {
      provider: 'v8',
      include: ['packages/*/src/**/*.ts'],
      exclude: ['**/*.test.ts', '**/*.d.ts', 'packages/*/src/testing/**', 'packages/testing/src/fixtures.ts'],
      reporter: ['text-summary', 'text'],
      thresholds: {
        lines: 80,
        'packages/core/src/**': { lines: 90 },
        'packages/data/src/**': { lines: 90 },
        'packages/http/src/**': { lines: 90 },
        'packages/auth/src/**': { lines: 90 },
        'packages/cache/src/**': { lines: 90 },
        'packages/storage/src/**': { lines: 90 },
        'packages/mail/src/**': { lines: 90 },
      },
    },
  },
});
