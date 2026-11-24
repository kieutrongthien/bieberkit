/**
 * BieberKit
 *
 * @file        packages/admin-antd/vite.config.ts
 * @description Builds the admin application into dist/app: static files with content hashes, to be served under /admin/ by the web role (UI-08, UI-14).
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

import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  root: 'src/app',
  base: '/admin/',
  plugins: [react()],
  build: {
    outDir: '../../dist/app',
    emptyOutDir: true,
    sourcemap: false,
    // A page with a policy of `script-src 'self'` cannot run an inline script, so the build inlines none (SEC-01).
    modulePreload: { polyfill: false },
    assetsInlineLimit: 0,
  },
});
