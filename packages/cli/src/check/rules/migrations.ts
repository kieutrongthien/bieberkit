/**
 * BieberKit
 *
 * @file        packages/cli/src/check/rules/migrations.ts
 * @description Rule migrations: a migration that drops, renames or retypes a column, or adds a not null column without a default, is reported (DATA-08).
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

import { detectDestructive, upStatementsOfMigration } from '@bieberkit/data';
import type { Rule, Violation } from '../rule.ts';
import { violation } from '../rule.ts';

const MIGRATION = /(?:^|\/)migrations\/[^/]+\.[cm]?ts$/;

export const migrationsRule: Rule = {
  name: 'migrations',
  summary: 'No migration drops or changes data in the release that adds the code that needs it (DATA-08).',
  run: ({ files }) => {
    const found: Violation[] = [];
    for (const file of files.filter((entry) => MIGRATION.test(entry.path))) {
      let statements: string[];
      try {
        statements = upStatementsOfMigration(file.text);
      } catch {
        found.push(
          violation(
            'migrations',
            'BK_MIGRATION_UNREADABLE',
            file.path,
            1,
            'The up() method of the migration cannot be read.',
            'A migration is a class that extends Migration and has up() and down().',
            'warning',
          ),
        );
        continue;
      }
      const line = Math.max(1, file.text.slice(0, Math.max(0, file.text.search(/\bup\s*\(/))).split('\n').length);
      for (const finding of detectDestructive(statements)) {
        found.push(
          violation(
            'migrations',
            'BK_MIGRATION_DESTRUCTIVE',
            file.path,
            line,
            `The migration has a destructive statement (${finding.kind}).`,
            'Split it: the release that adds the code adds, and a later release drops. A deliberate one: // bieberkit-ignore BK_MIGRATION_DESTRUCTIVE: <reason>',
          ),
        );
      }
    }
    return found;
  },
};
