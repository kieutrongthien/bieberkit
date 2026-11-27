/**
 * BieberKit
 *
 * @file        packages/auth/src/testing/app.ts
 * @description Test helper: an HTTP server over a real database with the real authorizer, header-driven callers, roles to grant and rows to seed.
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

import { uuid7 } from '@bieberkit/data';
import type { EntityDef } from '@bieberkit/data';
import { AuditLog, compileEntities, entityOfSchema, runAsTenant, runInUnitOfWork } from '@bieberkit/data/orm';
import type { Database, OrmSchema } from '@bieberkit/data/orm';
import { createHttpServer, registerEntityRoutes, registerMeta } from '@bieberkit/http';
import type { HttpServer, Principal } from '@bieberkit/http';
import type { ScopedPermission } from '../ability.ts';
import { createAuthorizer } from '../authorizer.ts';
import type { AccessAuthorizer, AuthorizerOptions } from '../authorizer.ts';
import { AuthRole, AuthRolePermission, AuthUserRole } from '../roles.ts';
import type { AuthDialectContext } from './dialects.ts';
import { Deal, Plain, SCOPED } from './sample.ts';

export const TENANT_A: string = uuid7();
export const TENANT_B: string = uuid7();

/** Callers of the tests. `owner` is the user that the conditions of the sample look for. */
export const USERS: {
  readonly admin: string;
  readonly reader: string;
  readonly owner: string;
  readonly other: string;
  readonly closer: string;
  readonly none: string;
} = {
  admin: uuid7(),
  reader: uuid7(),
  owner: uuid7(),
  other: uuid7(),
  closer: uuid7(),
  none: uuid7(),
};
export type UserName = 'admin' | 'reader' | 'owner' | 'other' | 'closer' | 'none';

/** Everything that the sample entity declares. */
export const ALL_DEAL_PERMISSIONS: readonly string[] = [
  'crm.deal.read',
  'crm.deal.create',
  'crm.deal.update',
  'crm.deal.delete',
  'crm.deal.close',
  'crm.deal.read-margin',
  'crm.deal.edit-margin',
];

export interface Reply {
  readonly status: number;
  readonly headers: Readonly<Record<string, string | string[] | number | undefined>>;
  readonly body: Readonly<Record<string, unknown>>;
}

export interface Client {
  get(url: string, headers?: Record<string, string>): Promise<Reply>;
  post(url: string, payload?: object, headers?: Record<string, string>): Promise<Reply>;
  patch(url: string, payload: object, version: number, headers?: Record<string, string>): Promise<Reply>;
  delete(url: string, version: number, headers?: Record<string, string>): Promise<Reply>;
}

export interface AuditRow {
  readonly action: string;
  readonly entity: string | null;
  readonly recordId: string | null;
  readonly actorId: string | null;
  readonly tenant: string | null;
  readonly data: unknown;
}

export interface AuthApp {
  readonly db: Database;
  readonly server: HttpServer;
  readonly authorizer: AccessAuthorizer;
  readonly schemas: readonly OrmSchema[];
  readonly queries: string[];
  /** The ORM schema of the sample entity. */
  readonly deal: OrmSchema;
  /** A caller. Without a user the request has no principal. The tenant defaults to `TENANT_A`. */
  as(user: UserName | undefined, tenant?: string): Client;
  /** A caller by the id of the user. */
  asId(userId: string, tenant?: string): Client;
  /** Gives the user a new role of the tenant with these permissions. */
  grant(
    user: UserName,
    permissions: readonly string[],
    options?: { tenant?: string; requireMfa?: boolean },
  ): Promise<string>;
  /** The same, for a user that is named by its id. */
  grantId(
    userId: string,
    permissions: readonly string[],
    options?: { tenant?: string; requireMfa?: boolean },
  ): Promise<string>;
  /** Makes deals of a tenant and returns their ids by code. */
  seed(tenant: string, rows: readonly Record<string, unknown>[]): Promise<Record<string, string>>;
  /** The audit entries that the app wrote, oldest first, without the ones of `asSystem`. */
  audit(): Promise<AuditRow[]>;
  /** The stored value of a field of a deal, read behind every rule. */
  stored(id: string, field: string): Promise<unknown>;
}

export interface AuthAppOptions {
  readonly scoped?: Readonly<Record<string, ScopedPermission>>;
  /** Registers `_meta` too. */
  readonly meta?: boolean;
  /** Makes the authorizer. A test of a mutant gives its own. */
  readonly authorizer?: (options: AuthorizerOptions, tenants: readonly [string, string]) => AccessAuthorizer;
}

const asBody = (text: string): Record<string, unknown> => {
  if (text === '') return {};
  const parsed: unknown = JSON.parse(text);
  return typeof parsed === 'object' && parsed !== null ? Object.fromEntries(Object.entries(parsed)) : {};
};

export async function authApp(open: AuthDialectContext['open'], options: AuthAppOptions = {}): Promise<AuthApp> {
  const entities: readonly EntityDef<string>[] = [Deal, Plain];
  const schemas = compileEntities([...entities]);
  const queries: string[] = [];
  const db = await open(schemas, { queryLog: (text) => void queries.push(text) });
  const authorizerOptions: AuthorizerOptions = { db, entities, schemas, scoped: options.scoped ?? SCOPED };
  const authorizer =
    options.authorizer?.(authorizerOptions, [TENANT_A, TENANT_B]) ?? createAuthorizer(authorizerOptions);
  const server = createHttpServer(
    { APP_ENV: 'test', APP_PORT: 0, TRUST_PROXY: false, API_DOCS_PUBLIC: false },
    {
      authenticator: {
        authenticate: async (request): Promise<Principal | undefined> => {
          const header = request.headers['x-test-user'];
          const id = Array.isArray(header) ? header[0] : header;
          return id === undefined || id === '' ? undefined : { id, kind: 'user', via: 'token' };
        },
      },
      tenantResolver: {
        resolve: async (request) => {
          const header = request.headers['x-test-tenant'];
          return (Array.isArray(header) ? header[0] : header) || undefined;
        },
      },
      authorizer,
    },
  );
  authorizer.install(server);
  registerEntityRoutes(server, schemas, { db });
  if (options.meta === true) registerMeta(server, entities);
  const deal = schemas.find((schema) => entityOfSchema(schema).name === 'crm.Deal');
  if (deal === undefined) throw new Error('The sample must compile to a deal schema.');

  const send = async (
    userId: string | undefined,
    tenant: string,
    method: 'GET' | 'POST' | 'PATCH' | 'DELETE',
    url: string,
    payload: object | undefined,
    headers: Record<string, string>,
  ): Promise<Reply> => {
    const response = await server.inject({
      method,
      url,
      headers: { ...(userId === undefined ? {} : { 'x-test-user': userId }), 'x-test-tenant': tenant, ...headers },
      ...(payload === undefined ? {} : { payload }),
    });
    return { status: response.statusCode, headers: response.headers, body: asBody(response.body) };
  };

  const clientOf = (userId: string | undefined, tenant: string): Client => ({
    get: (url, headers = {}) => send(userId, tenant, 'GET', url, undefined, headers),
    post: (url, payload, headers = {}) => send(userId, tenant, 'POST', url, payload ?? {}, headers),
    patch: (url, payload, version, headers = {}) =>
      send(userId, tenant, 'PATCH', url, payload, { 'if-match': String(version), ...headers }),
    delete: (url, version, headers = {}) =>
      send(userId, tenant, 'DELETE', url, undefined, { 'if-match': String(version), ...headers }),
  });
  const grantTo = async (
    userId: string,
    permissions: readonly string[],
    grantOptions: { tenant?: string; requireMfa?: boolean },
  ): Promise<string> => {
    const tenant = grantOptions.tenant ?? TENANT_A;
    const id = uuid7();
    await runInUnitOfWork(db, async (em) => {
      em.create(AuthRole, {
        id,
        tenant,
        name: `role-${id}`,
        system: false,
        requireMfa: grantOptions.requireMfa ?? false,
        ipRestricted: false,
      });
      // The tables point at each other by key and not by relation, so the role is written first.
      await em.flush();
      for (const permission of permissions) em.create(AuthRolePermission, { roleId: id, permission });
      em.create(AuthUserRole, { tenant, userId, roleId: id });
      await em.flush();
    });
    return id;
  };

  return {
    db,
    server,
    authorizer,
    schemas,
    queries,
    deal,
    as: (user, tenant = TENANT_A) => clientOf(user === undefined ? undefined : USERS[user], tenant),
    asId: (userId, tenant = TENANT_A) => clientOf(userId, tenant),
    grant: (user, permissions, grantOptions = {}) => grantTo(USERS[user], permissions, grantOptions),
    grantId: (userId, permissions, grantOptions = {}) => grantTo(userId, permissions, grantOptions),
    seed: async (tenant, rows) => {
      const ids: Record<string, string> = {};
      await runAsTenant(tenant, () =>
        runInUnitOfWork(db, async (em) => {
          for (const row of rows) {
            const made = em.create(deal, { title: 'A deal', ...row });
            await em.flush();
            ids[String(row['code'])] = String(made['id']);
          }
        }),
      );
      return ids;
    },
    audit: () =>
      runInUnitOfWork(db, async (em) => {
        const found = await em.find(AuditLog, {}, { orderBy: { at: 'asc' } });
        return found
          .filter((row) => row.action !== 'system.scope')
          .map((row) => ({
            action: row.action,
            entity: row.entity ?? null,
            recordId: row.recordId ?? null,
            actorId: row.actorId ?? null,
            tenant: row.tenant ?? null,
            data: row.data === null || row.data === undefined ? null : JSON.parse(row.data),
          }));
      }),
    stored: (id, field) =>
      db.asSystem('the test reads a value behind every rule', () =>
        runInUnitOfWork(db, async (em) => {
          const row = await em.findOne(deal, { id });
          return row === null ? undefined : row[field];
        }),
      ),
  };
}

/** The rows of a list or an aggregate answer, in the order of the answer. */
export function rowsOf(reply: Reply): Record<string, unknown>[] {
  const data = reply.body['data'];
  return Array.isArray(data)
    ? data.map((row: unknown) =>
        typeof row === 'object' && row !== null ? Object.fromEntries(Object.entries(row)) : {},
      )
    : [];
}

/** The `code` of each row of a list, sorted, for a test that does not care about the order. */
export function codesOf(reply: Reply): string[] {
  return rowsOf(reply)
    .map((row) => String(row['code']))
    .toSorted((a, b) => a.localeCompare(b));
}

/** The row of a get, a create or an update. */
export function rowOf(reply: Reply): Record<string, unknown> {
  const data = reply.body['data'];
  return typeof data === 'object' && data !== null && !Array.isArray(data)
    ? Object.fromEntries(Object.entries(data))
    : {};
}

export const DEALS = '/api/v1/crm/deals';
