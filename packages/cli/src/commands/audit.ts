/**
 * BieberKit
 *
 * @file        packages/cli/src/commands/audit.ts
 * @description The command audit:prune: the retention of the audit log on the connection of the migrate role, counted first and deleted only with --yes (AUD-06).
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

import { pruneAudit } from '@bieberkit/server';
import type { Command } from '../command.ts';
import { usageError } from '../errors.ts';

const DATE = /^\d{4}-\d{2}-\d{2}(?:T[\d:.]+(?:Z|[+-]\d{2}:\d{2}))?$/;

function beforeOf(value: unknown): Date {
  const text = typeof value === 'string' ? value : '';
  const date = DATE.test(text) ? new Date(text) : new Date(Number.NaN);
  if (Number.isNaN(date.getTime())) {
    throw usageError(
      'BK_USAGE_DATE_INVALID',
      text === '' ? '--before is required.' : `--before ${JSON.stringify(text)} is not a date.`,
      'Give an ISO 8601 date: bieberkit audit:prune --before 2025-01-01',
    );
  }
  return date;
}

export const auditPruneCommand: Command = {
  name: 'audit:prune',
  summary:
    'Delete the audit entries before a date, on MIGRATE_DATABASE_URL. Prints the count; deletes only with --yes.',
  flags: [
    { name: 'before', type: 'string', description: 'Delete the entries written before this ISO 8601 date.' },
    { name: 'yes', type: 'boolean', description: 'Delete them. Without it the command only counts.' },
  ],
  async run(context) {
    const before = beforeOf(context.args.flags['before']);
    const apply = context.args.flags['yes'] === true;
    const done = await pruneAudit({
      cwd: context.cwd,
      ...(context.env === undefined ? {} : { env: context.env }),
      before,
      apply,
    });
    const when = before.toISOString();
    return {
      data: { before: when, count: done.count, pruned: done.pruned },
      text: done.pruned
        ? `Deleted ${String(done.count)} audit entries older than ${when}, and wrote audit.pruned.`
        : `${String(done.count)} audit entries are older than ${when}. Run again with --yes to delete them.`,
    };
  },
};
