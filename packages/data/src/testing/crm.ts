/**
 * BieberKit
 *
 * @file        packages/data/src/testing/crm.ts
 * @description Test support for the ORM suites: the crm entities compiled once, tenant ids, and helpers to run code as a tenant.
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

import type { EntityManager, EntitySchema } from '@mikro-orm/core';
import { uuid7 } from '../keys/uuid7.ts';
import { compileEntities } from '../orm/compile.ts';
import { runInUnitOfWork } from '../orm/connect.ts';
import type { Database } from '../orm/connect.ts';
import { runAsTenant } from '../orm/tenant.ts';
import { Contact, Customer, Page, User } from './sample-entities.ts';

/** The ORM schemas of a row, whose properties the tests read by name. */
export type Schema = EntitySchema<Record<string, unknown>>;

export interface CrmSchemas {
  readonly User: Schema;
  readonly Customer: Schema;
  readonly Contact: Schema;
  readonly all: readonly Schema[];
}

/** Compiles the three sample entities. Each call gives new schema objects, because a schema belongs to one database. */
export function crmSchemas(tenancy: 'single' | 'shared-schema' = 'shared-schema'): CrmSchemas {
  const all = compileEntities([User, Customer, Contact], { tenancy });
  const [user, customer, contact] = all;
  if (user === undefined || customer === undefined || contact === undefined)
    throw new Error('compileEntities must give one schema per entity.');
  return { User: user, Customer: customer, Contact: contact, all };
}

/** Two tenants that never change, so a test can name them. */
export const TENANT_A: string = uuid7();
export const TENANT_B: string = uuid7();

/** Runs `fn` in a unit of work of its own, with `tenantId` as the tenant of the request. */
export function inTenant<T>(db: Database, tenantId: string, fn: (em: EntityManager) => Promise<T>): Promise<T> {
  return runAsTenant(tenantId, () => runInUnitOfWork(db, fn));
}

/** Creates a user, which is a global entity, and returns its id. */
export async function seedUser(db: Database, schemas: CrmSchemas, name = 'Owner'): Promise<string> {
  return runInUnitOfWork(db, async (em) => {
    const user = em.create(schemas.User, { name });
    await em.flush();
    return String(user['id']);
  });
}

/** Creates a customer of `tenantId` owned by `ownerId`, and returns its id. */
export async function seedCustomer(
  db: Database,
  schemas: CrmSchemas,
  tenantId: string,
  ownerId: string,
  data: Record<string, unknown> = {},
): Promise<string> {
  return inTenant(db, tenantId, async (em) => {
    const customer = em.create(schemas.Customer, {
      code: `C-${uuid7().slice(-8)}`,
      name: 'Lê Văn',
      owner: em.getReference(schemas.User, ownerId),
      ...data,
    });
    await em.flush();
    return String(customer['id']);
  });
}

export interface CmsSchemas {
  readonly Page: Schema;
  readonly Translation: Schema;
  readonly all: readonly Schema[];
}

/** Compiles the page entity, which comes with its translation schema after it. */
export function cmsSchemas(tenancy: 'single' | 'shared-schema' = 'shared-schema'): CmsSchemas {
  const all = compileEntities([Page], { tenancy });
  const [page, translation] = all;
  if (page === undefined || translation === undefined)
    throw new Error('A localized entity must compile to two schemas.');
  return { Page: page, Translation: translation, all };
}
