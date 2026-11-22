/**
 * BieberKit
 *
 * @file        packages/data/src/orm/references.ts
 * @description The check that every id a row refers to is visible to the tenant and the user before the row is written (DATA-20).
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

import type { EntityManager, EntityMetadata } from '@mikro-orm/core';
import { ReferenceKind } from '@mikro-orm/core';
import { entityMeta } from './internals.ts';
import { dataError } from '../errors.ts';

/** The CASL read rule of `@bieberkit/auth`, plugged in later: which of these ids may the current user read? */
export interface ReferenceVisibility {
  visible(entity: string, ids: readonly string[]): Promise<readonly string[]>;
}

/** The relations that a flush sets, as entity name to ids. Rows created in the same flush are not counted: they have no row yet. */
export function referencedIds(
  entities: readonly { entity: Record<string, unknown>; created: boolean; changed?: readonly string[] }[],
): Map<EntityMetadata, Set<string>> {
  const found = new Map<EntityMetadata, Set<string>>();
  const creating = new Set(entities.filter((item) => item.created).map((item) => String(item.entity['id'])));
  for (const { entity, created, changed } of entities) {
    for (const property of Object.values(entityMeta(entity).properties)) {
      if (property.kind !== ReferenceKind.MANY_TO_ONE || (!created && !changed?.includes(property.name))) continue;
      const target = entity[property.name];
      if (typeof target !== 'object' || target === null) continue;
      const id = Reflect.get(target, 'id');
      if (typeof id !== 'string' || creating.has(id)) continue;
      const targetMeta = property.targetMeta;
      if (targetMeta === undefined) continue;
      found.set(targetMeta, (found.get(targetMeta) ?? new Set()).add(id));
    }
  }
  return found;
}

function notVisible(entity: string): never {
  throw dataError(
    'DATA_REFERENCE_NOT_VISIBLE',
    422,
    `A referenced ${entity} is not available.`,
    'Refer to a record that exists, that is not deleted, and that the user may read.',
  );
}

/**
 * Looks the ids up under the filters of a fork, so the tenant filter and the soft delete filter apply. An id that
 * is missing from the result is refused, with one message for "does not exist" and "belongs to someone else".
 */
export async function assertReferencesVisible(
  em: EntityManager,
  wanted: ReadonlyMap<EntityMetadata, ReadonlySet<string>>,
  port?: ReferenceVisibility,
): Promise<void> {
  for (const [meta, ids] of wanted) {
    const entity = meta.className;
    const list = [...ids];
    const fork = em.fork();
    const rows = await fork.find(meta.class, { id: { $in: list } }, { fields: ['id'] });
    const found = new Set(rows.map((row) => String(Reflect.get(row, 'id'))));
    if (list.some((id) => !found.has(id))) notVisible(entity);
    if (port !== undefined) {
      const allowed = new Set(await port.visible(entity, list));
      if (list.some((id) => !allowed.has(id))) notVisible(entity);
    }
  }
}
