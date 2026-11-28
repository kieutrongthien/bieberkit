/**
 * BieberKit
 *
 * @file        packages/admin-core/src/compose.ts
 * @description What the admin parts of a project make together, with every mistake in them: addresses, ids, the sign in and the texts of each language (UI-35, UI-36). It runs in the build of a project, which stops on a problem.
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

import { LOCALES } from './i18n.ts';
import type { Locale } from './i18n.ts';
import { shortNameOf } from './part.ts';
import type { AdminPart, AdminPartInput, MenuContribution, Texts } from './part.ts';

export interface AdminProblem {
  /** The plugin that has the mistake, or empty for one that no plugin has alone. */
  readonly plugin: string;
  readonly code: string;
  readonly message: string;
}

type Slot<C, K extends keyof AdminPartInput<C>> =
  NonNullable<AdminPartInput<C>[K]> extends readonly (infer T)[] ? T : never;

/** A contribution and the plugin that gives it. */
export type Owned<T> = T & { readonly plugin: string };

export interface AdminRegistry<C> {
  readonly menu: readonly Owned<MenuContribution>[];
  readonly pages: readonly Owned<Slot<C, 'pages'>>[];
  readonly headerActions: readonly Owned<Slot<C, 'headerActions'>>[];
  readonly notices: readonly Owned<Slot<C, 'notices'>>[];
  readonly recordTabs: readonly Owned<Slot<C, 'recordTabs'>>[];
  readonly fields: readonly Owned<Slot<C, 'fields'>>[];
  readonly homeBlocks: readonly Owned<Slot<C, 'homeBlocks'>>[];
  readonly accountTabs: readonly Owned<Slot<C, 'accountTabs'>>[];
  readonly publicPages: readonly Owned<Slot<C, 'publicPages'>>[];
  readonly signIn: Owned<NonNullable<AdminPartInput<C>['signIn']>> | undefined;
  readonly gates: readonly Owned<Slot<C, 'gates'>>[];
  readonly screens: readonly Owned<Slot<C, 'screens'>>[];
  readonly parts: readonly AdminPart<C>[];
}

const SLOTS: ReadonlySet<string> = new Set([
  'name',
  'menu',
  'pages',
  'headerActions',
  'notices',
  'recordTabs',
  'fields',
  'homeBlocks',
  'accountTabs',
  'publicPages',
  'signIn',
  'gates',
  'screens',
  'messages',
]);

/** The addresses that the shell draws itself. */
const RESERVED: ReadonlySet<string> = new Set(['/account', '/ext']);
const PATH = /^\/[a-z][a-z0-9-]*$/;

export function composeAdmin<C>(parts: readonly AdminPart<C>[]): {
  readonly admin: AdminRegistry<C>;
  readonly problems: readonly AdminProblem[];
} {
  const problems: AdminProblem[] = [];
  const paths = new Map<string, string>();
  const widgets = new Map<string, string>();
  const replaced = new Map<string, string>();
  const prefixes = new Map<string, string>();
  const signIns: Owned<NonNullable<AdminPartInput<C>['signIn']>>[] = [];

  const owned = <T extends object>(read: (part: AdminPart<C>) => readonly T[] | undefined): Owned<T>[] =>
    parts.flatMap((part) => (read(part) ?? []).map((item) => ({ ...item, plugin: part.name })));

  for (const part of parts) {
    const plugin = part.name;
    const add = (code: string, message: string): void => void problems.push({ plugin, code, message });
    /** Takes a name for the plugin, and says who has it already. */
    const take = (taken: Map<string, string>, name: string, code: string, what: string): void => {
      const holder = taken.get(name);
      if (holder === undefined) taken.set(name, plugin);
      else add(code, `${what} "${name}" is taken by ${holder}.`);
    };

    // The texts of a plugin are told apart by its short name, so two plugins with texts cannot share one.
    if (part.messages !== undefined)
      take(prefixes, shortNameOf(plugin), 'duplicate-name', 'The short name of the texts');

    for (const key of Object.keys(part))
      if (!SLOTS.has(key)) add('unknown-key', `"${key}" is no slot of the admin. The list of slots is closed.`);

    for (const page of [...(part.pages ?? []), ...(part.publicPages ?? [])]) {
      if (!PATH.test(page.path))
        add(
          'bad-path',
          `"${page.path}" is not an address of a page: one segment of lower case letters, digits and dashes, such as /notes.`,
        );
      else if (RESERVED.has(page.path)) add('reserved-path', `"${page.path}" is an address of the shell.`);
      else take(paths, page.path, 'duplicate-path', 'The address');
    }

    const own = new Set((part.pages ?? []).map((page) => page.path));
    for (const entry of part.menu ?? [])
      if (!own.has(entry.page))
        add('menu-without-page', `The menu names "${entry.page}", which is no page of this plugin.`);

    const ids = new Set<string>();
    for (const list of [
      part.headerActions,
      part.notices,
      part.recordTabs,
      part.fields,
      part.homeBlocks,
      part.accountTabs,
      part.gates,
      part.screens,
    ])
      for (const item of list ?? []) {
        if (ids.has(item.id)) add('duplicate-id', `The id "${item.id}" is used twice.`);
        ids.add(item.id);
      }

    for (const item of part.fields ?? []) take(widgets, item.widget, 'duplicate-field', 'The control of the widget');
    for (const item of part.screens ?? []) take(replaced, item.replace, 'duplicate-screen', 'The screen');
    if (part.signIn !== undefined) signIns.push({ ...part.signIn, plugin });
  }

  if (signIns.length === 0)
    problems.push({
      plugin: '',
      code: 'no-sign-in',
      message: 'No plugin gives the sign in. The shell has none of its own: add the users plugin.',
    });
  for (const extra of signIns.slice(1))
    problems.push({
      plugin: extra.plugin,
      code: 'two-sign-ins',
      message: `The sign in is given by ${signIns[0]?.plugin ?? ''} already.`,
    });

  return {
    admin: {
      menu: owned((part) => part.menu),
      pages: owned((part) => part.pages),
      headerActions: owned((part) => part.headerActions),
      notices: owned((part) => part.notices),
      recordTabs: owned((part) => part.recordTabs),
      fields: owned((part) => part.fields),
      homeBlocks: owned((part) => part.homeBlocks),
      // The plugin that gives the sign in owns the account: its tabs come first, so "My account" opens on one of them.
      accountTabs: owned((part) => part.accountTabs).toSorted(
        (a, b) => Number(b.plugin === signIns[0]?.plugin) - Number(a.plugin === signIns[0]?.plugin),
      ),
      publicPages: owned((part) => part.publicPages),
      signIn: signIns[0],
      gates: owned((part) => part.gates),
      screens: owned((part) => part.screens),
      parts,
    },
    problems,
  };
}

/** The keys of the texts that a part names in its slots. */
const titlesOf = <C>(part: AdminPart<C>): string[] =>
  [part.pages, part.recordTabs, part.homeBlocks, part.accountTabs].flatMap((list) =>
    (list ?? []).map((item) => item.title),
  );

const isBundled = (language: string): language is Locale => (LOCALES as readonly string[]).includes(language);

/**
 * What is wrong with the texts of the parts, for the languages of a project. English is the reference: every language that the admin
 * bundles and the project has must have its keys, and no other. Each key begins with the short name of its plugin, so no plugin
 * changes the text of another.
 */
export async function messageProblems<C>(
  parts: readonly AdminPart<C>[],
  languages: readonly string[],
): Promise<readonly AdminProblem[]> {
  const problems: AdminProblem[] = [];
  const wanted = languages.filter(isBundled);
  for (const part of parts) {
    const plugin = part.name;
    const add = (code: string, message: string): void => void problems.push({ plugin, code, message });
    const titles = titlesOf(part);
    const read = async (language: Locale): Promise<Texts | undefined> => (await part.messages?.[language]?.())?.default;
    const english = await read('en');
    if (english === undefined) {
      if (titles.length > 0 || part.messages !== undefined)
        add('message-missing', 'The English texts (messages.en) are missing.');
      continue;
    }
    const keys = Object.keys(english);
    const prefix = `${shortNameOf(plugin)}.`;
    for (const key of keys)
      if (!key.startsWith(prefix)) add('message-prefix', `The key "${key}" does not begin with "${prefix}".`);
    for (const title of titles)
      if (!keys.includes(title)) add('message-missing', `The title "${title}" is no key of the English texts.`);
    for (const language of wanted) {
      if (language === 'en') continue;
      const texts = await read(language);
      if (texts === undefined) {
        add('message-missing', `The texts of "${language}", a language of the project, are missing.`);
        continue;
      }
      for (const key of keys)
        if (!(key in texts)) add('message-missing', `The texts of "${language}" miss the key "${key}".`);
      for (const key of Object.keys(texts))
        if (!(key in english))
          add('message-extra', `The texts of "${language}" have the key "${key}", which English has not.`);
    }
  }
  return problems;
}

/**
 * The gates that may be asked: one behind a permission that the person does not hold is left out. A refusal of the metadata, which
 * some gates are there to answer, leaves the permissions unknown (`undefined`), and then every gate is asked.
 */
export function gatesFor<T extends { readonly permission?: string }>(
  gates: readonly T[],
  held: readonly string[] | undefined,
): readonly T[] {
  return held === undefined ? gates : allowed(gates, new Set(held));
}

/** What a person may see: what asks for no permission, and what they hold. The server stays the authority. */
export function allowed<T extends { readonly permission?: string }>(
  items: readonly T[],
  can: ReadonlySet<string>,
): readonly T[] {
  return items.filter((item) => item.permission === undefined || can.has(item.permission));
}
