/**
 * BieberKit
 *
 * @file        plugins/roles/src/services/grant-all.ts
 * @description Gives a system role every permission of a list, which the seed does for the administrator.
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

import { recordAudit, runInTransaction } from '@bieberkit/data/orm';
import type { Database } from '@bieberkit/data/orm';
import { AuthRolePermission } from '@bieberkit/auth';

/** Adds the permissions that the system role lacks. A seeder may do what the service refuses to do for a person: the role grows with the project. */
export async function grantAll(database: Database, roleId: string, list: readonly string[]): Promise<void> {
  await runInTransaction(database, async (em) => {
    const current = new Set((await em.find(AuthRolePermission, { roleId })).map((row) => row.permission));
    const added = list.filter((permission) => !current.has(permission));
    if (added.length === 0) return;
    for (const permission of added) em.create(AuthRolePermission, { roleId, permission });
    recordAudit(em, {
      action: 'auth.role.updated',
      entity: 'authRole',
      recordId: roleId,
      data: { added, removed: [] },
    });
    await em.flush();
  });
}
