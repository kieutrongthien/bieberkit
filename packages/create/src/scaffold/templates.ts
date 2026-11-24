/**
 * BieberKit
 *
 * @file        packages/create/src/scaffold/templates.ts
 * @description What a starter template is, the templates that ship in create-bieberkit, and the index of first-party plugins that the scaffolder resolves against before anything is installed (section 12, PLG-07).
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

import type { Dialect } from '@bieberkit/core';
import type { Manifest } from '@bieberkit/core';

/** A template is data: the plugins to install, the defaults of the config, and what is seeded (section 12). */
export interface Template {
  readonly name: string;
  readonly description: string;
  /** Plugins on top of nothing: the template lists all of them, `blank` included. */
  readonly plugins: readonly string[];
  /** Includes the server-rendered public site unless the person says `--no-site`. */
  readonly site?: boolean;
  readonly tenancy?: 'single' | 'shared-schema';
  readonly locales?: { readonly default: string; readonly supported: readonly string[] };
  /** Said when the project is made, for what the template seeds. */
  readonly seeds?: string;
}

/**
 * The first-party plugins as the scaffolder knows them: their version and their static manifest (PLG-07), bundled at build so that
 * the graph can be resolved before a single package is installed.
 */
export interface PluginIndexEntry {
  readonly version: string;
  readonly manifest: Manifest;
}

export type PluginIndex = Readonly<Record<string, PluginIndexEntry>>;

/**
 * The templates that ship. `blank` has no plugins yet: the base plugins (users, roles, auth-ui, settings, audit-log, notifications,
 * media) are built in M1.8, and a template then lists them. The other three need plugins that Phase 2 builds, so they are not offered
 * until their plugins exist.
 */
export const BUILTIN_TEMPLATES: Readonly<Record<string, Template>> = {
  blank: {
    name: 'blank',
    description: 'The shared base of every management app.',
    plugins: [],
    seeds: 'the administrator account and the base roles (with the base plugins)',
  },
};

/** The bundled index. Empty until the first-party plugins are published. */
export const BUILTIN_PLUGIN_INDEX: PluginIndex = {};

export const DIALECT_NAMES: readonly Dialect[] = ['postgres', 'mysql', 'sqlite'];
