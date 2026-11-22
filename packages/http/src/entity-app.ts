/**
 * BieberKit
 *
 * @file        packages/http/src/entity-app.ts
 * @description A server over an in-memory database with sample entities, for the tests of the entity routes (M1.3).
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

import * as z from 'zod/mini';
import { createDatabase, compileEntities } from '@bieberkit/data/orm';
import type { Database } from '@bieberkit/data/orm';
import type { OrmSchema } from '@bieberkit/data/orm';
import { defineEntity, f } from '@bieberkit/data';
import type { EntityDef } from '@bieberkit/data';
import { registerEntityRoutes } from './entity-routes.ts';
import type { HttpServerOptions } from './server.ts';
import { testServer, TENANT } from './testing.ts';
import type { MemoryLogger } from './testing.ts';
import type { HttpServer } from './server.ts';
import type { Principal } from './ports.ts';

export const Person: EntityDef<'crm.Person'> = defineEntity({
  name: 'crm.Person',
  table: 'crm_people',
  api: { list: true, get: true, create: true },
  fields: { id: f.id(), name: f.string({ min: 1, max: 50 }) },
});

export const Account: EntityDef<'crm.Account'> = defineEntity({
  name: 'crm.Account',
  table: 'crm_accounts',
  tenant: true,
  softDelete: true,
  fields: {
    id: f.id(),
    code: f.string({ max: 20 }).unique(),
    name: f.string({ min: 1, max: 100, compare: 'ci_ai' }).index(),
    email: f.email().optional().unique(),
    tier: f.oneOf(['basic', 'gold', 'vip']).default('basic').index(),
    visits: f.int({ min: 0 }).default(0).index(),
    active: f.boolean().default(true),
    balance: f.money({ currency: 'VND' }).optional(),
    note: f.text({ max: 500 }).optional(),
    since: f.date().optional(),
    number: f.sequence({ pattern: 'ACC-{seq:4}' }),
    status: f.state({
      initial: 'new',
      transitions: {
        open: { from: ['new'], to: 'open' },
        close: {
          from: ['open'],
          to: 'closed',
          permission: 'crm.account.close',
          input: z.object({ reason: z.string().check(z.minLength(3)) }),
        },
      },
    }),
    owner: f.belongsTo(() => Person).optional(),
  },
  permissions: {
    read: 'crm.account.read',
    create: 'crm.account.create',
    update: 'crm.account.update',
    delete: 'crm.account.delete',
  },
  api: { list: true, get: true, create: true, update: true, delete: true },
});

/** No soft delete, and a delete route: a row is removed. */
export const Note: EntityDef<'crm.Note'> = defineEntity({
  name: 'crm.Note',
  table: 'crm_notes',
  api: { list: true, get: true, update: true, delete: true },
  fields: { id: f.id(), text: f.string({ max: 100 }) },
});

/** An entity with no `api`: it has no routes. */
export const Hidden: EntityDef<'crm.Hidden'> = defineEntity({
  name: 'crm.Hidden',
  table: 'crm_hidden',
  fields: { id: f.id(), text: f.string({ max: 10 }) },
});

export const USER: Principal = { id: '0190f6b2-7c4e-7000-8000-0000000000b1', kind: 'user' };

export interface EntityApp {
  readonly server: HttpServer;
  readonly db: Database;
  readonly logger: MemoryLogger;
  readonly schemas: readonly OrmSchema[];
  readonly queries: string[];
  /** The permissions that the authorizer was asked about. */
  readonly asked: string[];
}

/** A server whose user may do everything, over a fresh in-memory SQLite database that holds the sample entities. */
export async function entityApp(options: HttpServerOptions = {}): Promise<EntityApp> {
  const schemas = compileEntities([Person, Account, Note, Hidden]);
  const queries: string[] = [];
  const db = await createDatabase(
    { DB_CONNECTION: 'sqlite', DATABASE_URL: ':memory:', DATABASE_READ_URLS: [], DB_POOL_MAX: 1 },
    { entities: schemas, queryLog: (sql) => void queries.push(sql) },
  );
  await db.orm.schema.create();
  const asked: string[] = [];
  const { server, logger } = testServer({
    authenticator: { authenticate: async () => USER },
    tenantResolver: { resolve: async () => TENANT },
    authorizer: { can: async (_principal, permission) => (asked.push(permission), true) },
    ...options,
  });
  registerEntityRoutes(server, schemas, { db });
  return {
    server,
    db,
    logger,
    schemas,
    queries,
    asked,
  };
}
