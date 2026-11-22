/**
 * BieberKit
 *
 * @file        packages/data/src/orm/bulk.ts
 * @description Bulk writes that keep ids, tenant, timestamps, version and shadow columns right (DATA-21).
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
import { raw } from '@mikro-orm/core';
import { requestContext } from '@bieberkit/core';
import { uuid7 } from '../keys/uuid7.ts';
import type { OrmSchema } from './compile.ts';
import { shadowsOf, shadowValues } from './shadow.ts';
import { isSystemScope, requireTenant } from './tenant.ts';

type Row = Record<string, unknown>;

const CHUNK = 500;

/**
 * Inserts rows the way `em.create` would: an id, the tenant of the request, `createdAt`, `updatedAt`, `version` 1,
 * the user of the request, and the folded value of every compared field. Rows go in chunks of 500.
 */
export async function bulkInsert(em: EntityManager, schema: OrmSchema, rows: readonly Row[]): Promise<void> {
  const meta = em.getMetadata().get(schema);
  const shadows = shadowsOf(meta);
  const tenant = 'tenantId' in meta.properties ? requireTenant() : undefined;
  const user = requestContext.get()?.userId;
  const now = new Date();
  const prepared = rows.map((row) => ({
    id: uuid7(),
    version: 1,
    createdAt: now,
    updatedAt: now,
    ...(user === undefined ? {} : { createdBy: user, updatedBy: user }),
    ...row,
    ...(tenant === undefined || (isSystemScope() && row['tenantId'] !== undefined) ? {} : { tenantId: tenant }),
    ...shadowValues(shadows, row),
  }));
  for (let start = 0; start < prepared.length; start += CHUNK) {
    await em.insertMany(schema, prepared.slice(start, start + CHUNK));
  }
}

/**
 * Updates the rows that match `where`, inside the tenant of the request. It moves `updatedAt` and `version` and refreshes the
 * shadow column of every compared field in `data`. Returns the number of rows.
 */
export async function bulkUpdate(em: EntityManager, schema: OrmSchema, where: Row, data: Row): Promise<number> {
  const meta = em.getMetadata().get(schema);
  const user = requestContext.get()?.userId;
  return em.nativeUpdate(schema, where, {
    ...data,
    updatedAt: new Date(),
    version: raw('version + 1'),
    ...(user === undefined ? {} : { updatedBy: user }),
    ...shadowValues(shadowsOf(meta), data),
  });
}
