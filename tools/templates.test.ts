/**
 * BieberKit
 *
 * @file        tools/templates.test.ts
 * @description Tests that the plugin index bundled in create-bieberkit is the manifest of each first-party plugin, that the blank template lists them, and that the graph resolves (PLG-07, spec section 12).
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

import { describeEnv, resolvePlugins, toManifest } from '../packages/core/src/index.ts';
import { BUILTIN_PLUGIN_INDEX, BUILTIN_TEMPLATES } from '../packages/create/src/index.ts';
import { COLLECTORS } from '../packages/server/src/index.ts';
import audit from '../plugins/audit-log/src/index.ts';
import media from '../plugins/media/src/index.ts';
import notifications from '../plugins/notifications/src/index.ts';
import roles from '../plugins/roles/src/index.ts';
import settings from '../plugins/settings/src/index.ts';
import users from '../plugins/users/src/index.ts';
import { expect, it } from 'vitest';

const PLUGINS = [audit, media, notifications, roles, settings, users];

it('PLG-07 each plugin of the index has the version and the manifest that the plugin gives itself', () => {
  for (const plugin of PLUGINS) {
    const entry = BUILTIN_PLUGIN_INDEX[plugin.name];
    expect(entry, `${plugin.name} is missing from the index`).toBeDefined();
    expect({ version: entry?.version, manifest: entry?.manifest }).toEqual({
      version: plugin.version,
      manifest: toManifest(plugin, COLLECTORS),
    });
  }
  for (const plugin of PLUGINS) {
    const rows = describeEnv(plugin.envSchema);
    const bundled = BUILTIN_PLUGIN_INDEX[plugin.name]?.envRows;
    // A plugin with env keys must say how `.env.example` describes them, or the example would differ from `bieberkit env:example`.
    expect(bundled ?? [], `${plugin.name} env rows`).toEqual(rows);
  }
  expect(Object.keys(BUILTIN_PLUGIN_INDEX).toSorted()).toEqual(PLUGINS.map((plugin) => plugin.name).toSorted());
});

it('12 the blank template lists the base plugins, and the graph resolves on every dialect', () => {
  expect([...(BUILTIN_TEMPLATES['blank']?.plugins ?? [])].toSorted()).toEqual(
    PLUGINS.map((plugin) => plugin.name).toSorted(),
  );
  for (const dialect of ['postgres', 'mysql', 'sqlite'] as const) {
    const { order } = resolvePlugins(
      PLUGINS.map((plugin) => ({
        name: plugin.name,
        version: plugin.version,
        manifest: toManifest(plugin, COLLECTORS),
      })),
      { core: '0.0.0', dialect },
    );
    // `users` requires `roles`, so the roles seed makes the administrator role before the users seed gives it.
    expect(order.indexOf('@bieberkit/plugin-roles')).toBeLessThan(order.indexOf('@bieberkit/plugin-users'));
  }
});
