/**
 * BieberKit
 *
 * @file        packages/testing/src/factory.ts
 * @description Factories of entity rows: valid input made from the fields, and rows stored for a tenant, with the parents that a relation needs (TST-02).
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

import { entityOfSchema, runAsTenant, runInUnitOfWork, toApiRow, toOrmData } from '@bieberkit/data/orm';
import type { Database, OrmSchema } from '@bieberkit/data/orm';
import { apiFields } from '@bieberkit/data/schema';
import type { EntityDef } from '@bieberkit/data';
import { testingError } from './errors.ts';
import { sampleOf } from './sample.ts';

export type Overrides = Readonly<Record<string, unknown>>;

/** Makes rows of one entity. */
export interface Factory {
  /**
   * The body of a create request for the nth row, valid for the entity. A relation that is required is not in it, because its parent has
   * to be stored first: `create` does that. Each call gives different values, so unique fields do not collide.
   */
  build(overrides?: Overrides): Record<string, unknown>;
  /** Stores a row in the tenant of the app, behind every rule, with the parents that its relations need. It answers the row as the API shows it. */
  create(overrides?: Overrides): Promise<Record<string, unknown>>;
  createMany(count: number, overrides?: Overrides): Promise<Record<string, unknown>[]>;
}

/** What a factory needs of the app that owns it. */
export interface FactoryContext {
  readonly db: Database;
  readonly schemas: readonly OrmSchema[];
  /** The tenant that rows are stored for, read at each call so that `withTenant` can change it. */
  readonly tenant: () => string;
  /** The number of the next row of an entity in this app, shared by every view of it, so that unique values never repeat. */
  readonly next: (entity: string) => number;
  /** The factory of another entity, for the parent of a relation. */
  readonly factoryOf: (entity: EntityDef<string>) => Factory;
}

export function createFactory(entity: EntityDef<string>, context: FactoryContext): Factory {
  const fields = apiFields(entity);
  const schema = context.schemas.find((candidate) => entityOfSchema(candidate).name === entity.name);
  if (schema === undefined) {
    throw testingError(
      'TEST_ENTITY_UNKNOWN',
      `${entity.name} is not an entity of this app.`,
      'Add the entity to a module of createTestApp, or to its entities.',
    );
  }

  const build = (overrides: Overrides = {}): Record<string, unknown> => {
    const n = context.next(entity.name);
    const body: Record<string, unknown> = {};
    for (const field of fields) {
      // A value that the test gave is used as it is, and a field that no sample can fill is then no error.
      if (field.key in overrides) continue;
      const value = sampleOf(entity.name, field, n);
      if (value !== undefined) body[field.key] = value;
    }
    return { ...body, ...overrides };
  };

  const create = async (overrides: Overrides = {}): Promise<Record<string, unknown>> => {
    const body = build(overrides);
    // A required parent that the test did not name is made, in the same tenant.
    for (const field of fields) {
      const target = field.def.kind === 'belongsTo' ? field.def.target?.() : undefined;
      if (target === undefined || field.def.optional === true || body[field.key] !== undefined) continue;
      const parent = await context.factoryOf(target).create();
      body[field.key] = parent['id'];
    }
    const store = (): Promise<Record<string, unknown>> =>
      runInUnitOfWork(context.db, async (em) => {
        const created = em.create(schema, toOrmData(schema, body, 'create'));
        await em.flush();
        return toApiRow(schema, created);
      });
    return entity.tenant ? runAsTenant(context.tenant(), store) : store();
  };

  return {
    build,
    create,
    createMany: async (count, overrides) => {
      const rows: Record<string, unknown>[] = [];
      for (let i = 0; i < count; i += 1) rows.push(await create(overrides));
      return rows;
    },
  };
}
