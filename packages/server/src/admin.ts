/**
 * BieberKit
 *
 * @file        packages/server/src/admin.ts
 * @description Serves the admin under /admin/ when the project has an admin adapter installed: it finds the built files of the package and serves them with the policy of the admin (UI-10, UI-14, SEC-01).
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

import { existsSync, realpathSync } from 'node:fs';
import { join } from 'node:path';
import { serveStatic } from '@bieberkit/http';
import type { HttpServer } from '@bieberkit/http';

/** The adapter that the framework maintains (UI-10). A project that installs another one sets its name in `admin.adapter` later. */
export const ADMIN_PACKAGE = '@bieberkit/admin-antd';

/** Where the admin is served (UI-14). */
export const ADMIN_PREFIX = '/admin';

/**
 * The policy of the admin (UI-14, SEC-01). Its files are static, so the policy is fixed: scripts only from the same origin, no frame,
 * no form that leaves the origin. `style-src` allows inline styles because Ant Design writes its tokens as style elements at run time
 * and a static file cannot carry a nonce (ADR 0025).
 */
export const ADMIN_POLICY: string = [
  "default-src 'none'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data:",
  "font-src 'self' data:",
  "connect-src 'self'",
  "base-uri 'none'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join('; ');

/**
 * The folder of the built admin of the project, or `undefined` when no adapter is installed. The adapter is a dependency of the
 * server app (or of the root), so it is in the `node_modules` of one of the two, and its application is `dist/app` in the package.
 * Only these two places are looked at: a package that happens to be on the path of the process is not the adapter of this project.
 */
export function adminDirectory(root: string): string | undefined {
  for (const base of [join(root, 'apps', 'server'), root]) {
    try {
      const folder = join(realpathSync(join(base, 'node_modules', ADMIN_PACKAGE)), 'dist', 'app');
      if (existsSync(join(folder, 'index.html'))) return folder;
    } catch {
      // Not installed here. Try the next place.
    }
  }
  return undefined;
}

/** Serves the admin under `/admin/` when it is installed. It answers whether it did. */
export function registerAdmin(server: HttpServer, root: string): boolean {
  const directory = adminDirectory(root);
  if (directory === undefined) return false;
  serveStatic(server, { prefix: ADMIN_PREFIX, directory, policy: ADMIN_POLICY });
  return true;
}
