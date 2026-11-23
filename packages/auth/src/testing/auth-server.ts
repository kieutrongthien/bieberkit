/**
 * BieberKit
 *
 * @file        packages/auth/src/testing/auth-server.ts
 * @description Test helper: an HTTP server with Better Auth mounted over a real database, with the authenticator, the tenant resolver and the authorizer of this package.
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
import { AuditLog, compileEntities, entityOfSchema, runAsTenant, runInUnitOfWork } from '@bieberkit/data/orm';
import type { Database, OrmSchema } from '@bieberkit/data/orm';
import { createHttpServer, registerEntityRoutes } from '@bieberkit/http';
import type { HttpServer } from '@bieberkit/http';
import { createAuthorizer } from '../authorizer.ts';
import { createAuthenticator } from '../authenticator.ts';
import { createApiKey, revokeApiKey } from '../api-keys.ts';
import type { ApiKeyInput, CreatedApiKey } from '../api-keys.ts';
import { createAuth } from '../better-auth.ts';
import type { AuthInstance, AuthLimits, AuthMail } from '../better-auth.ts';
import { AuthRole, AuthRolePermission, AuthUserRole } from '../roles.ts';
import { registerAuthRoutes } from '../routes.ts';
import { createTenantResolver } from '../tenant.ts';
import type { AuthDialectContext } from './dialects.ts';
import { Deal, SCOPED } from './sample.ts';
import { secretOf, totpCode } from './totp.ts';

export const BASE_URL = 'https://app.test';
export const PASSWORD = 'correct horse battery staple';
export const TENANT_A: string = uuid7();
export const TENANT_B: string = uuid7();

export interface ServerReply {
  readonly status: number;
  readonly headers: Readonly<Record<string, string | string[] | number | undefined>>;
  readonly body: Readonly<Record<string, unknown>>;
  readonly text: string;
}

export interface SendOptions {
  readonly payload?: object;
  readonly cookie?: string;
  /** The address of the client, as a trusted proxy says it. */
  readonly ip?: string;
  readonly tenant?: string;
  readonly headers?: Record<string, string>;
  /** Leave out the header that says that the request comes from the same site. */
  readonly crossSite?: boolean;
}

export interface MailRecord extends AuthMail {
  readonly kind: 'verify' | 'reset' | 'magic';
}

export interface AuthServer {
  readonly db: Database;
  readonly server: HttpServer;
  readonly auth: AuthInstance;
  readonly mails: MailRecord[];
  readonly queries: string[];
  readonly deal: OrmSchema;
  send(method: 'GET' | 'POST' | 'PATCH' | 'DELETE', url: string, options?: SendOptions): Promise<ServerReply>;
  /** A call of the auth API, such as `/sign-in/email`. */
  api(method: 'GET' | 'POST', path: string, options?: SendOptions): Promise<ServerReply>;
  signUp(email: string, options?: SendOptions & { password?: string; name?: string }): Promise<ServerReply>;
  signIn(email: string, options?: SendOptions & { password?: string }): Promise<ServerReply>;
  /** Signs up and signs in, and gives the id of the user and the cookie. */
  login(email: string): Promise<{ id: string; cookie: string }>;
  /** Makes an API key for a user, as the code of a project does. */
  createKey(input: ApiKeyInput): Promise<CreatedApiKey>;
  revokeKey(id: string): Promise<void>;
  /** Turns TOTP on for the user of `cookie` and confirms it with a code. It gives the secret, the backup codes and the new session cookie. */
  enableTotp(cookie: string): Promise<{ secret: string; backupCodes: string[]; cookie: string }>;
  /** Signs in with the password and then with a TOTP code. It gives the cookie of the session. */
  signInTotp(
    email: string,
    secret: string,
    options?: SendOptions,
  ): Promise<{ cookie: string; first: ServerReply; second: ServerReply }>;
  count(table: string): Promise<number>;
  rows(sql: string): Promise<Record<string, unknown>[]>;
  /** Gives the user a new role in the tenant with these permissions. */
  grant(
    userId: string,
    permissions: readonly string[],
    tenant?: string,
    options?: { requireMfa?: boolean },
  ): Promise<void>;
  seed(tenant: string, rows: readonly Record<string, unknown>[]): Promise<Record<string, string>>;
  audit(): Promise<{ action: string; actorId: string | null; data: unknown }[]>;
  outbox(): Promise<string[]>;
}

export interface AuthServerOptions {
  /** Which methods besides email and password are on. */
  readonly totp?: boolean;
  readonly passkey?: boolean;
  readonly magicLink?: boolean;
  /** Use this database (the same one as another server) instead of opening a new one. */
  readonly db?: Database;
  /** Turns the API keys on, with this limit for a key (requests in a window of seconds). */
  readonly apiKeys?: { readonly rateLimit?: { readonly window: number; readonly max: number } } | true;
  readonly secret?: string;
  readonly previousSecrets?: readonly string[];
  readonly limits?: AuthLimits;
  readonly trustProxy?: boolean;
}

const asBody = (text: string): Record<string, unknown> => {
  if (text === '') return {};
  try {
    const parsed: unknown = JSON.parse(text);
    return typeof parsed === 'object' && parsed !== null ? Object.fromEntries(Object.entries(parsed)) : {};
  } catch {
    return {};
  }
};

/** The `name=value` of the session cookie that an answer sets, or `undefined`. */
export function cookieOf(reply: ServerReply): string | undefined {
  const header = reply.headers['set-cookie'];
  const all = Array.isArray(header) ? header : typeof header === 'string' ? [header] : [];
  // A cookie with no value is the server taking the cookie back, not a session.
  const found = all.find((line) => line.startsWith('__Host-bk_session=') && !line.startsWith('__Host-bk_session=;'));
  return found?.split(';')[0];
}

/** The whole `Set-Cookie` line of the session cookie, with its attributes. */
export function setCookieOf(reply: ServerReply): string | undefined {
  const header = reply.headers['set-cookie'];
  const all = Array.isArray(header) ? header : typeof header === 'string' ? [header] : [];
  return all.find((line) => line.startsWith('__Host-bk_session=') && !line.startsWith('__Host-bk_session=;'));
}

/** The `name=value` of any cookie that an answer sets, or `undefined`. */
export function cookieNamed(reply: ServerReply, name: string): string | undefined {
  const header = reply.headers['set-cookie'];
  const all = Array.isArray(header) ? header : typeof header === 'string' ? [header] : [];
  const found = all.find((line) => line.startsWith(`${name}=`) && !line.startsWith(`${name}=;`));
  return found?.split(';')[0];
}

export async function authServer(
  open: AuthDialectContext['open'],
  options: AuthServerOptions = {},
): Promise<AuthServer> {
  const schemas = compileEntities([Deal]);
  const queries: string[] = [];
  const db = options.db ?? (await open(schemas, { queryLog: (text) => void queries.push(text) }));
  const mails: MailRecord[] = [];
  const auth = createAuth({
    db,
    dialect: db.dialect,
    secret: options.secret ?? 'test-secret-that-is-long-enough-for-the-rule',
    ...(options.previousSecrets === undefined ? {} : { previousSecrets: options.previousSecrets }),
    ...(options.apiKeys === undefined ? {} : { apiKeys: options.apiKeys === true ? {} : options.apiKeys }),
    baseUrl: BASE_URL,
    methods: {
      ...(options.totp === true ? { totp: { issuer: 'BieberKit Test' } } : {}),
      ...(options.passkey === true ? { passkey: { rpName: 'BieberKit Test' } } : {}),
      ...(options.magicLink === true
        ? { magicLink: { send: async (mail: AuthMail) => void mails.push({ kind: 'magic', ...mail }) } }
        : {}),
    },
    ...(options.limits === undefined ? {} : { limits: options.limits }),
    mail: {
      sendVerification: async (mail) => void mails.push({ kind: 'verify', ...mail }),
      sendResetPassword: async (mail) => void mails.push({ kind: 'reset', ...mail }),
    },
  });
  const authorizer = createAuthorizer({ db, entities: [Deal], schemas, scoped: SCOPED });
  const server = createHttpServer(
    { APP_ENV: 'test', APP_PORT: 0, TRUST_PROXY: options.trustProxy ?? true, API_DOCS_PUBLIC: false },
    { authenticator: createAuthenticator(auth), tenantResolver: createTenantResolver({ db }), authorizer },
  );
  authorizer.install(server);
  registerAuthRoutes(server, { auth, db });
  registerEntityRoutes(server, schemas, { db });
  const deal = schemas.find((schema) => entityOfSchema(schema).name === 'crm.Deal');
  if (deal === undefined) throw new Error('The sample must compile to a deal schema.');

  const send: AuthServer['send'] = async (method, url, sent = {}) => {
    const response = await server.inject({
      method,
      url,
      headers: {
        host: 'app.test',
        origin: BASE_URL,
        'x-forwarded-for': sent.ip ?? '203.0.113.1',
        ...(sent.crossSite === true ? {} : { 'sec-fetch-site': 'same-origin' }),
        ...(sent.payload === undefined ? {} : { 'content-type': 'application/json' }),
        ...(sent.cookie === undefined ? {} : { cookie: sent.cookie }),
        ...(sent.tenant === undefined ? {} : { 'x-tenant': sent.tenant }),
        ...sent.headers,
      },
      ...(sent.payload === undefined ? {} : { payload: sent.payload }),
    });
    return { status: response.statusCode, headers: response.headers, body: asBody(response.body), text: response.body };
  };
  const api: AuthServer['api'] = (method, path, sent) => send(method, `/api/auth${path}`, sent);
  const signUp: AuthServer['signUp'] = (email, { password = PASSWORD, name = 'Test User', ...sent } = {}) =>
    api('POST', '/sign-up/email', { ...sent, payload: { email, password, name } });
  const signIn: AuthServer['signIn'] = (email, { password = PASSWORD, ...sent } = {}) =>
    api('POST', '/sign-in/email', { ...sent, payload: { email, password } });
  const rows: AuthServer['rows'] = async (text) => db.orm.em.getConnection().execute(text);

  return {
    db,
    server,
    auth,
    mails,
    queries,
    deal,
    send,
    api,
    signUp,
    signIn,
    login: async (email) => {
      const up = await signUp(email);
      const user = up.body['user'];
      const id = typeof user === 'object' && user !== null && 'id' in user ? String(user.id) : '';
      const reply = await signIn(email);
      return { id, cookie: cookieOf(reply) ?? '' };
    },
    createKey: (input) => createApiKey(auth, db, input),
    revokeKey: (id) => revokeApiKey(db, { id }),
    enableTotp: async (cookie) => {
      const enabled = await api('POST', '/two-factor/enable', { cookie, payload: { password: PASSWORD } });
      const secret = secretOf(String(enabled.body['totpURI']));
      const codes = enabled.body['backupCodes'];
      const confirmed = await api('POST', '/two-factor/verify-totp', { cookie, payload: { code: totpCode(secret) } });
      return {
        secret,
        backupCodes: Array.isArray(codes) ? codes.map(String) : [],
        cookie: cookieOf(confirmed) ?? '',
      };
    },
    signInTotp: async (email, secret, sent = {}) => {
      const first = await signIn(email, sent);
      const pending = cookieNamed(first, '__Host-bk_two_factor');
      const second = await api('POST', '/two-factor/verify-totp', {
        ...sent,
        cookie: pending ?? '',
        payload: { code: totpCode(secret) },
      });
      return { cookie: cookieOf(second) ?? '', first, second };
    },
    count: async (table) => Number((await rows(`select count(*) as n from ${table}`))[0]?.['n']),
    rows,
    grant: async (userId, permissions, tenant = TENANT_A, grantOptions = {}) => {
      const id = uuid7();
      await runInUnitOfWork(db, async (em) => {
        em.create(AuthRole, {
          id,
          tenant,
          name: `role-${id}`,
          system: false,
          requireMfa: grantOptions.requireMfa === true,
        });
        await em.flush();
        for (const permission of permissions) em.create(AuthRolePermission, { roleId: id, permission });
        em.create(AuthUserRole, { tenant, userId, roleId: id });
        await em.flush();
      });
    },
    seed: async (tenant, items) => {
      const ids: Record<string, string> = {};
      await runAsTenant(tenant, () =>
        runInUnitOfWork(db, async (em) => {
          for (const row of items) {
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
            actorId: row.actorId ?? null,
            data: row.data === null || row.data === undefined ? null : JSON.parse(row.data),
          }));
      }),
    outbox: async () =>
      (await rows('select event from bieberkit_outbox order by created_at')).map((row) => String(row['event'])),
  };
}
