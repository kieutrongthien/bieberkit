/**
 * BieberKit
 *
 * @file        packages/admin-core/src/extensions.ts
 * @description What the plugins add to the admin, as an adapter needs it: which page, which widgets of a slot, which screen replaces a generic one, which control draws a field, and the contract between the admin and the code of a plugin (UI-04, ADR 0037).
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

import type { AdminClient } from './client.ts';
import type { Locale } from './i18n.ts';
import type { Meta, MetaExtensions, MetaLabel, MetaPage, MetaScreen, MetaWidget } from './types.ts';

const NONE: MetaExtensions = { pages: [], widgets: [], screens: [] };

/** The extensions of a metadata, none for a server that does not send them. */
export const extensionsOf = (meta: Meta | undefined): MetaExtensions => meta?.extensions ?? NONE;

/** A label in the language, then in English, then the first that there is, then the fallback. */
export function labelText(label: MetaLabel | undefined, locale: string, fallback = ''): string {
  if (label === undefined) return fallback;
  return label[locale] ?? label['en'] ?? Object.values(label)[0] ?? fallback;
}

export const pageFor = (extensions: MetaExtensions, plugin: string, path: string): MetaPage | undefined =>
  extensions.pages.find((page) => page.plugin === plugin && page.path === path);

/** The widgets of a slot, in the order of the plugins. */
export const widgetsIn = (extensions: MetaExtensions, slot: string): readonly MetaWidget[] =>
  extensions.widgets.filter((widget) => widget.slot === slot);

/** The widget that draws a field whose `admin.widget` is `name`. The first plugin that gives one wins. */
export const fieldWidgetFor = (extensions: MetaExtensions, name: string): MetaWidget | undefined =>
  extensions.widgets.find((widget) => widget.slot === `field:${name}`);

/** The screen that replaces the list (`list`) or the form (`form`) of an entity. The first plugin that gives one wins. */
export const screenFor = (extensions: MetaExtensions, kind: 'list' | 'form', entity: string): MetaScreen | undefined =>
  extensions.screens.find((screen) => screen.replace === `${kind}:${entity}`);

/** The address that the browser loads a module from: the admin base, then the path under it. `module` is already under the admin. */
export const moduleSrc = (base: string, module: string): string => `${base.replace(/\/+$/, '')}${module}`;

/**
 * What the admin gives to the code of a plugin. A module of a plugin is a file with a default export, a function that takes this and
 * answers a component (ADR 0037). The plugin carries no copy of React or of the UI library: it uses `ui`, which is the same as the admin
 * uses, so that hooks and the theme work. `ui` is what the adapter says it is (React and Ant Design for the one of the project).
 */
export interface AdminHost<UI = unknown> {
  readonly ui: UI;
  readonly client: AdminClient;
  readonly locale: Locale;
  /** Opens a route of the admin, such as `/crm/accounts`. */
  readonly navigate: (path: string) => void;
  /** A label of the plugin in the language of the person. */
  readonly text: (label: MetaLabel | string) => string;
}
