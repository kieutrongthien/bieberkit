/**
 * BieberKit
 *
 * @file        plugins/media/tsdown.admin.config.ts
 * @description Build of the admin part of @bieberkit/plugin-media: one file out for each file in, for the build of a project, which splits its chunks. React, Ant Design and the shell stay imports (UI-37).
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

import { defineConfig } from 'tsdown';

export default defineConfig({
  entry: ['src/admin/index.ts'],
  outDir: 'dist/admin',
  unbundle: true,
  format: 'esm',
  platform: 'neutral',
  target: 'es2024',
  dts: true,
  tsconfig: 'src/admin/tsconfig.json',
  fixedExtension: false,
  clean: true,
});
