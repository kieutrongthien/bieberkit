/**
 * BieberKit
 *
 * @file        packages/http/src/admin-extensions.ts
 * @description What a plugin adds to the admin: pages, menu entries, widgets and replaced screens, each a file of the plugin that the browser loads, how a contribution is checked, and what `_meta` says about it (UI-04, ADR 0037).
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

/** A text for the screen: one text, or one for each language. */
export type Label = string | Readonly<Record<string, string>>;

/** A page of the plugin: a module that draws a screen at `/ext/<plugin>/<path>`. */
export interface AdminPage {
  /** One segment of the address: lower case letters, digits and dashes. */
  readonly path: string;
  /** A file of the folder `admin` of the plugin, such as `reports.js`. */
  readonly module: string;
  readonly title: Label;
  /** Put the page in the menu. */
  readonly menu?: boolean;
  /** The permission that a person needs to see the page and its menu entry. */
  readonly permission?: string;
}

/**
 * A piece that is drawn inside a screen of the admin. The slot says where: `dashboard` is the first page, `form:<module.Entity>` is a
 * tab of the detail of a record, and `field:<name>` is the control of every field whose `admin.widget` is that name.
 */
export interface AdminWidget {
  readonly slot: string;
  readonly module: string;
  readonly title?: Label;
  readonly permission?: string;
}

/** A screen of the admin that the plugin draws in place of the generic one: `list:<module.Entity>` or `form:<module.Entity>`. */
export interface AdminScreen {
  readonly replace: string;
  readonly module: string;
  readonly permission?: string;
}

/** The `admin` key of a plugin (spec 11.1). */
export interface AdminContribution {
  readonly pages?: readonly AdminPage[];
  readonly widgets?: readonly AdminWidget[];
  readonly screens?: readonly AdminScreen[];
}

/** One page, widget or screen as `_meta` carries it: the plugin that owns it, and the address of its module under the admin. */
export interface PreparedPage {
  readonly plugin: string;
  readonly path: string;
  readonly module: string;
  readonly title: Readonly<Record<string, string>>;
  readonly permission?: string;
}
export interface PreparedWidget {
  readonly plugin: string;
  readonly slot: string;
  readonly module: string;
  readonly title: Readonly<Record<string, string>>;
  readonly permission?: string;
}
export interface PreparedScreen {
  readonly plugin: string;
  readonly replace: string;
  readonly module: string;
  readonly permission?: string;
}
export interface PreparedMenu {
  readonly label: Readonly<Record<string, string>>;
  readonly path: string;
  readonly permission?: string;
}

export interface AdminExtensions {
  readonly pages: readonly PreparedPage[];
  readonly widgets: readonly PreparedWidget[];
  readonly screens: readonly PreparedScreen[];
  readonly menu: readonly PreparedMenu[];
}

const PAGE_PATH = /^[a-z][a-z0-9-]*$/;
const MODULE_FILE = /^[A-Za-z0-9][A-Za-z0-9._-]*\.js$/;
const ENTITY_NAME = /^[a-z][a-z0-9-]*\.[A-Z][A-Za-z0-9]*$/;
const WIDGET_NAME = /^[A-Za-z][A-Za-z0-9-]*$/;

const isSlot = (slot: string): boolean =>
  slot === 'dashboard' ||
  (slot.startsWith('form:') && ENTITY_NAME.test(slot.slice(5))) ||
  (slot.startsWith('field:') && WIDGET_NAME.test(slot.slice(6)));

const isReplace = (replace: string): boolean =>
  (replace.startsWith('list:') || replace.startsWith('form:')) && ENTITY_NAME.test(replace.slice(5));

const blank = (label: Label): boolean =>
  typeof label === 'string' ? label.trim() === '' : Object.keys(label).length === 0;

/** What is wrong with the `admin` of a plugin, as sentences. The plugin is named in each, so that a project with many reads the right one. */
export function extensionProblems(plugin: string, admin: AdminContribution): string[] {
  const problems: string[] = [];
  const at = (what: string): string => `${plugin}: admin.${what}`;
  const seen = new Set<string>();
  for (const page of admin.pages ?? []) {
    if (!PAGE_PATH.test(page.path))
      problems.push(
        `${at('pages')} "${page.path}" is not a path: one segment of lower case letters, digits and dashes.`,
      );
    if (seen.has(page.path)) problems.push(`${at('pages')} names the path "${page.path}" twice.`);
    seen.add(page.path);
    if (!MODULE_FILE.test(page.module))
      problems.push(`${at('pages')} "${page.module}" is not a module: a .js file of the folder admin of the plugin.`);
    if (blank(page.title)) problems.push(`${at('pages')} "${page.path}" needs a title.`);
  }
  for (const widget of admin.widgets ?? []) {
    if (!isSlot(widget.slot))
      problems.push(
        `${at('widgets')} "${widget.slot}" is not a slot: dashboard, form:<module.Entity> or field:<name>.`,
      );
    if (!MODULE_FILE.test(widget.module))
      problems.push(
        `${at('widgets')} "${widget.module}" is not a module: a .js file of the folder admin of the plugin.`,
      );
  }
  for (const screen of admin.screens ?? []) {
    if (!isReplace(screen.replace))
      problems.push(
        `${at('screens')} "${screen.replace}" cannot be replaced: list:<module.Entity> or form:<module.Entity>.`,
      );
    if (!MODULE_FILE.test(screen.module))
      problems.push(
        `${at('screens')} "${screen.module}" is not a module: a .js file of the folder admin of the plugin.`,
      );
  }
  return problems;
}

const labelOf = (label: Label | undefined, fallback: string): Readonly<Record<string, string>> =>
  label === undefined ? { en: fallback } : typeof label === 'string' ? { en: label } : label;

/** The address of a module of a plugin, under the admin: the web role serves the folder `admin` of the plugin there. */
export const moduleUrl = (plugin: string, module: string): string => `/plugins/${plugin}/${module}`;

/** The contributions of every plugin that has any, in the form that `_meta` and the web role use. */
export function adminExtensionsOf(
  plugins: readonly { readonly plugin: string; readonly admin: AdminContribution }[],
): AdminExtensions {
  const pages: PreparedPage[] = [];
  const widgets: PreparedWidget[] = [];
  const screens: PreparedScreen[] = [];
  const menu: PreparedMenu[] = [];
  for (const { plugin, admin } of plugins) {
    for (const page of admin.pages ?? []) {
      const title = labelOf(page.title, page.path);
      pages.push({
        plugin,
        path: page.path,
        module: moduleUrl(plugin, page.module),
        title,
        ...(page.permission === undefined ? {} : { permission: page.permission }),
      });
      if (page.menu === true)
        menu.push({
          label: title,
          path: `/ext/${plugin}/${page.path}`,
          ...(page.permission === undefined ? {} : { permission: page.permission }),
        });
    }
    for (const widget of admin.widgets ?? [])
      widgets.push({
        plugin,
        slot: widget.slot,
        module: moduleUrl(plugin, widget.module),
        title: labelOf(widget.title, widget.slot),
        ...(widget.permission === undefined ? {} : { permission: widget.permission }),
      });
    for (const screen of admin.screens ?? [])
      screens.push({
        plugin,
        replace: screen.replace,
        module: moduleUrl(plugin, screen.module),
        ...(screen.permission === undefined ? {} : { permission: screen.permission }),
      });
  }
  return { pages, widgets, screens, menu };
}
