/**
 * BieberKit
 *
 * @file        packages/cli/src/commands/migrate.ts
 * @description The commands bieberkit migrate:make and migrate, with --status, --rollback and --allow-destructive, over the migrate functions of @bieberkit/server (section 5.2, DATA-08, DATA-25).
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

import { readFileSync, writeFileSync } from 'node:fs';
import { relative } from 'node:path';
import { findProjectRoot, makeMigration, migrationStatus, rollbackMigration, runMigrations } from '@bieberkit/server';
import type { MigrationsOptions } from '@bieberkit/server';
import type { Command, CommandContext } from '../command.ts';
import { usageError } from '../errors.ts';
import { projectHeader } from '../make.ts';
import { loadConfig } from '../project.ts';

const list = (title: string, names: readonly string[]): string =>
  `${title}${names.length === 0 ? ' none' : `\n${names.map((name) => `  ${name}`).join('\n')}`}`;

function optionsOf(context: CommandContext): MigrationsOptions {
  const deployId = context.args.flags['deploy-id'];
  return {
    cwd: context.cwd,
    ...(context.env === undefined ? {} : { env: context.env }),
    ...(typeof deployId === 'string' && deployId !== '' ? { deployId } : {}),
  };
}

export const migrateMakeCommand: Command = {
  name: 'migrate:make',
  summary: 'Write a migration for what the entities changed since the snapshot of the dialect.',
  positionals: [{ name: 'name' }],
  async run(context) {
    const name = context.args.positionals[0];
    const made = await makeMigration({ ...optionsOf(context), ...(name === undefined ? {} : { name }) });
    if (made === null) return { data: { made: false }, text: 'Nothing to make: the entities and the snapshot agree.' };
    const root = findProjectRoot(context.cwd) ?? context.cwd;
    const file = relative(root, made.path).split('\\').join('/');
    // The file is code of the project, which bieberkit check holds to the header like the rest (section 23.7).
    const { config } = await loadConfig(context.cwd);
    const header = projectHeader(
      config,
      file,
      'A migration: what the entities changed since the one before.',
      new Date().getFullYear(),
    );
    writeFileSync(made.path, `${header}${readFileSync(made.path, 'utf8')}`);
    return {
      data: { made: true, name: made.name, file, destructive: made.destructive },
      text: [
        `Wrote ${file}`,
        ...made.destructive.map((found) => `warning: ${found.kind}: ${found.statement}`),
        ...(made.destructive.length > 0
          ? ['This migration drops, renames or narrows something. Run it in the contract release only (DATA-08).']
          : []),
      ].join('\n'),
    };
  },
};

export const migrateCommand: Command = {
  name: 'migrate',
  summary:
    'Apply the pending steps of the plugins and the pending migrations (--status lists them, --rollback reverts one).',
  flags: [
    { name: 'status', type: 'boolean', description: 'List what ran and what waits, and run nothing.' },
    {
      name: 'deploy-id',
      type: 'string',
      description:
        'The id of this deploy, such as the release id (DEPLOY_ID). Every run of one release must use the same one (DATA-08).',
    },
    { name: 'rollback', type: 'boolean', description: 'Revert the last migration file of the project.' },
    {
      name: 'allow-destructive',
      type: 'boolean',
      description: 'Run migrations that drop, rename or narrow something. Only in the contract release (DATA-08).',
    },
  ],
  async run(context) {
    const flags = context.args.flags;
    if (flags['status'] === true && flags['rollback'] === true) {
      throw usageError(
        'BK_USAGE_FLAGS_CONFLICT',
        '--status and --rollback cannot be used together.',
        'Use one: bieberkit migrate --status, or bieberkit migrate --rollback',
      );
    }
    const options = optionsOf(context);
    if (flags['status'] === true) {
      const status = await migrationStatus(options);
      return {
        data: status,
        text: [
          list('Executed:', status.executed),
          list('Pending:', status.pending),
          list('Steps applied:', status.steps.applied),
          list('Steps pending:', status.steps.pending),
        ].join('\n'),
      };
    }
    if (flags['rollback'] === true) {
      const reverted = await rollbackMigration(options);
      return {
        data: { reverted },
        text: reverted.length === 0 ? 'Nothing to roll back.' : `Rolled back ${reverted.join(', ')}.`,
      };
    }
    const done = await runMigrations({ ...options, allowDestructive: flags['allow-destructive'] === true });
    return {
      data: { steps: done.steps.applied, migrations: done.migrations, deployId: done.steps.deployId },
      text:
        done.steps.applied.length + done.migrations.length === 0
          ? 'The database is up to date.'
          : [
              ...done.steps.applied.map((step) => `step ${step}`),
              ...done.migrations.map((name) => `migration ${name}`),
            ].join('\n'),
    };
  },
};
