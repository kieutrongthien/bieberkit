/**
 * BieberKit
 *
 * @file        plugins/settings/src/index.ts
 * @description The settings plugin: the table of stored values, the settings service that other plugins read with a type, the routes, and the settings of the site that it declares (SET-01 to SET-07, ADR 0030).
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

import { definePlugin } from '@bieberkit/core';
import type { PluginDef } from '@bieberkit/core';
import { declarations } from './declarations.ts';
import { Setting } from './entity.ts';
import { routes } from './routes.ts';
import { createSettingsService } from './service.ts';
import type { SettingsService } from './service.ts';

export { siteLocale, siteLogo, siteName } from './declarations.ts';
export { Setting } from './entity.ts';
export type {
  Change,
  ExportedSetting,
  ImportEntry,
  ImportReport,
  SettingsExport,
  SettingsPage,
  SettingsService,
  SettingView,
  Where,
} from './service.ts';

declare module '@bieberkit/core' {
  interface ServiceRegistry {
    /** Typed reads and audited writes of the declared settings (SET-05). */
    settings: SettingsService;
  }
}

import pkg from '../package.json' with { type: 'json' };

const plugin: PluginDef = definePlugin({
  name: '@bieberkit/plugin-settings',
  version: pkg.version,
  core: '*',
  dialects: ['postgres', 'mysql', 'sqlite'],
  permissions: ['settings.read', 'settings.manage'],
  entities: [Setting],
  routes,
  settings: declarations,
  services: {
    settings: {
      scope: 'singleton',
      deps: ['database', 'cache', 'settingDeclarations'],
      create: (services) =>
        createSettingsService({
          db: services.database,
          cache: services.cache,
          declarations: services.settingDeclarations,
        }),
    },
  },
});

export default plugin;
