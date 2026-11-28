/**
 * BieberKit
 *
 * @file        packages/cli/src/admin-app.ts
 * @description Where a project keeps its admin and where Vite serves it in dev, which the commands and the Vite plugin share (section 16.6, UI-37).
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

/** Where a project keeps its admin (section 16.6). */
export const ADMIN_APP = 'apps/admin';

/** The port of the dev server of the admin, unless `bieberkit dev --admin-port` says another. */
export const ADMIN_DEV_PORT = 5173;
