/**
 * BieberKit
 *
 * @file        packages/data/src/orm/request-kysely.ts
 * @description A Kysely that follows the request: every call goes to the EntityManager of the unit of work that is running, so a library such as Better Auth joins its transaction (AUTH-09, ADR 0012).
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

import { SqlEntityManager } from '@mikro-orm/sql';
import type { Kysely } from 'kysely';
import { dataError } from '../errors.ts';
import type { StepDatabase } from '../migrations/steps.ts';
import { currentEntityManager } from './connect.ts';
import type { Database } from './connect.ts';

/** A Kysely over the tables by their entity names. Its type says nothing about the columns, because a library brings its own. */
export type RequestKysely = Kysely<StepDatabase>;

/** The names that Better Auth uses are the names of the entities and of their properties, and MikroORM maps them to tables and columns. */
const OPTIONS = {
  tableNamingStrategy: 'entity',
  columnNamingStrategy: 'property',
  convertValues: true,
  processOnCreateHooks: true,
  processOnUpdateHooks: true,
} as const;

function kyselyNow(db: Database): RequestKysely {
  const em = currentEntityManager() ?? db.fork();
  if (!(em instanceof SqlEntityManager)) {
    throw dataError(
      'DATA_DRIVER_UNSUPPORTED',
      500,
      'This database has no SQL query builder.',
      'Use PostgreSQL, MySQL or SQLite.',
    );
  }
  return em.getKysely<StepDatabase, typeof OPTIONS>(OPTIONS);
}

/**
 * One Kysely for the whole process that always acts for the request that is running (ADR 0012). Each use asks for the Kysely of the
 * current EntityManager, which is a fork of the root one outside a request, and the one of the transaction inside `runInTransaction`.
 * Kysely refuses `transaction()` and `connection()` on a transaction, so inside one a library's own transaction or connection joins
 * the outer one instead.
 */
export function requestKysely(db: Database): RequestKysely {
  // The proxy has no target of its own: every property comes from the Kysely of the moment.
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion
  return new Proxy({} as RequestKysely, {
    get(_target, property) {
      const kysely = kyselyNow(db);
      if (property === 'transaction') {
        return () => {
          if (!kysely.isTransaction) return kysely.transaction();
          const joined = {
            execute: async <T>(run: (trx: RequestKysely) => Promise<T>): Promise<T> => run(kysely),
            setIsolationLevel: () => joined,
            setAccessMode: () => joined,
          };
          return joined;
        };
      }
      if (property === 'connection') {
        // The same for `connection()`: inside a transaction there is one connection already, and it is this one.
        return () =>
          kysely.isTransaction
            ? { execute: async <T>(run: (db: RequestKysely) => Promise<T>): Promise<T> => run(kysely) }
            : kysely.connection();
      }
      const value: unknown = Reflect.get(kysely, property);
      return typeof value === 'function' ? value.bind(kysely) : value;
    },
  });
}
