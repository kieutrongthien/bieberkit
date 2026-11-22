/**
 * BieberKit
 *
 * @file        packages/data/src/orm/entity-manager.ts
 * @description The EntityManager of BieberKit: a tenant filter that cannot be switched off, version errors as 412, and the guard for native writes (DATA-09, DATA-21, API-13).
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

import { EntitySchema, OptimisticLockError } from '@mikro-orm/core';
import type {
  EntityData,
  EntityName,
  FilterOptions,
  FilterQuery,
  FindOneOptions,
  FindOptions,
  NativeInsertUpdateOptions,
  Primary,
  RequiredEntityData,
  UpdateOptions,
} from '@mikro-orm/core';
import { SqlEntityManager } from '@mikro-orm/sql';
import { dataError } from '../errors.ts';
import { assertShadowsWritten } from './shadow.ts';
import { isSystemScope } from './tenant.ts';
import { staleVersion } from './version.ts';

type FilterType = 'read' | 'update' | 'delete';

/** True for a name, a class or a schema, and false for an entity instance, which carries its own data. */
function isEntityName<Entity extends object>(value: EntityName<Entity> | Entity): value is EntityName<Entity> {
  return typeof value === 'string' || typeof value === 'function' || value instanceof EntitySchema;
}

/** Whether the caller asked for the tenant filter to be off: `filters: false`, or `filters: { tenant: false }`. */
function disablesTenant(options: FilterOptions | undefined): boolean {
  if (options === false) return true;
  return typeof options === 'object' && !Array.isArray(options) && options['tenant'] === false;
}

/**
 * The EntityManager that every `Database` uses. It adds three rules to MikroORM, and keeps the rest:
 * the tenant filter cannot be disabled outside `asSystem` (DATA-09), a stale flush is `DATA_VERSION_STALE` (API-13), and a native
 * write of a compared field must also write its shadow column (DATA-21).
 */
export class BieberEntityManager extends SqlEntityManager {
  override async applyFilters<Entity extends object>(
    entityName: EntityName<Entity>,
    where: FilterQuery<Entity> | undefined,
    options: FilterOptions | undefined,
    type: FilterType,
    findOptions?: FindOptions<Entity> | FindOneOptions<Entity>,
  ): Promise<FilterQuery<Entity> | undefined> {
    const meta = this.getMetadata().find(entityName);
    if (meta?.filters['tenant'] !== undefined && disablesTenant(options) && !isSystemScope()) {
      throw dataError(
        'DATA_TENANT_FILTER_DISABLED',
        500,
        `The tenant filter of ${meta.className} cannot be switched off here.`,
        'Reading across tenants goes through db.asSystem(reason, fn), which is audited.',
      );
    }
    return super.applyFilters(entityName, where, options, type, findOptions);
  }

  override async flush(): Promise<void> {
    try {
      await super.flush();
    } catch (error) {
      if (error instanceof OptimisticLockError) throw staleVersion(error);
      throw error;
    }
  }

  override async nativeUpdate<Entity extends object>(
    entityName: EntityName<Entity>,
    where: FilterQuery<NoInfer<Entity>>,
    data: EntityData<Entity>,
    options?: UpdateOptions<Entity>,
  ): Promise<number> {
    assertShadowsWritten(this.getMetadata().get(entityName), data);
    return super.nativeUpdate(entityName, where, data, options);
  }

  override async insert<Entity extends object>(
    entityNameOrEntity: EntityName<Entity> | Entity,
    data?: NoInfer<RequiredEntityData<Entity> | Entity>,
    options?: NativeInsertUpdateOptions<Entity>,
  ): Promise<Primary<Entity>> {
    if (data !== undefined && isEntityName(entityNameOrEntity))
      assertShadowsWritten(this.getMetadata().get(entityNameOrEntity), data);
    return super.insert(entityNameOrEntity, data, options);
  }

  override async insertMany<Entity extends object>(
    entityNameOrEntities: EntityName<Entity> | Entity[],
    data?: NoInfer<RequiredEntityData<Entity>[] | Entity[]>,
    options?: NativeInsertUpdateOptions<Entity>,
  ): Promise<Primary<Entity>[]> {
    if (data !== undefined && !Array.isArray(entityNameOrEntities)) {
      for (const row of data) assertShadowsWritten(this.getMetadata().get(entityNameOrEntities), row);
    }
    return super.insertMany(entityNameOrEntities, data, options);
  }
}
