/**
 * BieberKit
 *
 * @file        e2e/playwright.config.ts
 * @description The configuration of the browser test: one Chromium, the web role of a blank project as the server, and a policy violation of the page as a failure (spec section 21).
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

import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: '.',
  testMatch: '*.spec.ts',
  fullyParallel: false,
  workers: 1,
  reporter: [['list']],
  timeout: 30_000,
  use: {
    baseURL: 'http://127.0.0.1:4310',
    trace: 'retain-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      testMatch: ['admin.spec.ts', 'screens.spec.ts', 'accessibility.spec.ts', 'identity.spec.ts', 'account.spec.ts'],
      use: { browserName: 'chromium' },
    },
    // The admin at the root of a host of its own. Chromium resolves `*.localhost` to this machine.
    {
      name: 'subdomain',
      testMatch: 'admin-subdomain.spec.ts',
      use: { browserName: 'chromium', baseURL: 'http://admin.localhost:4312' },
    },
  ],
  webServer: [
    {
      command: 'node serve.mjs',
      url: 'http://127.0.0.1:4310/health/ready',
      reuseExistingServer: false,
      timeout: 120_000,
      stdout: 'pipe',
      stderr: 'pipe',
    },
    {
      command: 'node serve.mjs',
      env: { E2E_PORT: '4312', E2E_ADMIN_URL: 'http://admin.localhost:4312' },
      url: 'http://127.0.0.1:4312/health/ready',
      reuseExistingServer: false,
      timeout: 120_000,
      stdout: 'pipe',
      stderr: 'pipe',
    },
  ],
});
