/**
 * BieberKit
 *
 * @file        packages/cli/src/commands/routes.ts
 * @description bieberkit routes: the routes of the application with their permissions (section 5.2).
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

import { loadApp } from '../app.ts';
import type { Command } from '../command.ts';

export const routesCommand: Command = {
  name: 'routes',
  summary: 'Print the routes with their permissions.',
  async run(context) {
    const app = await loadApp(context.cwd);
    const rows = app.routes
      .map((route) => ({
        method: route.method,
        url: route.url,
        access: route.public === true ? 'public' : (route.permission ?? 'none'),
        ...(route.deprecated === undefined ? {} : { deprecated: true }),
      }))
      .toSorted((a, b) => (a.url === b.url ? a.method.localeCompare(b.method) : a.url.localeCompare(b.url)));
    const width = Math.max(0, ...rows.map((row) => row.method.length));
    const wide = Math.max(0, ...rows.map((row) => row.url.length));
    return {
      data: { routes: rows },
      text:
        rows.length === 0
          ? 'The application has no routes.'
          : rows.map((row) => `${row.method.padEnd(width)}  ${row.url.padEnd(wide)}  ${row.access}`).join('\n'),
    };
  },
};
