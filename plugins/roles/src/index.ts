/**
 * BieberKit
 *
 * @file        plugins/roles/src/index.ts
 * @description The roles plugin: manages roles and their permissions through the API, and seeds the base roles, an administrator with every permission and a staff role that reads (AUTHZ-01, spec section 12).
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
import { runInUnitOfWork } from '@bieberkit/data/orm';
import { AuthRole, NIL_TENANT, createRole } from '@bieberkit/auth';
import pkg from '../package.json' with { type: 'json' };
import { routes } from './routes/index.ts';
import { grantAll } from './services/grant-all.ts';
export { routes } from './routes/index.ts';

/** The administrator role: a system role that nobody renames, deletes or changes, with every permission of the project. */
export const ADMIN_ROLE = 'admin';

/** The staff role: read access to everything that the project lets a person read. */
export const STAFF_ROLE = 'staff';

const plugin: PluginDef = definePlugin({
  name: '@bieberkit/plugin-roles',
  version: pkg.version,
  core: '*',
  dialects: ['postgres', 'mysql', 'sqlite'],
  permissions: ['roles.read', 'roles.manage'],
  routes,
  /** Makes the base roles when they are missing, and gives the administrator any permission that a plugin added since (idempotent). */
  async seed(services) {
    const { database, permissions } = services;
    const wanted: Record<string, { all: boolean; list: string[]; system: boolean }> = {
      [ADMIN_ROLE]: { all: true, list: [...permissions], system: true },
      [STAFF_ROLE]: { all: false, list: permissions.filter((name) => name.endsWith('.read')), system: false },
    };
    for (const [name, role] of Object.entries(wanted)) {
      const existing = await runInUnitOfWork(database, (em) => em.findOne(AuthRole, { tenant: NIL_TENANT, name }));
      if (existing === null) {
        await createRole(database, { name, permissions: role.list, system: role.system });
      } else if (role.all) {
        // A system role cannot be given other permissions through the service. The administrator is the one that grows with the project.
        await grantAll(database, existing.id, role.list);
      }
    }
  },
});

export default plugin;
