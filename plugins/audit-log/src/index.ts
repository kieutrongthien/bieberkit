/**
 * BieberKit
 *
 * @file        plugins/audit-log/src/index.ts
 * @description The audit-log plugin: the entries of the tenant with filters, one entry with its actor, an export in CSV or NDJSON and the list of actions; nothing here changes a row (OBS-05, AUD-01 to AUD-06).
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

import { definePlugin, env } from '@bieberkit/core';
import type { PluginDef } from '@bieberkit/core';
import pkg from '../package.json' with { type: 'json' };
import { DEFAULT_EXPORT_MAX } from './routes/shared.ts';
import { routes } from './routes/index.ts';
import { mirrorJob } from './jobs/mirror.ts';
import { subscriptions } from './events/subscriptions.ts';
export type { Actor, EntryView, Filters } from './services/entries.ts';
export { entries } from './routes/entries.ts';
export type { RecordedEntry } from './jobs/mirror.ts';
export { mirrorJob } from './jobs/mirror.ts';
export { subscriptions } from './events/subscriptions.ts';

const plugin: PluginDef = definePlugin({
  name: '@bieberkit/plugin-audit-log',
  version: pkg.version,
  core: '*',
  dialects: ['postgres', 'mysql', 'sqlite'],
  env: {
    AUDIT_LOG_EXPORT_MAX_ROWS: env
      .int({ min: 1, max: 10_000_000 })
      .default(DEFAULT_EXPORT_MAX)
      .describe('The most entries that one export of the audit log holds; a longer one is cut and says so (AUD-03)'),
    AUDIT_LOG_MIRROR: env
      .boolean()
      .default(false)
      .describe('Copy every audit entry to the log as one line with audit: true, after commit, for a SIEM (AUD-07)'),
  },
  permissions: ['audit-log.read', 'audit-log.export', 'audit-log.hold'],
  routes,
  jobs: [mirrorJob],
  subscriptions,
});

export default plugin;
