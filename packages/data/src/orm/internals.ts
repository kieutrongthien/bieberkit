/**
 * BieberKit
 *
 * @file        packages/data/src/orm/internals.ts
 * @description The two internals of MikroORM that the data layer reads: the metadata of an entity and whether it is new.
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

import { helper } from '@mikro-orm/core';
import type { EntityManager, EntityMetadata } from '@mikro-orm/core';
import { SqlEntityManager } from '@mikro-orm/sql';
import type { Kysely } from 'kysely';
import { dataError } from '../errors.ts';
import type { StepDatabase } from '../migrations/steps.ts';

/** The metadata MikroORM keeps for the class of `entity`. Its name starts with underscores, so it is read here and nowhere else. */
export function entityMeta(entity: object): EntityMetadata {
  // oxlint-disable-next-line no-underscore-dangle
  return helper(entity).__meta;
}

/** True for a row that was never loaded from or written to the database. */
export function isNewRow(entity: object): boolean {
  // oxlint-disable-next-line no-underscore-dangle
  return helper(entity).__originalEntityData === undefined;
}

/**
 * The Kysely of an EntityManager, for the schema work of migrations. It reaches tables that no entity describes. MySQL opens its
 * pool on the first query, so one is sent here, and the caller gets a Kysely that is ready.
 */
export async function kyselyOf(em: EntityManager): Promise<Kysely<StepDatabase>> {
  if (!(em instanceof SqlEntityManager)) {
    throw dataError(
      'DATA_DRIVER_UNSUPPORTED',
      500,
      'This database has no SQL query builder.',
      'Use PostgreSQL, MySQL or SQLite.',
    );
  }
  await em.getConnection().execute('select 1');
  return em.getKysely<StepDatabase>();
}
