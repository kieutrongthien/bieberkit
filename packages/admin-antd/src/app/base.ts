/**
 * BieberKit
 *
 * @file        packages/admin-antd/src/app/base.ts
 * @description Where the admin is served: the path that the server wrote in the page (UI-14), which the router and the loader of the code of plugins use.
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

/** `/admin`, `/panel`, or empty for the root of a host. Read from the page once, because the server writes it there. */
export function adminBase(): string {
  return document.querySelector('meta[name="bk-admin-base"]')?.getAttribute('content') ?? '';
}
