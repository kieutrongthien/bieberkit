/**
 * BieberKit
 *
 * @file        packages/data/src/orm/children.ts
 * @description The rows of an inline collection: the children of one row, read in the order that they were made, as managed entities for a write and as plain rows for an answer (MOD-09).
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
import { wrap } from '@mikro-orm/core';
import type { OrmSchema } from './compile.ts';

type Row = Record<string, unknown>;

/** The most rows that an inline collection holds: a form that edits more is not a form (MOD-09). */
export const MAX_INLINE_ROWS = 200;

/**
 * The children of the row `parentId`, those that `back` (the relation of the child to its parent) points at it, oldest first. They are
 * managed by the unit of work, so that a write can change or remove them. One more than the limit is read, so that a caller can tell that
 * there are too many.
 */
export function childEntities(
  em: EntityManager,
  schema: OrmSchema,
  back: string,
  parentId: string,
  limit: number = MAX_INLINE_ROWS,
): Promise<Row[]> {
  return em.find<Row>(
    schema,
    { [back]: { id: parentId } },
    { orderBy: { createdAt: 'asc', id: 'asc' }, limit: limit + 1 },
  );
}

/** The same children as plain rows, for an answer. */
export async function childRows(
  em: EntityManager,
  schema: OrmSchema,
  back: string,
  parentId: string,
  limit: number = MAX_INLINE_ROWS,
): Promise<Row[]> {
  const found = await childEntities(em, schema, back, parentId, limit);
  return found.slice(0, limit).map((entity): Row => wrap(entity).toObject());
}
