/**
 * BieberKit
 *
 * @file        packages/auth/src/registry.ts
 * @description The registry of permissions: how the permission strings of the entities map to a subject and an action (AUTHZ-01, AUTHZ-03, MOD-06).
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

import { entityEventName } from '@bieberkit/data/orm';
import type { EntityDef } from '@bieberkit/data';
import { authzError } from './errors.ts';

/** What a caller does with an entity. A transition is its own action, so `update` does not give it. */
export type Action = 'read' | 'create' | 'update' | 'delete' | `transition:${string}`;

export interface PermissionEntry {
  readonly permission: string;
  /** The name of the entity, such as `crm.Deal`. */
  readonly subject: string;
  readonly action: Action;
  /** Set for a permission that belongs to one masked field. */
  readonly field?: string;
  readonly fieldAccess?: 'read' | 'update';
}

export interface MaskedField {
  readonly read?: string;
  readonly update?: string;
}

export interface PermissionRegistry {
  /** Every permission that the entities declare, with the names of the defaults, in a fixed order. */
  readonly entries: readonly PermissionEntry[];
  /** The entries that a permission string stands for. A string that no entity declares has none. */
  entriesOf(permission: string): readonly PermissionEntry[];
  /** Whether some entity declares the string. A string that none does is a plain capability such as `system.api-docs`. */
  declares(permission: string): boolean;
  /** The permission that a transition needs: its own, or the `update` of the entity. */
  transitionPermission(entity: string, transition: string): string | undefined;
  /** The fields of an entity that have a mask, with the permissions that lift it. */
  maskedFields(entity: string): ReadonlyMap<string, MaskedField>;
}

const ACTIONS = ['read', 'create', 'update', 'delete'] as const;

/** Whether a text names an action: the four of an entity, or `transition:<name>`. */
export function isAction(value: string): value is Action {
  return (ACTIONS as readonly string[]).includes(value) || /^transition:.+/.test(value);
}

/**
 * Lists the permissions that the entities declare (AUTHZ-01). A string is opaque: it can be anything, and only this registry
 * knows which entity and action it stands for. The names that an entity leaves out are the defaults, the same ones that the
 * HTTP routes ask for.
 */
export function buildPermissionRegistry(entities: readonly EntityDef<string>[]): PermissionRegistry {
  const names = new Set<string>();
  for (const entity of entities) {
    if (names.has(entity.name)) {
      throw authzError(
        'AUTHZ_PERMISSION_CONFLICT',
        500,
        `The entity ${entity.name} is listed twice.`,
        'List each entity once.',
      );
    }
    names.add(entity.name);
  }
  const entries: PermissionEntry[] = [];
  const transitions = new Map<string, string>();
  const masks = new Map<string, Map<string, MaskedField>>();
  for (const entity of [...entities].toSorted((a, b) => a.name.localeCompare(b.name))) {
    const own = (action: (typeof ACTIONS)[number]): string =>
      entity.permissions[action] ?? entityEventName(entity.name, action);
    for (const action of ACTIONS) entries.push({ permission: own(action), subject: entity.name, action });
    const machine = Object.values(entity.fields).find(
      (field) => field.kind === 'state' && field.transitions !== undefined,
    );
    for (const [name, declared] of Object.entries(machine?.transitions ?? {})) {
      transitions.set(`${entity.name}\u0000${name}`, declared.permission ?? own('update'));
      if (declared.permission !== undefined) {
        entries.push({ permission: declared.permission, subject: entity.name, action: `transition:${name}` });
      }
    }
    const masked = new Map<string, MaskedField>();
    for (const [field, permission] of Object.entries(entity.permissions.fields ?? {})) {
      masked.set(field, {
        ...(permission.read === undefined ? {} : { read: permission.read }),
        ...(permission.update === undefined ? {} : { update: permission.update }),
      });
      if (permission.read !== undefined) {
        entries.push({ permission: permission.read, subject: entity.name, action: 'read', field, fieldAccess: 'read' });
      }
      if (permission.update !== undefined) {
        entries.push({
          permission: permission.update,
          subject: entity.name,
          action: 'update',
          field,
          fieldAccess: 'update',
        });
      }
    }
    masks.set(entity.name, masked);
  }
  const byPermission = new Map<string, PermissionEntry[]>();
  for (const entry of entries) {
    const list = byPermission.get(entry.permission) ?? [];
    list.push(entry);
    byPermission.set(entry.permission, list);
  }
  return {
    entries,
    entriesOf: (permission) => byPermission.get(permission) ?? [],
    declares: (permission) => byPermission.has(permission),
    transitionPermission: (entity, transition) => transitions.get(`${entity}\u0000${transition}`),
    maskedFields: (entity) => masks.get(entity) ?? new Map(),
  };
}
