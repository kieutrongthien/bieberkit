/**
 * BieberKit
 *
 * @file        packages/admin-core/src/part.ts
 * @description The contract of the admin part of a plugin, with no UI library: what a plugin declares, slot by slot. The type `C` is the component of the adapter (UI-34, UI-35, UI-10).
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

import type { Locale } from './i18n.ts';

/** A component is read when it is first drawn, so each contribution is a chunk of its own (UI-12). */
export type Load<C> = () => Promise<{ default: C }>;

export interface Contribution<C> {
  /** Unique among the contributions of its plugin. */
  readonly id: string;
  readonly load: Load<C>;
  /** What a person needs to see it. The server stays the authority. */
  readonly permission?: string;
}

export interface MenuContribution {
  /** The address of a page of the same plugin. */
  readonly page: string;
  /** A group of the menu: `app`, `people`, `content`, `system`, or one of `admin.menu`. */
  readonly group?: string;
  readonly icon?: string;
  readonly permission?: string;
}

export interface PageContribution<C> {
  /** One segment, such as `/notes`: two segments are the list of an entity. */
  readonly path: string;
  /** A key of the texts of the plugin. */
  readonly title: string;
  readonly load: Load<C>;
  readonly permission?: string;
}

/** What a gate may look at to say whether it stands in place of the admin. */
export interface GateState {
  /** The refusal of the metadata, when it was refused. */
  readonly metaError: unknown;
}

export type Texts = Readonly<Record<string, string>>;

/** The slots of the admin, a closed list (UI-35). Every key is optional. */
export interface AdminPartInput<C> {
  /** The npm name of the plugin. */
  readonly name: string;
  /** Slot 1: entries of the menu. */
  readonly menu?: readonly MenuContribution[];
  /** Slot 2: pages after sign in. */
  readonly pages?: readonly PageContribution<C>[];
  /** Slot 3: buttons in the header. */
  readonly headerActions?: readonly Contribution<C>[];
  /** Slot 4: notices over the frame. */
  readonly notices?: readonly Contribution<C>[];
  /** Slot 5: tabs of the detail of a record of an entity, or of every entity with `*`. */
  readonly recordTabs?: readonly (Contribution<C> & { readonly entity: string; readonly title: string })[];
  /** Slot 6: the control of every field whose `admin.widget`, or whose widget of the metadata, is `widget`. */
  readonly fields?: readonly (Contribution<C> & { readonly widget: string })[];
  /** Slot 7: blocks of the home page. */
  readonly homeBlocks?: readonly (Contribution<C> & { readonly title: string })[];
  /** Slot 8: tabs of "My account". The page and its entry in the menu of the account exist when a part gives one. */
  readonly accountTabs?: readonly (Contribution<C> & { readonly title: string })[];
  /** Slot 9: pages that open without a session, and the sign in. */
  readonly publicPages?: readonly { readonly path: string; readonly load: Load<C> }[];
  readonly signIn?: { readonly load: Load<C> };
  /** Slot 10: screens that stand in place of the admin while `needed` says so. */
  readonly gates?: readonly (Contribution<C> & { readonly needed: (state: GateState) => boolean })[];
  /** The replacement of a generic list or form (UI-04). */
  readonly screens?: readonly (Contribution<C> & { readonly replace: `list:${string}` | `form:${string}` })[];
  /** The texts by language. Each key begins with the short name of the plugin and a dot. English is the reference. */
  readonly messages?: Partial<Record<Locale, () => Promise<{ default: Texts }>>>;
}

export type AdminPart<C> = AdminPartInput<C>;

/**
 * A component of any adapter: something that draws from its props. Each slot gives its own props, so the contract names none, and the
 * types of an adapter say what each slot gives.
 */
export type AdminView = ((props: never) => unknown) | (new (props: never) => unknown);

/**
 * What the entry `./admin` of a plugin exports by default. The type of a component is not inferred from the first slot that has one,
 * which would refuse the others: without a type argument every component is taken, and a key that no slot has is still an error.
 */
export function defineAdminPlugin<C = AdminView>(input: AdminPartInput<NoInfer<C>>): AdminPart<C> {
  return input;
}

/** The name that the texts of a plugin begin with: `@bieberkit/plugin-users` is `users`, `bieberkit-plugin-notes` is `notes`. */
export function shortNameOf(name: string): string {
  const bare = name.startsWith('@') ? name.slice(name.indexOf('/') + 1) : name;
  return bare.replace(/^bieberkit-plugin-/, '').replace(/^plugin-/, '');
}
