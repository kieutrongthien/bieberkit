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
    passWithNoTests: true,
    // `pnpm test:coverage`. TST-01: 90 percent of lines for core, data, http and auth, 80 percent for the rest.
    // Each package gets its threshold when it reaches Phase 1.
    coverage: {
      provider: 'v8',
      include: ['packages/*/src/**/*.ts'],
      exclude: ['**/*.test.ts', '**/*.d.ts'],
      reporter: ['text-summary', 'text'],
      thresholds: {
        'packages/core/src/**': { lines: 90 },
      },
    },
  },
});
