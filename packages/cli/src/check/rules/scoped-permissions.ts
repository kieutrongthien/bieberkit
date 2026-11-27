/**
 * BieberKit
 *
 * @file        packages/cli/src/check/rules/scoped-permissions.ts
 * @description The check rule over the conditions of scoped permissions: an unknown entity or action, a condition that throws, and an operator or a path outside the language of the translator (AUTHZ-06, ADR 0013).
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

import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { checkScopedPermissions } from '@bieberkit/auth';
import type { ScopedPermission } from '@bieberkit/auth';
import { contributedRecord, entitiesOf, MODULES_DIR } from '@bieberkit/server';
import type { Rule, Violation } from '../rule.ts';
import { violation } from '../rule.ts';

export const scopedPermissionsRule: Rule = {
  name: 'scoped-permissions',
  summary:
    'The conditions of scoped permissions stay inside the language of the translator, and name an entity and an action that exist (AUTHZ-06).',
  run: async ({ app, root }) => {
    const { modules } = await app();
    const { entities } = entitiesOf(modules);
    const found: Violation[] = [];
    for (const module of modules) {
      {
        const scoped = contributedRecord<ScopedPermission>([module], 'scopedPermissions');
        const path = `${MODULES_DIR}/${module.name}/module.ts`;
        const file = existsSync(join(root, path)) ? path : module.name;
        for (const finding of checkScopedPermissions(scoped, entities)) {
          found.push(
            violation('scoped-permissions', `BK_AUTHZ_${finding.code}`, file, 1, finding.message, finding.fix),
          );
        }
      }
    }
    return found;
  },
};
