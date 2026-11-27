/**
 * BieberKit
 *
 * @file        packages/cli/src/check/rules/plugin-tables.ts
 * @description The rule that a plugin does not query the tables or the entities of another plugin (PLG-02), as far as a static reading of the code can tell.
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

import { lineAt, matchesInCode } from '../code.ts';
import { installedPlugins, packageOf, pluginOf } from '../plugin-info.ts';
import type { PluginInfo } from '../plugin-info.ts';
import type { Rule, SourceFile, Violation } from '../rule.ts';
import { isCode, violation } from '../rule.ts';

// A call of a query builder that names a table: `selectFrom('bk_media')`, `innerJoin('bk_media as m', ...)`.
const BUILDER =
  /\.\s*(?:selectFrom|insertInto|updateTable|deleteFrom|innerJoin|leftJoin|rightJoin|fullJoin|crossJoin|from)\s*\(\s*(['"`])([^'"`\n]*)\1/g;
// A string that runs as SQL: a template with the `sql` tag, or the first argument of `sql.raw`, `.raw`, `.execute` and `.query`.
const TEXT =
  /(?:\bsql\s*\.\s*raw\s*\(\s*|\bsql\s*|\.\s*raw\s*\(\s*|\.\s*execute\s*\(\s*|\.\s*query\s*\(\s*)(['"`])((?:\\.|(?!\1)[^\\])*)\1/g;
const SQL_USE = /\b(?:from|join|into|update|table)\s+["`]?(?<table>[a-z][a-z0-9_]*)/gi;
const TABLE_NAME = /^["`]?([a-z][a-z0-9_]*)/i;
// An entity of the entity manager: `em.find(Media, ...)`, `em.createQueryBuilder(Media)`.
const ENTITY_CALL =
  /\.\s*(?:find|findOne|findOneOrFail|findAndCount|count|nativeInsert|nativeUpdate|nativeDelete|insertMany|upsert|create|createQueryBuilder|getRepository|getReference|populate)\s*\(\s*([A-Za-z_$][\w$]*)\b/g;
const NAMED_IMPORT = /\bimport\s*\{([^}]*)\}\s*from\s*(['"])([^'"\n]+)\2/g;

export interface TableFinding {
  readonly code: 'BK_PLUGIN_TABLE_QUERY' | 'BK_PLUGIN_ENTITY_QUERY';
  readonly line: number;
  readonly message: string;
}

/** The package of a bare specifier: `@scope/name/sub` is `@scope/name`. */
function packageName(specifier: string): string {
  const parts = specifier.split('/');
  return parts.slice(0, specifier.startsWith('@') ? 2 : 1).join('/');
}

/**
 * What a file queries that belongs to another plugin. `others` are the plugins that the file does not belong to. It sees a table
 * that is a literal in a query builder call or in SQL text, and an entity that the file imported from a plugin and gave to the
 * entity manager. It does not see a computed name, `classOf(em, name)` or a table that a variable holds: what it cannot see it does not claim.
 */
export function tableFindings(file: SourceFile, others: readonly PluginInfo[]): TableFinding[] {
  const owner = new Map<string, string>();
  for (const plugin of others) for (const table of plugin.tables) owner.set(table, plugin.name);
  const found: TableFinding[] = [];
  const add = (table: string, offset: number): void => {
    const name = owner.get(table);
    if (name !== undefined)
      found.push({
        code: 'BK_PLUGIN_TABLE_QUERY',
        line: lineAt(file.text, offset),
        message: `${file.path} queries ${table}, a table of ${name}.`,
      });
  };
  for (const match of matchesInCode(file.text, BUILDER)) {
    const table = TABLE_NAME.exec(match[2] ?? '')?.[1];
    if (table !== undefined) add(table, match.index);
  }
  for (const match of matchesInCode(file.text, TEXT)) {
    for (const use of (match[2] ?? '').matchAll(SQL_USE)) {
      const table = use.groups?.['table'];
      if (table !== undefined) add(table, match.index);
    }
  }
  const imported = new Map<string, string>();
  for (const match of matchesInCode(file.text, NAMED_IMPORT)) {
    const from = packageName(match[3] ?? '');
    if (!others.some((plugin) => plugin.name === from)) continue;
    for (const part of (match[1] ?? '').split(',')) {
      if (/^\s*type\s/.test(part)) continue;
      const [, local] = /^\s*[\w$]+(?:\s+as\s+([\w$]+))?\s*$/.exec(part) ?? [];
      const name = local ?? part.trim();
      if (name !== '') imported.set(name, from);
    }
  }
  for (const match of matchesInCode(file.text, ENTITY_CALL)) {
    const from = imported.get(match[1] ?? '');
    if (from !== undefined)
      found.push({
        code: 'BK_PLUGIN_ENTITY_QUERY',
        line: lineAt(file.text, match.index),
        message: `${file.path} gives ${match[1] ?? ''}, an entity of ${from}, to the entity manager.`,
      });
  }
  return found.toSorted((a, b) => a.line - b.line);
}

/** The plugins whose tables a file may not query: every plugin that is installed or lives in the project, except the file's own. */
export function plugins(
  root: string,
  files: readonly SourceFile[],
): { readonly all: PluginInfo[]; readonly ownerOf: (path: string) => PluginInfo | undefined } {
  const all = new Map(installedPlugins(root).map((plugin) => [plugin.name, plugin]));
  const owners = new Map<string, PluginInfo | undefined>();
  const ownerOf = (path: string): PluginInfo | undefined => {
    if (!owners.has(path)) {
      const own = packageOf(root, path);
      const plugin = own === undefined || own.dir === '' ? undefined : pluginOf(own.json, own.dir);
      owners.set(path, plugin);
      if (plugin !== undefined && !all.has(plugin.name)) all.set(plugin.name, plugin);
    }
    return owners.get(path);
  };
  for (const file of files) ownerOf(file.path);
  return { all: [...all.values()], ownerOf };
}

export const pluginTablesRule: Rule = {
  name: 'plugin-tables',
  summary:
    'A plugin does not query the tables or the entities of another plugin; it uses what the other plugin publishes (PLG-02).',
  run: ({ files, root }) => {
    const code = files.filter(isCode);
    const { all, ownerOf } = plugins(root, code);
    const found: Violation[] = [];
    for (const file of code) {
      const own = ownerOf(file.path);
      if (own === undefined) continue;
      for (const finding of tableFindings(
        file,
        all.filter((plugin) => plugin.name !== own.name),
      )) {
        found.push(
          violation(
            'plugin-tables',
            finding.code,
            file.path,
            finding.line,
            finding.message,
            'Use the service that the other plugin publishes (ServiceRegistry), or extend its entity with extends (PLG-06). This is a static check, not a sandbox (PLG-04).',
          ),
        );
      }
    }
    return found;
  },
};
