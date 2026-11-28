/**
 * BieberKit
 *
 * @file        packages/admin-core/src/menu.ts
 * @description The menu of the admin: groups in the order of the config over what `_meta` lets the person see, the search of a page and the entry of an address, with no visual part (UI-24, UI-10).
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

import type { MenuGroupSettings } from './settings.ts';
import type { Meta, MetaLabel } from './types.ts';

export interface MenuEntry {
  /** The name of the entity, or the address of a page of a plugin. */
  readonly key: string;
  /** The route of the admin, without its base. */
  readonly path: string;
  /** By language. */
  readonly label: MetaLabel;
  /** What the entry is called when its label has no text. */
  readonly name: string;
  /** Names of icons, the best first. An adapter draws the first that it has. */
  readonly icons: readonly string[];
}

export interface MenuGroup {
  readonly id: string;
  /** Absent for a group of the framework, which the adapter names in the language of the person. */
  readonly label?: string | MetaLabel;
  readonly entries: readonly MenuEntry[];
}

/** A page that the admin part of a plugin puts in the menu (UI-35). */
export interface MenuPage {
  /** Its route in the admin, such as `/notes`. */
  readonly path: string;
  /** The short name of its plugin, which an order of the config may name. */
  readonly module: string;
  readonly label: MetaLabel;
  readonly icons: readonly string[];
  /** The group that it asks for. The order of the config wins over it. */
  readonly group?: string;
}

const REST = 'app';

/** The order of the base plugins of `blank` (section 12): what the project adds first. */
export const DEFAULT_MENU: readonly MenuGroupSettings[] = [
  { id: REST, items: [] },
  { id: 'people', items: ['users', 'roles'] },
  { id: 'content', items: ['media', 'notifications'] },
  { id: 'system', items: ['settings', 'audit-log'] },
];

interface Found extends MenuEntry {
  readonly module: string;
  /** The group of an entry that no group of the order names. */
  readonly home: string;
}

/** The entities that the person may list. `_meta` left out what the person may not use. */
function entriesOf(meta: Meta): Found[] {
  const entities = meta.entities
    .filter((entity) => entity.operations.list && entity.can.read)
    .map((entity): Found => {
      const [module = '', short = entity.name] = entity.name.split('.');
      return {
        key: entity.name,
        module,
        path: `/${entity.path.replace('/api/v1/', '')}`,
        label: entity.label,
        name: short,
        icons: entity.icon === undefined ? [module] : [entity.icon, module],
        home: REST,
      };
    });
  return entities;
}

const entryOf = ({ module: _module, home: _home, ...entry }: Found): MenuEntry => entry;

/**
 * The groups of the menu: the entities that the person may list and the pages of plugins. An entry is in the first group of the order
 * that names it. What no group names goes to the group that its page asks for, and to `app` when it asks for none.
 */
export function menuOf(
  meta: Meta,
  order: readonly MenuGroupSettings[] = DEFAULT_MENU,
  pages: readonly MenuPage[] = [],
): MenuGroup[] {
  let left: Found[] = [
    ...entriesOf(meta),
    ...pages.map(({ path, module, label, icons, group }) => ({
      key: path,
      module,
      path,
      label,
      name: path,
      icons,
      home: group ?? REST,
    })),
  ];
  const groups = order.map((group) => {
    const entries: MenuEntry[] = [];
    for (const item of group.items) {
      const named = (entry: Found): boolean => entry.key === item || entry.module === item;
      entries.push(...left.filter(named).map(entryOf));
      left = left.filter((entry) => !named(entry));
    }
    return { id: group.id, ...(group.label === undefined ? {} : { label: group.label }), entries };
  });
  for (const entry of left) {
    const own = groups.find((group) => group.id === entry.home);
    if (own === undefined) groups.push({ id: entry.home, entries: [entryOf(entry)] });
    else own.entries.push(entryOf(entry));
  }
  return groups.filter((group) => group.entries.length > 0);
}

/** A text as the search compares it: without case and without accents, and `đ` as `d`. */
const fold = (text: string): string =>
  text
    .normalize('NFD')
    .replaceAll(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .replaceAll('đ', 'd')
    .trim();

/** The pages whose label holds `text`, in the order of the menu. It searches pages only, never records. */
export function searchMenu(
  groups: readonly MenuGroup[],
  text: string,
  labelOfEntry: (entry: MenuEntry) => string,
): MenuEntry[] {
  const wanted = fold(text);
  return groups.flatMap((group) => group.entries).filter((entry) => fold(labelOfEntry(entry)).includes(wanted));
}

/** The entry that an address of the admin is under: the list, a record of it or a new record. */
export function currentEntry(
  groups: readonly MenuGroup[],
  path: string,
): { readonly group: MenuGroup; readonly entry: MenuEntry } | undefined {
  let found: { group: MenuGroup; entry: MenuEntry } | undefined;
  for (const group of groups) {
    for (const entry of group.entries) {
      if (path !== entry.path && !path.startsWith(`${entry.path}/`)) continue;
      if (found === undefined || entry.path.length > found.entry.path.length) found = { group, entry };
    }
  }
  return found;
}
