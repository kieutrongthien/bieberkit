/**
 * BieberKit
 *
 * @file        packages/cli/src/commands/plugin.ts
 * @description bieberkit add and remove: install a plugin and put it in the config and the environment, or list the data that it owns and, once confirmed, drop it with a migration (section 5.2, PLG-03, DATA-02).
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

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { PluginDef } from '@bieberkit/core';
import { contributed } from '@bieberkit/server';
import type { EntityDef } from '@bieberkit/data';
import type { Command } from '../command.ts';
import { CliError, usageError } from '../errors.ts';
import { envExampleOf } from './env-example.ts';
import { addPlugin, pluginNames, removePlugin } from '../plugin-config.ts';
import { realSpawn, supervise } from '../processes.ts';
import { CONFIG_FILE, loadConfig, loadProject } from '../project.ts';
import type { Project } from '../project.ts';
import type { Spawn } from '../processes.ts';
import { projectHeader } from '../make.ts';

export interface PluginDeps {
  readonly spawn?: Spawn;
  readonly now?: () => Date;
}

const SERVER = 'apps/server';
const PLUGIN_NAME = /^(?:@[a-z0-9][a-z0-9._-]*\/)?[a-z0-9][a-z0-9._-]*$/;

/** Runs `pnpm add` or `pnpm remove` in the server app, where the plugins are dependencies (section 4.2). */
async function pnpm(spawn: Spawn, root: string, args: readonly string[]): Promise<void> {
  const code = await supervise(spawn('pnpm', args, { cwd: join(root, SERVER) }));
  if (code !== 0) {
    throw new CliError(`pnpm ${args.join(' ')} failed (${code}).`, {
      code: 'BK_PNPM_FAILED',
      fix: `Run it by hand in ${SERVER}, and read its message. The supply chain settings (minimumReleaseAge, strictDepBuilds) are never relaxed to make an install pass.`,
    });
  }
}

/** The keys of the environment that a plugin owns and that need a value from the person: no default, and not optional. */
function neededKeys(def: PluginDef<unknown>): string[] {
  return Object.entries(def.envSchema.keys)
    .filter(([, key]) => !key.hasDefault && !key.optional)
    .map(([name]) => name);
}

/** Adds `KEY=` lines to `.env` for the keys that it does not have, so that `env:check` names what is left to fill in. */
function addToDotenv(root: string, plugin: string, keys: readonly string[]): string[] {
  const path = join(root, '.env');
  const text = existsSync(path) ? readFileSync(path, 'utf8') : '';
  const missing = keys.filter((key) => !new RegExp(`^${key}=`, 'm').test(text));
  if (missing.length > 0)
    writeFileSync(
      path,
      `${text.endsWith('\n') || text === '' ? text : `${text}\n`}\n# ${plugin}\n${missing.map((key) => `${key}=`).join('\n')}\n`,
    );
  return missing;
}

function refreshExample(project: Project): void {
  writeFileSync(join(project.root, '.env.example'), envExampleOf(project).text);
}

export function addCommand(deps: PluginDeps = {}): Command {
  const spawn = deps.spawn ?? realSpawn;
  return {
    name: 'add',
    summary: 'Install a plugin, list it in the config, and add its environment keys.',
    positionals: [{ name: 'plugin', required: true }],
    async run(context) {
      const name = context.args.positionals[0] ?? '';
      if (!PLUGIN_NAME.test(name)) {
        throw usageError(
          'BK_USAGE_PLUGIN_NAME',
          `"${name}" is not the name of a plugin.`,
          'First-party plugins are @bieberkit/plugin-<name>, and community ones bieberkit-plugin-<name> (PLG-05).',
        );
      }
      const { root, configPath } = await loadConfig(context.cwd);
      const before = readFileSync(configPath, 'utf8');
      if (pluginNames(before).includes(name)) {
        throw new CliError(`${name} is in ${CONFIG_FILE} already.`, {
          code: 'BK_ADD_ALREADY',
          fix: 'Nothing to do. bieberkit plugins lists what is installed.',
        });
      }
      const edited = addPlugin(before, name);
      await pnpm(spawn, root, ['add', name]);
      writeFileSync(configPath, edited);
      let project: Project;
      try {
        // The graph is resolved with the real manifest of the plugin that was just installed: the same resolver as the scaffolder and the boot.
        project = await loadProject(root);
      } catch (error) {
        // Nothing of this attempt stays: the config is as it was, and the package is taken out again.
        writeFileSync(configPath, before);
        await pnpm(spawn, root, ['remove', name]).catch(() => undefined);
        throw error;
      }
      const def = project.plugins.find((entry) => entry.def.name === name)?.def;
      const added = def === undefined ? [] : addToDotenv(root, name, neededKeys(def));
      refreshExample(project);
      return {
        data: { plugin: name, version: def?.version, env: added },
        text: [
          `Added ${name}${def === undefined ? '' : `@${def.version}`}.`,
          ...(added.length === 0 ? [] : [`Fill in ${added.join(', ')} in .env.`]),
          'Its tables are made by the migrate role (bieberkit start migrate).',
        ].join('\n'),
      };
    },
  };
}

/** The tables that the entities of a plugin own. */
function tablesOf(def: PluginDef<unknown>): string[] {
  return contributed<EntityDef<string>>([def.module], 'entities')
    .map((entity) => entity.table)
    .toSorted();
}

const quote = (dialect: string, table: string): string => (dialect === 'mysql' ? `\`${table}\`` : `"${table}"`);

/** The file of the migration that drops what a plugin owned. It carries the marker that lets the check through, with its reason (DATA-08). */
function dropMigration(
  project: Project,
  def: PluginDef<unknown>,
  tables: readonly string[],
  at: Date,
): { path: string; content: string } {
  const stamp = at.toISOString().replaceAll(/[-:T]/g, '').slice(0, 14);
  const path = `migrations/Migration${stamp}_remove_${def.shortName.replaceAll('-', '_')}.ts`;
  const dialect = project.config.database.dialect;
  const cascade = dialect === 'postgres' ? ' cascade' : '';
  const drops = tables
    .map((table) => `    this.addSql('drop table if exists ${quote(dialect, table)}${cascade};');`)
    .join('\n');
  return {
    path,
    content: `${projectHeader(project.config, path, `Drops the tables of ${def.name}, which bieberkit remove took out of the project.`, at.getFullYear())}import { Migration } from '@mikro-orm/migrations';

export class Migration${stamp} extends Migration {
  // bieberkit-ignore BK_MIGRATION_DESTRUCTIVE: ${def.name} was removed and its owner confirmed that its data goes (PLG-03)
  override async up(): Promise<void> {
${drops}
  }

  override async down(): Promise<void> {
    throw new Error('The tables of ${def.name} cannot be made again from here: restore them from a backup.');
  }
}
`,
  };
}

export function removeCommand(deps: PluginDeps = {}): Command {
  const spawn = deps.spawn ?? realSpawn;
  return {
    name: 'remove',
    summary: 'List the data that a plugin owns, and once you confirm, remove it and make the migration that drops it.',
    positionals: [{ name: 'plugin', required: true }],
    flags: [{ name: 'yes', type: 'boolean', description: 'Confirm that the data of the plugin is dropped.' }],
    async run(context) {
      const name = context.args.positionals[0] ?? '';
      const project = await loadProject(context.cwd);
      const found = project.plugins.find((entry) => entry.def.name === name)?.def;
      if (found === undefined) {
        throw new CliError(`${name} is not an installed plugin.`, {
          code: 'BK_REMOVE_NOT_INSTALLED',
          fix: 'bieberkit plugins lists what is installed.',
        });
      }
      const users = project.plugins.filter((entry) => name in entry.def.requires).map((entry) => entry.def.name);
      if (users.length > 0) {
        throw new CliError(`${users.join(', ')} require${users.length === 1 ? 's' : ''} ${name}.`, {
          code: 'BK_REMOVE_REQUIRED_BY',
          fix: `Remove ${users.join(', ')} first.`,
        });
      }
      const tables = tablesOf(found);
      if (tables.length > 0 && context.args.flags['yes'] !== true) {
        const drop =
          (await context.prompts?.confirm(`${name} owns ${tables.join(', ')}. Drop that data?`, false)) ?? false;
        if (!drop) {
          throw new CliError(`${name} owns the tables ${tables.join(', ')}, and removing it drops them.`, {
            code: 'BK_REMOVE_CONFIRM_NEEDED',
            exit: 2,
            fix: `Run: bieberkit remove ${name} --yes. A backup first is the safe order (DEP-07).`,
          });
        }
      }
      const configPath = join(project.root, CONFIG_FILE);
      writeFileSync(configPath, removePlugin(readFileSync(configPath, 'utf8'), name));
      await pnpm(spawn, project.root, ['remove', name]);
      const after = await loadProject(project.root).catch(() => undefined);
      let migration: string | undefined;
      if (tables.length > 0) {
        const made = dropMigration(project, found, tables, (deps.now ?? (() => new Date()))());
        mkdirSync(join(project.root, 'migrations'), { recursive: true });
        writeFileSync(join(project.root, made.path), made.content);
        migration = made.path;
      }
      if (after !== undefined) refreshExample(after);
      return {
        data: { plugin: name, tables, migration },
        text: [
          `Removed ${name}.`,
          ...(migration === undefined
            ? []
            : [
                `Wrote ${migration}, which drops ${tables.join(', ')}.`,
                'Review it, back up the data, and run the migration when you deploy.',
              ]),
        ].join('\n'),
      };
    },
  };
}
