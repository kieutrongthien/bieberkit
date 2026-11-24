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
import type { EnvDescription, Manifest } from '@bieberkit/core';

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
  /** What `.env.example` says of the env keys of the plugin: their type, their default and their description (CFG-06). */
  readonly envRows?: readonly EnvDescription[];
}

export type PluginIndex = Readonly<Record<string, PluginIndexEntry>>;

/**
 * The templates that ship. `blank` lists the base plugins (users, roles, settings, audit-log, notifications, media). `auth-ui` joins them
 * with the admin. The other three need plugins that Phase 2 builds, so they are not offered
 * until their plugins exist.
 */
export const BUILTIN_TEMPLATES: Readonly<Record<string, Template>> = {
  blank: {
    name: 'blank',
    description: 'The shared base of every management app.',
    plugins: [
      '@bieberkit/plugin-users',
      '@bieberkit/plugin-roles',
      '@bieberkit/plugin-settings',
      '@bieberkit/plugin-audit-log',
      '@bieberkit/plugin-notifications',
      '@bieberkit/plugin-media',
    ],
    seeds: 'the administrator account (USERS_ADMIN_EMAIL and USERS_ADMIN_PASSWORD) and the base roles admin and staff',
  },
};

/**
 * The bundled index of the first-party plugins. `tools/templates.test.ts` compares each entry with the manifest that the plugin itself
 * gives, so a change of a plugin that is not copied here fails the tests (PLG-07).
 */
export const BUILTIN_PLUGIN_INDEX: PluginIndex = {
  '@bieberkit/plugin-audit-log': {
    version: '0.1.0',
    manifest: {
      core: '*',
      dialects: ['mysql', 'postgres', 'sqlite'],
      requires: {},
      conflicts: [],
      env: [],
      tables: [],
      routes: ['GET /api/v1/audit-log/entries'],
      permissions: ['audit-log.read'],
      admin: [],
    },
  },
  '@bieberkit/plugin-media': {
    version: '0.1.0',
    manifest: {
      core: '*',
      dialects: ['mysql', 'postgres', 'sqlite'],
      requires: {},
      conflicts: [],
      env: [],
      tables: ['bk_media'],
      routes: ['POST /api/v1/media/media/:id/confirm', 'POST /api/v1/media/media/:id/upload-url'],
      permissions: ['media.manage', 'media.read', 'media.upload'],
      admin: [],
    },
  },
  '@bieberkit/plugin-notifications': {
    version: '0.1.0',
    manifest: {
      core: '*',
      dialects: ['mysql', 'postgres', 'sqlite'],
      requires: {},
      conflicts: [],
      env: [],
      tables: ['bk_notifications'],
      routes: [],
      permissions: ['notifications.manage', 'notifications.read', 'notifications.update'],
      admin: [],
    },
  },
  '@bieberkit/plugin-roles': {
    version: '0.1.0',
    manifest: {
      core: '*',
      dialects: ['mysql', 'postgres', 'sqlite'],
      requires: {},
      conflicts: [],
      env: [],
      tables: [],
      routes: [
        'DELETE /api/v1/roles/roles/:id',
        'GET /api/v1/roles/permissions',
        'GET /api/v1/roles/roles',
        'PATCH /api/v1/roles/roles/:id',
        'POST /api/v1/roles/roles',
        'POST /api/v1/roles/roles/:id/assign',
        'POST /api/v1/roles/roles/:id/revoke',
      ],
      permissions: ['roles.manage', 'roles.read'],
      admin: [],
    },
  },
  '@bieberkit/plugin-settings': {
    version: '0.1.0',
    manifest: {
      core: '*',
      dialects: ['mysql', 'postgres', 'sqlite'],
      requires: {},
      conflicts: [],
      env: [],
      tables: ['bk_settings'],
      routes: [],
      permissions: ['settings.manage', 'settings.read'],
      admin: [],
    },
  },
  '@bieberkit/plugin-users': {
    version: '0.1.0',
    envRows: [
      {
        key: 'USERS_ADMIN_EMAIL',
        type: 'string',
        required: false,
        default: 'admin@example.com',
        secret: false,
        description: 'Email of the administrator that the seed makes',
      },
      {
        key: 'USERS_ADMIN_PASSWORD',
        type: 'string',
        required: false,
        secret: true,
        description: 'Password of the administrator that the seed makes. Without it the seed makes no account',
      },
    ],
    manifest: {
      core: '*',
      dialects: ['mysql', 'postgres', 'sqlite'],
      requires: {
        '@bieberkit/plugin-roles': '*',
      },
      conflicts: [],
      env: ['USERS_ADMIN_EMAIL', 'USERS_ADMIN_PASSWORD'],
      tables: [],
      routes: ['GET /api/v1/users/users', 'POST /api/v1/users/users'],
      permissions: ['users.manage', 'users.read'],
      admin: [],
    },
  },
};

export const DIALECT_NAMES: readonly Dialect[] = ['postgres', 'mysql', 'sqlite'];
