/**
 * BieberKit
 *
 * @file        packages/auth/src/check-conditions.ts
 * @description The build-time check of the conditions that a project declares (AUTHZ-06, ADR 0013): the rule of bieberkit check, as a function that the command will call.
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

import type { EntityDef } from '@bieberkit/data/schema';
import { explainCondition } from './ability.ts';
import type { ScopedPermission } from './ability.ts';
import { shapeOf } from './authorizer.ts';
import { isAction } from './registry.ts';

export interface ConditionFinding {
  /** The permission string of the scoped permission. */
  readonly permission: string;
  readonly code: 'SUBJECT_UNKNOWN' | 'ACTION_INVALID' | 'CONDITION_THROWS' | 'CONDITION_NOT_ALLOWED';
  readonly message: string;
  readonly fix: string;
}

/** Two users that differ in everything that a condition may read, so a condition that only works for one of them is found. */
const SAMPLE_USERS = [
  { id: '0190f6b2-7c4e-7000-8000-0000000000c1', tenantId: '0190f6b2-7c4e-7000-8000-0000000000a1' },
  { id: '0190f6b2-7c4e-7000-8000-0000000000c2' },
] as const;

/**
 * The rule of `bieberkit check` for conditions (AUTHZ-06): a scoped permission names an entity and an action that exist, and its
 * condition, for any user, is in the language of ADR 0013: properties of the entity, no path, no `$or`, `$and` or `$not`, and one
 * operator for each field. The condition is code, so it is run with two sample users. It answers a list of findings, empty when all is
 * well, so a project fails its build on a condition that would only fail closed at run time.
 */
export function checkScopedPermissions(
  scoped: Readonly<Record<string, ScopedPermission>>,
  entities: readonly EntityDef<string>[],
): ConditionFinding[] {
  const findings: ConditionFinding[] = [];
  for (const [permission, definition] of Object.entries(scoped)) {
    const entity = entities.find((candidate) => candidate.name === definition.subject);
    if (entity === undefined) {
      findings.push({
        permission,
        code: 'SUBJECT_UNKNOWN',
        message: `${permission} names the entity ${definition.subject}, which does not exist.`,
        fix: 'Give the name of an entity of the project, such as crm.Deal.',
      });
      continue;
    }
    if (!isAction(definition.action)) {
      findings.push({
        permission,
        code: 'ACTION_INVALID',
        message: `${permission} names the action ${String(definition.action)}, which does not exist.`,
        fix: 'Use read, create, update, delete or transition:<name>.',
      });
      continue;
    }
    const properties = shapeOf(entity).properties;
    for (const user of SAMPLE_USERS) {
      let condition: unknown;
      try {
        condition = definition.when(user);
      } catch (error) {
        findings.push({
          permission,
          code: 'CONDITION_THROWS',
          message: `The condition of ${permission} throws: ${error instanceof Error ? error.message : String(error)}`,
          fix: 'A condition is a function of the user that answers an object. It must not fail for a user with no tenant.',
        });
        break;
      }
      const why = explainCondition(condition, properties, { oneOperator: true });
      if (why !== undefined) {
        findings.push({
          permission,
          code: 'CONDITION_NOT_ALLOWED',
          message: `The condition of ${permission} on ${entity.name}: ${why}`,
          fix: 'Use one operator from $eq, $ne, $in, $nin, $gt, $gte, $lt, $lte for each property of the entity (ADR 0013).',
        });
        break;
      }
    }
  }
  return findings;
}
