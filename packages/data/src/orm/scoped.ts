/**
 * BieberKit
 *
 * @file        packages/data/src/orm/scoped.ts
 * @description Finds one row inside the scope that code gives a read: a row outside it is as good as missing (AUTHZ-02, ADR 0013).
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
import { isUuid } from '../keys/uuid7.ts';
import type { OrmSchema } from './compile.ts';
import { knownFields, translateScope } from './query.ts';

type Row = Record<string, unknown>;

/**
 * The row with this id that the scope allows, or `null`. The tenant filter and the soft delete apply as in every read. A row
 * outside the scope, a row of another tenant, a deleted row and an id that is not a UUID all give `null`, so the caller cannot
 * tell them apart and the existence of a row never leaks. The row is tracked, so a write can go on with it.
 */
export async function findScoped(
  em: EntityManager,
  schema: OrmSchema,
  id: string,
  scope: Row | undefined,
): Promise<Row | null> {
  const where = scope === undefined ? undefined : translateScope(schema, knownFields(schema), scope);
  if (!isUuid(id)) return null;
  const condition = where === undefined || Object.keys(where).length === 0 ? { id } : { $and: [{ id }, where] };
  return em.findOne<Row>(schema, condition);
}

/** The rows with these ids that the scope allows, tracked. An id that is outside the scope, missing or deleted is not in the list. */
export async function findAllScoped(
  em: EntityManager,
  schema: OrmSchema,
  ids: readonly string[],
  scope: Row | undefined,
): Promise<Row[]> {
  const where = scope === undefined ? undefined : translateScope(schema, knownFields(schema), scope);
  const valid = ids.filter((id) => isUuid(id));
  if (valid.length === 0) return [];
  const condition =
    where === undefined || Object.keys(where).length === 0
      ? { id: { $in: valid } }
      : { $and: [{ id: { $in: valid } }, where] };
  return em.find<Row>(schema, condition);
}
