/**
 * BieberKit
 *
 * @file        packages/data/src/orm/softdelete.ts
 * @description softDelete and restore: the delete columns of an entity with soft delete (DATA-16).
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

import type { EntityManager } from '@mikro-orm/core';
import { entityMeta } from './internals.ts';
import { dataError } from '../errors.ts';

function assertSoftDelete(row: Record<string, unknown>): void {
  const properties = entityMeta(row).properties;
  if (!('deletedAt' in properties) || !('deletedToken' in properties)) {
    throw dataError(
      'DATA_ENTITY_INVALID',
      500,
      `${entityMeta(row).className} does not have soft delete.`,
      'Declare softDelete: true on the entity, or remove the row with em.remove().',
    );
  }
}

/**
 * Marks a row as deleted. `deletedToken` becomes the id of the row, so the unique constraints, which end with it,
 * stop counting the row and its codes are free again (DATA-16). The change is written by the next flush.
 */
export function softDelete(em: EntityManager, row: Record<string, unknown>): void {
  assertSoftDelete(row);
  row['deletedAt'] = new Date();
  row['deletedToken'] = String(row['id']);
  em.persist(row);
}

/** Brings a deleted row back. If a live row now holds one of its codes, the flush fails on the unique constraint. */
export function restore(em: EntityManager, row: Record<string, unknown>): void {
  assertSoftDelete(row);
  row['deletedAt'] = null;
  row['deletedToken'] = '';
  em.persist(row);
}
