/**
 * BieberKit
 *
 * @file        packages/auth/src/user-service.ts
 * @description The user service: list, read, create with roles or by invitation, change, disable, delete by anonymizing, sessions, reset links and MFA reset, each atomic with its audit entry and held to the self and last-administrator guards (BPL-01, USR-01 to USR-11, MOD-16).
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

import { randomBytes } from 'node:crypto';
import { raw } from '@mikro-orm/core';
import type { EntityManager, FilterQuery } from '@mikro-orm/core';
import { requestContext } from '@bieberkit/core';
import { decodeCursor, encodeCursor, isUuid, pageSize, uuid7 } from '@bieberkit/data';
import { recordAudit, runInTransaction, runInUnitOfWork } from '@bieberkit/data/orm';
import type { Database } from '@bieberkit/data/orm';
import { HttpError } from '@bieberkit/http';
import { holdersQuery, keepLastAdmin, refuseSelf } from './admin-guard.ts';
import { mailOf } from './better-auth.ts';
import type { AuthInstance } from './better-auth.ts';
import { authError } from './errors.ts';
import { createRateLimiter } from './limits.ts';
import type { Limit, RateStorage } from './limits.ts';
import { AuthRole, AuthUserGroup, AuthUserRole, NIL_TENANT } from './roles.ts';
import { checkGrantable, grantRoles, groupOf } from './role-service.ts';
import {
  AuthAccount,
  AuthApiKey,
  AuthPasskey,
  AuthSession,
  AuthTwoFactor,
  AuthUser,
  AuthVerification,
} from './tables.ts';
import type { AuthSessionRow, AuthUserRow } from './tables.ts';
import { isDisabledUser } from './user-status.ts';

const ENTITY = 'authUser';
const RESET_TTL_SECONDS = 3600;
const INVITE_TTL_SECONDS = 7 * 86_400;
const RESET_PREFIX = 'reset-password:';
const DEFAULT_LIMITS = { perTarget: { window: 900, max: 3 }, perActor: { window: 900, max: 20 } } as const;
const MIN_PASSWORD = 8;
const MAX_PASSWORD = 128;

export interface DisableUserInput {
  readonly userId: string;
  readonly reason: string;
  readonly actorId: string | null;
  /** The caller holds `users.override-external`, so a user managed by a provider may be changed (IDN-02). */
  readonly overrideExternal?: boolean;
}

export interface EnableUserInput {
  readonly userId: string;
  readonly actorId: string | null;
  readonly overrideExternal?: boolean;
}

export type UserStatus = 'active' | 'disabled' | 'invited';
export type UserSort = 'createdAt' | '-createdAt' | 'name' | '-name' | 'email' | '-email';

export interface UserRecord {
  readonly id: string;
  readonly name: string;
  readonly email: string;
  readonly emailVerified: boolean;
  readonly status: UserStatus;
  readonly source: string;
  readonly roles: readonly { readonly id: string; readonly name: string }[];
  readonly mfaEnabled: boolean;
  readonly lastSignInAt: string | null;
  readonly createdAt: string;
}

export interface UserDetail extends UserRecord {
  readonly activeSessions: number;
  /** The groups that the project put the user in (ROL-09). */
  readonly groups: readonly string[];
}

export interface UserListQuery {
  /** The tenant of the request. None, or the nil tenant, is a project without tenants or a system administrator: everybody. */
  readonly tenantId?: string;
  /** A prefix of the name, in any case, or of the email. */
  readonly q?: string;
  /** The id of a role that the user holds. */
  readonly role?: string;
  readonly status?: UserStatus;
  readonly emailVerified?: boolean;
  readonly createdFrom?: string;
  readonly createdTo?: string;
  readonly sort?: UserSort;
  readonly pageSize?: unknown;
  readonly cursor?: string;
  readonly withTotal?: boolean;
  /** Only the users of these groups: the scope of a manager whose role is limited to them (ROL-09). */
  readonly groupIds?: readonly string[];
}

export interface UserPage {
  readonly data: readonly UserRecord[];
  readonly nextCursor: string | null;
  readonly pageSize: number;
  readonly total?: number;
}

export interface UserSession {
  readonly id: string;
  readonly ipAddress: string | null;
  readonly userAgent: string | null;
  readonly createdAt: string;
  readonly lastUsedAt: string;
}

export interface NewUser {
  readonly name: string;
  readonly email: string;
  /** Either a password, or `invite: true` and a mail with a link that sets one (USR-10). */
  readonly password?: string;
  readonly invite?: boolean;
  /** Roles of the tenant, given in the same transaction (USR-03). */
  readonly roles?: readonly string[];
  /** Groups to put the user in (ROL-09). */
  readonly groups?: readonly string[];
  /** The groups that limit the caller. The new user must be in one of them, or the caller could not see it (ROL-09). */
  readonly groupIds?: readonly string[];
  readonly tenantId?: string;
  readonly actorId: string | null;
}

export interface UserChange {
  readonly userId: string;
  readonly name?: string;
  readonly email?: string;
  readonly tenantId?: string;
  readonly actorId: string | null;
  readonly overrideExternal?: boolean;
}

export interface UserAction {
  readonly userId: string;
  readonly actorId: string | null;
}

export interface UserServiceOptions {
  readonly db: Database;
  readonly auth: AuthInstance;
  /** How long an invitation link lives. Defaults to 7 days (`USERS_INVITE_TTL`). */
  readonly inviteTtlSeconds?: number;
  /** The limits of the mails that an administrator sends for a user, per user and per administrator (AUTH-06). */
  readonly limits?: { readonly perTarget?: Limit; readonly perActor?: Limit };
  /** Where the counters live. Defaults to `bk_auth_rate_limits`. */
  readonly rateStorage?: RateStorage;
}

export interface UserService {
  list(query: UserListQuery): Promise<UserPage>;
  get(
    userId: string,
    options?: { readonly tenantId?: string; readonly groupIds?: readonly string[] },
  ): Promise<UserDetail>;
  /** Replaces the groups of a user. A manager limited to groups can only use those, and only on users inside them (ROL-09). */
  setGroups(
    input: UserAction & { readonly groups: readonly string[]; readonly groupIds?: readonly string[] },
  ): Promise<UserDetail>;
  create(input: NewUser): Promise<UserDetail>;
  update(input: UserChange): Promise<UserDetail>;
  disable(input: DisableUserInput): Promise<boolean>;
  enable(input: EnableUserInput): Promise<boolean>;
  remove(input: UserAction): Promise<void>;
  sessions(userId: string): Promise<UserSession[]>;
  revokeSession(input: UserAction & { readonly sessionId: string }): Promise<boolean>;
  revokeSessions(input: UserAction): Promise<number>;
  sendPasswordReset(input: UserAction): Promise<void>;
  resendInvite(input: UserAction): Promise<void>;
  resetMfa(input: UserAction): Promise<void>;
  /** For a provider plugin: makes or updates the user of an identity that the provider owns (IDN-03). */
  upsertExternalUser(input: ExternalUser): Promise<UserDetail>;
  /** For a provider plugin: disables or enables the user of an identity that the provider owns (IDN-03). */
  setExternalDisabled(input: ExternalDisabled): Promise<boolean>;
}

/** The identity of a user that a provider owns. `source` is `sso:<provider>` or `scim:<provider>` (IDN-01). */
export interface ExternalIdentity {
  readonly source: string;
  readonly externalId: string;
}

export interface ExternalUser extends ExternalIdentity {
  readonly name: string;
  readonly email: string;
  /** Disables or enables the user in the same call. Left out, the state is not touched. */
  readonly disabled?: boolean;
  readonly tenantId?: string;
}

export interface ExternalDisabled extends ExternalIdentity {
  readonly disabled: boolean;
  readonly reason?: string;
}

const notFound = (): never => {
  throw authError('USERS_NOT_FOUND', 404, 'The user does not exist.', 'Check the user id.');
};

const iso = (value: Date | null | undefined): string | null => (value == null ? null : new Date(value).toISOString());

export function statusOf(user: AuthUserRow): UserStatus {
  if (isDisabledUser(user)) return 'disabled';
  return user.lastSignInAt == null && !user.emailVerified ? 'invited' : 'active';
}

/** Runs `run` as `actorId`, so that audit entries and the role guards see the actor; `null` is the system. */
function asActor<T>(actorId: string | null, run: () => Promise<T>): Promise<T> {
  const current = requestContext.get();
  const context = { ...current, requestId: current?.requestId ?? uuid7() };
  if (actorId === null) delete context.userId;
  else context.userId = actorId;
  return requestContext.run(context, run);
}

function audit(em: EntityManager, userId: string, action: string, data?: Record<string, unknown>): void {
  recordAudit(em, { action, entity: ENTITY, recordId: userId, ...(data === undefined ? {} : { data }) });
}

/** Cleans a list of groups, and refuses one that the caller's own limit does not cover (ROL-09). */
function groupsOf(groups: readonly string[], limit: readonly string[] | undefined): string[] {
  const clean = [...new Set(groups.map((group) => groupOf(group) ?? ''))].toSorted((a, b) => a.localeCompare(b));
  if (clean.length > 50) {
    throw authError('GROUPS_INVALID', 400, 'A user is in at most 50 groups.', 'Send fewer groups.');
  }
  if (limit !== undefined && (clean.length === 0 || clean.some((group) => !limit.includes(group)))) {
    throw authError(
      'USERS_OUT_OF_SCOPE',
      403,
      'You manage the users of your own groups, so the groups of this user must be among them.',
      'Use one of your groups.',
    );
  }
  return clean;
}

const SOURCE = /^(sso|scim):[a-z0-9][a-z0-9._-]{0,50}$/;

/** A provider owns the name, the email and the disabled state of its users, so the users routes refuse to change them (IDN-02). */
async function refuseManaged(em: EntityManager, userId: string, override: boolean | undefined): Promise<void> {
  if (override === true || !isUuid(userId)) return;
  const user = await em.findOne(AuthUser, { id: userId.toLowerCase(), deletedAt: null });
  if (user !== null && user.source !== 'local') {
    throw authError(
      'USERS_MANAGED_EXTERNALLY',
      409,
      `This user is managed by ${user.source}.`,
      'Change it in the identity provider, or use an account that holds users.override-external.',
    );
  }
}

function sourceOf(identity: ExternalIdentity): string {
  if (!SOURCE.test(identity.source) || identity.externalId.trim() === '' || identity.externalId.length > 255) {
    throw authError(
      'USERS_EXTERNAL_INVALID',
      400,
      'An external identity has a source such as sso:okta and an external id of 1 to 255 characters.',
      'Give the source as sso:<provider> or scim:<provider>.',
    );
  }
  return identity.source;
}

async function unchanged(em: EntityManager, userId: string): Promise<false> {
  if ((await em.findOne(AuthUser, { id: userId, deletedAt: null })) === null) notFound();
  return false;
}

/**
 * Disables a user and revokes all database sessions atomically with the audit entry. Nobody disables themselves, and the last
 * active administrator stays enabled (USR-07).
 */
export async function disableUser(db: Database, input: DisableUserInput): Promise<boolean> {
  refuseSelf(input.actorId, input.userId);
  return asActor(input.actorId, () =>
    runInTransaction(db, async (em) => {
      await refuseManaged(em, input.userId, input.overrideExternal);
      await keepLastAdmin(em, db.dialect, input.userId);
      const changed = await em.nativeUpdate(
        AuthUser,
        { id: input.userId, disabledAt: null, deletedAt: null },
        { disabledAt: new Date(), disabledReason: input.reason, disabledBy: input.actorId },
      );
      if (changed === 0) return unchanged(em, input.userId);
      await em.nativeDelete(AuthSession, { userId: input.userId });
      audit(em, input.userId, 'users.user.disabled', { reason: input.reason });
      await em.flush();
      return true;
    }),
  );
}

/** Enables a disabled user; old sessions stay revoked and the user signs in again. */
export async function enableUser(db: Database, input: EnableUserInput): Promise<boolean> {
  return asActor(input.actorId, () =>
    runInTransaction(db, async (em) => {
      await refuseManaged(em, input.userId, input.overrideExternal);
      const changed = await em.nativeUpdate(
        AuthUser,
        { id: input.userId, disabledAt: { $ne: null }, deletedAt: null },
        { disabledAt: null, disabledReason: null, disabledBy: null },
      );
      if (changed === 0) return unchanged(em, input.userId);
      audit(em, input.userId, 'users.user.enabled');
      await em.flush();
      return true;
    }),
  );
}

/** The `!` escape of LIKE: one character that every dialect accepts in `escape '!'`. */
const likePrefix = (text: string): string => `${text.replaceAll(/[!%_]/g, (found) => `!${found}`)}%`;

function sortOf(sort: UserSort | undefined): { readonly field: 'id' | 'name' | 'email'; readonly dir: 'asc' | 'desc' } {
  const value = sort ?? 'createdAt';
  const field = value.startsWith('-') ? value.slice(1) : value;
  if (field !== 'createdAt' && field !== 'name' && field !== 'email') {
    throw authError(
      'USERS_QUERY_INVALID',
      400,
      `"${value}" is not a sort of the users.`,
      'Sort by createdAt, name or email.',
    );
  }
  return { field: field === 'createdAt' ? 'id' : field, dir: value.startsWith('-') ? 'desc' : 'asc' };
}

const tenantScope = (tenantId: string | undefined): string | undefined => {
  const tenant = tenantId?.toLowerCase();
  return tenant === undefined || tenant === NIL_TENANT ? undefined : tenant;
};

/**
 * The UUIDv7 that starts at `date` (`edge` `low`) or ends there (`high`). Ids are UUIDv7, so creation time is the order of the
 * primary key: the list sorts and filters by creation on the id, which every dialect compares the same way. On SQLite the dates of
 * Better Auth are text and those of MikroORM are numbers, and the two do not compare.
 */
function idAt(date: Date, edge: 'low' | 'high'): string {
  const hex = Math.max(0, Math.min(date.getTime(), 0xffff_ffff_ffff)).toString(16).padStart(12, '0');
  const tail = edge === 'low' ? '7000-8000-000000000000' : '7fff-bfff-ffffffffffff';
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${tail}`;
}

const dateOf = (text: string): Date => {
  const date = new Date(text);
  if (Number.isNaN(date.getTime()))
    throw authError('USERS_QUERY_INVALID', 400, 'A date of the filter is not a date.', 'Send an ISO 8601 date.');
  return date;
};

/** The conditions of a list or a lookup: never a deleted user, and in a tenant only the holders of a role there (Decision 3). */
async function scoped(
  em: EntityManager,
  tenantId: string | undefined,
  groupIds?: readonly string[],
): Promise<FilterQuery<AuthUserRow>[]> {
  const tenant = tenantScope(tenantId);
  const out: FilterQuery<AuthUserRow>[] = [{ deletedAt: null }];
  // A manager whose role is limited to groups sees the users of those groups only (ROL-09).
  if (groupIds !== undefined) {
    const members = await em.find(AuthUserGroup, { groupId: { $in: [...groupIds] } });
    out.push({ id: { $in: members.map((row) => row.userId) } });
  }
  if (tenant !== undefined) {
    const members = holdersQuery(em, 'm', { tenant });
    // The query builder is a sub-query that MikroORM writes in place; its type is not one of the filter.
    // oxlint-disable-next-line typescript/no-unsafe-type-assertion
    out.push({ id: { $in: members } } as unknown as FilterQuery<AuthUserRow>);
  }
  return out;
}

async function rolesOf(
  em: EntityManager,
  userIds: readonly string[],
  tenantId: string | undefined,
): Promise<Map<string, { id: string; name: string }[]>> {
  const out = new Map<string, { id: string; name: string }[]>();
  if (userIds.length === 0) return out;
  const tenant = (tenantId ?? NIL_TENANT).toLowerCase();
  const assigned = await em.find(AuthUserRole, { tenant, userId: { $in: [...userIds] } });
  const roles = await em.find(AuthRole, { id: { $in: [...new Set(assigned.map((row) => row.roleId))] } });
  const byId = new Map(roles.map((role) => [role.id, role] as const));
  for (const row of assigned) {
    const role = byId.get(row.roleId);
    if (role === undefined) continue;
    const list = out.get(row.userId) ?? [];
    list.push({ id: role.id, name: role.name });
    out.set(row.userId, list);
  }
  for (const list of out.values()) list.sort((a, b) => a.name.localeCompare(b.name));
  return out;
}

function recordOf(user: AuthUserRow, roles: readonly { id: string; name: string }[]): UserRecord {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    emailVerified: user.emailVerified,
    status: statusOf(user),
    source: user.source,
    roles,
    mfaEnabled: user.twoFactorEnabled === true,
    lastSignInAt: iso(user.lastSignInAt),
    createdAt: new Date(user.createdAt).toISOString(),
  };
}

/**
 * Disables or enables the user of a provider, with the audit entry. It says whether the state changed. The provider is not a user,
 * so the entry names it in its data and the actor is the system (IDN-03).
 */
async function setManagedState(
  em: EntityManager,
  dialect: Database['dialect'],
  user: AuthUserRow,
  disabled: boolean,
  reason: string,
): Promise<boolean> {
  if (isDisabledUser(user) === disabled) return false;
  if (disabled) {
    await keepLastAdmin(em, dialect, user.id);
    await em.nativeUpdate(
      AuthUser,
      { id: user.id },
      { disabledAt: new Date(), disabledReason: reason, disabledBy: null },
    );
    await em.nativeDelete(AuthSession, { userId: user.id });
    audit(em, user.id, 'users.user.disabled', { reason, provider: user.source });
  } else {
    await em.nativeUpdate(AuthUser, { id: user.id }, { disabledAt: null, disabledReason: null, disabledBy: null });
    audit(em, user.id, 'users.user.enabled', { provider: user.source });
  }
  await em.flush();
  return true;
}

/** The sessions of a user that have not expired. They are few, and filtered here because SQLite keeps their dates as text. */
async function liveSessions(em: EntityManager, userId: string): Promise<AuthSessionRow[]> {
  const now = Date.now();
  const rows: AuthSessionRow[] = await em.find(AuthSession, { userId }, { orderBy: { createdAt: 'asc' } });
  return rows.filter((row) => new Date(row.expiresAt).getTime() > now);
}

async function detailOf(em: EntityManager, user: AuthUserRow, tenantId: string | undefined): Promise<UserDetail> {
  const roles = (await rolesOf(em, [user.id], tenantId)).get(user.id) ?? [];
  const activeSessions = (await liveSessions(em, user.id)).length;
  const groups = (await em.find(AuthUserGroup, { userId: user.id }))
    .map((row) => row.groupId)
    .toSorted((a, b) => a.localeCompare(b));
  return { ...recordOf(user, roles), activeSessions, groups };
}

async function findUser(
  em: EntityManager,
  userId: string,
  tenantId?: string,
  groupIds?: readonly string[],
): Promise<AuthUserRow> {
  if (!isUuid(userId)) return notFound();
  const user = await em.findOne(AuthUser, {
    $and: [{ id: userId.toLowerCase() }, ...(await scoped(em, tenantId, groupIds))],
  });
  return user ?? notFound();
}

const textOrNull = (value: string | null | undefined): string | null =>
  typeof value === 'string' && value !== '' ? value : null;

const emailOf = (email: string): string => email.trim().toLowerCase();

const emailTaken = (): never => {
  throw authError('USERS_EMAIL_TAKEN', 409, 'Another user has this email.', 'Use another email.');
};

function passwordOf(password: string): string {
  if (password.length < MIN_PASSWORD || password.length > MAX_PASSWORD) {
    throw authError(
      'USERS_CREATE_REFUSED',
      400,
      `The password needs at least ${MIN_PASSWORD} characters and at most ${MAX_PASSWORD} (AUTH-04).`,
      'Use a longer password. A phrase of 15 characters or more is easiest to remember.',
    );
  }
  return password;
}

const mailUnavailable = (): never => {
  throw authError(
    'USERS_MAIL_UNAVAILABLE',
    503,
    'This project cannot send mail, so the link cannot be sent.',
    'Configure the mail contract (MAIL_DRIVER).',
  );
};

export function createUserService(options: UserServiceOptions): UserService {
  const { db, auth } = options;
  const inviteTtl = options.inviteTtlSeconds ?? INVITE_TTL_SECONDS;
  const storage = options.rateStorage ?? createRateLimiter(db).storage;
  const limits = {
    perTarget: options.limits?.perTarget ?? DEFAULT_LIMITS.perTarget,
    perActor: options.limits?.perActor ?? DEFAULT_LIMITS.perActor,
  };

  /** AUTH-06 for the mails that an administrator sends: per target and per actor. */
  async function limit(action: string, input: UserAction): Promise<void> {
    const keys: [string, Limit][] = [[`users:${action}:target:${input.userId.toLowerCase()}`, limits.perTarget]];
    if (input.actorId !== null) keys.push([`users:${action}:actor:${input.actorId.toLowerCase()}`, limits.perActor]);
    for (const [key, rule] of keys) {
      const result = await storage.consume(key, rule);
      if (!result.allowed) {
        const retry = String(result.retryAfter ?? rule.window);
        throw new HttpError(
          'USERS_RATE_LIMITED',
          429,
          'Too many of these mails were sent in a short time.',
          `Try again in ${retry} seconds.`,
          { 'Retry-After': retry },
          undefined,
          { retryAfter: Number(retry) },
        );
      }
    }
  }

  /** Writes a reset link that Better Auth's own `/reset-password` accepts, and returns its token and URL (USR-09, USR-10). */
  async function resetLink(userId: string, ttlSeconds: number): Promise<{ token: string; url: string }> {
    const context = await auth.$context;
    const token = randomBytes(18).toString('base64url');
    await context.internalAdapter.createVerificationValue({
      identifier: `${RESET_PREFIX}${token}`,
      value: userId,
      expiresAt: new Date(Date.now() + ttlSeconds * 1000),
    });
    const callback = encodeURIComponent(`${new URL(context.baseURL).origin}/reset-password`);
    return { token, url: `${context.baseURL}/reset-password/${token}?callbackURL=${callback}` };
  }

  /** Takes back every reset and invitation link of a user, also from Valkey. */
  async function revokeLinks(em: EntityManager, userId: string): Promise<void> {
    const context = await auth.$context;
    const rows = await em.find(AuthVerification, { identifier: { $like: `${RESET_PREFIX}%` }, value: userId });
    for (const row of rows) await context.internalAdapter.deleteVerificationByIdentifier(row.identifier);
  }

  async function sendInvite(user: AuthUserRow): Promise<void> {
    const send = mailOf(auth).sendInvite ?? mailUnavailable();
    const link = await resetLink(user.id, inviteTtl);
    await send({ to: user.email, ...link });
  }

  const service: UserService = {
    async list(query) {
      const size = pageSize(query.pageSize);
      const { field, dir } = sortOf(query.sort);
      return runInUnitOfWork(db, async (em) => {
        const where: FilterQuery<AuthUserRow>[] = await scoped(em, query.tenantId, query.groupIds);
        if (query.q !== undefined && query.q.trim() !== '') {
          const pattern = likePrefix(query.q.trim().toLowerCase());
          where.push({
            [raw("(lower(name) like ? escape '!' or email like ? escape '!')", [pattern, pattern])]: [],
          });
        }
        if (query.role !== undefined) {
          if (!isUuid(query.role))
            return { data: [], nextCursor: null, pageSize: size, ...(query.withTotal === true ? { total: 0 } : {}) };
          const holders = holdersQuery(em, 'h', { roleId: query.role.toLowerCase() });
          // oxlint-disable-next-line typescript/no-unsafe-type-assertion
          where.push({ id: { $in: holders } } as unknown as FilterQuery<AuthUserRow>);
        }
        if (query.status === 'disabled') where.push({ disabledAt: { $ne: null } });
        if (query.status === 'invited') where.push({ disabledAt: null, lastSignInAt: null, emailVerified: false });
        if (query.status === 'active')
          where.push({ disabledAt: null, $or: [{ lastSignInAt: { $ne: null } }, { emailVerified: true }] });
        if (query.emailVerified !== undefined) where.push({ emailVerified: query.emailVerified });
        if (query.createdFrom !== undefined) where.push({ id: { $gte: idAt(dateOf(query.createdFrom), 'low') } });
        if (query.createdTo !== undefined) where.push({ id: { $lte: idAt(dateOf(query.createdTo), 'high') } });
        const total = query.withTotal === true ? await em.count(AuthUser, { $and: where }) : undefined;
        const page: FilterQuery<AuthUserRow>[] = [...where];
        if (query.cursor !== undefined && query.cursor !== '') {
          const [value, id] = decodeCursor(query.cursor);
          if (typeof value !== 'string' || typeof id !== 'string' || !isUuid(id))
            throw authError('DATA_CURSOR_INVALID', 400, 'The cursor is not valid.', 'Start again from the first page.');
          const op = dir === 'asc' ? '$gt' : '$lt';
          page.push(
            field === 'id'
              ? { id: { [op]: id } }
              : { $or: [{ [field]: { [op]: value } }, { [field]: value, id: { [op]: id } }] },
          );
        }
        const rows = await em.find(AuthUser, { $and: page }, { orderBy: { [field]: dir, id: dir }, limit: size + 1 });
        const shown = rows.slice(0, size);
        const roles = await rolesOf(
          em,
          shown.map((row) => row.id),
          query.tenantId,
        );
        const last = shown.at(-1);
        const position = (row: AuthUserRow): string => row[field];
        return {
          data: shown.map((row) => recordOf(row, roles.get(row.id) ?? [])),
          nextCursor: rows.length > size && last !== undefined ? encodeCursor([position(last), last.id]) : null,
          pageSize: size,
          ...(total === undefined ? {} : { total }),
        };
      });
    },

    get: (userId, lookup = {}) =>
      runInUnitOfWork(db, async (em) =>
        detailOf(em, await findUser(em, userId, lookup.tenantId, lookup.groupIds), lookup.tenantId),
      ),

    async create(input) {
      const invite = input.invite === true;
      if (invite === (input.password !== undefined)) {
        throw authError(
          'USERS_CREATE_REFUSED',
          400,
          'A user is made with a password or by invitation, not both and not neither.',
          'Send a password, or invite: true.',
        );
      }
      const groups = groupsOf(input.groups ?? [], input.groupIds === undefined ? undefined : input.groupIds);
      const password = input.password === undefined ? undefined : passwordOf(input.password);
      const email = emailOf(input.email);
      const name = input.name.trim();
      const id = uuid7();
      const context = await auth.$context;
      const hash = password === undefined ? undefined : await context.password.hash(password);
      await asActor(input.actorId, async () => {
        const roles = await checkGrantable(db, input.tenantId, input.roles ?? []);
        await runInTransaction(db, async (em) => {
          if ((await em.count(AuthUser, { email })) > 0) emailTaken();
          const now = new Date();
          em.create(AuthUser, { id, name, email, emailVerified: false, createdAt: now, updatedAt: now });
          await em.flush();
          if (hash !== undefined) {
            em.create(AuthAccount, {
              id: uuid7(),
              userId: id,
              externalId: id,
              providerId: 'credential',
              password: hash,
              createdAt: now,
              updatedAt: now,
            });
          }
          audit(em, id, 'users.user.created', { invite });
          await em.flush();
          for (const group of groups) em.create(AuthUserGroup, { userId: id, groupId: group });
          await em.flush();
          await grantRoles(em, input.tenantId, id, roles);
          if (invite) {
            const user = await em.findOneOrFail(AuthUser, { id });
            await sendInvite(user);
            audit(em, id, 'users.user.invited');
            await em.flush();
          }
        });
      });
      return service.get(id, input.tenantId === undefined ? {} : { tenantId: input.tenantId });
    },

    async update(input) {
      await asActor(input.actorId, () =>
        runInTransaction(db, async (em) => {
          const user = await findUser(em, input.userId, input.tenantId);
          if (input.name !== undefined || input.email !== undefined)
            await refuseManaged(em, user.id, input.overrideExternal);
          const data: { name?: string; email?: string } = {};
          if (input.name !== undefined && input.name.trim() !== user.name) data.name = input.name.trim();
          const email = input.email === undefined ? undefined : emailOf(input.email);
          if (email !== undefined && email !== user.email) {
            if ((await em.count(AuthUser, { email })) > 0) emailTaken();
            data.email = email;
          }
          if (Object.keys(data).length === 0) return;
          await em.nativeUpdate(
            AuthUser,
            { id: user.id },
            { ...data, ...(data.email === undefined ? {} : { emailVerified: false }), updatedAt: new Date() },
          );
          audit(em, user.id, 'users.user.updated', { fields: Object.keys(data) });
          await em.flush();
          if (data.email !== undefined && mailOf(auth).sendVerification !== undefined) {
            await auth.api.sendVerificationEmail({ body: { email: data.email } });
          }
        }),
      );
      return service.get(input.userId, input.tenantId === undefined ? {} : { tenantId: input.tenantId });
    },

    disable: (input) => disableUser(db, input),
    enable: (input) => enableUser(db, input),

    async remove(input) {
      refuseSelf(input.actorId, input.userId);
      await asActor(input.actorId, () =>
        runInTransaction(db, async (em) => {
          await keepLastAdmin(em, db.dialect, input.userId);
          const user = await findUser(em, input.userId);
          const userId = user.id;
          await revokeLinks(em, userId);
          await em.nativeDelete(AuthSession, { userId });
          await em.nativeDelete(AuthAccount, { userId });
          await em.nativeDelete(AuthUserRole, { userId });
          await em.nativeDelete(AuthUserGroup, { userId });
          await em.nativeDelete(AuthTwoFactor, { userId });
          await em.nativeDelete(AuthPasskey, { userId });
          await em.nativeDelete(AuthApiKey, { referenceId: userId });
          await em.nativeUpdate(
            AuthUser,
            { id: userId },
            {
              email: `deleted-${userId}@invalid`,
              name: '',
              image: null,
              source: 'local',
              externalId: null,
              twoFactorEnabled: false,
              deletedAt: new Date(),
              updatedAt: new Date(),
            },
          );
          audit(em, userId, 'users.user.deleted');
          await em.flush();
        }),
      );
    },

    sessions: (userId) =>
      runInUnitOfWork(db, async (em) => {
        const user = await findUser(em, userId);
        const rows = await liveSessions(em, user.id);
        return rows.map((row) => ({
          id: row.id,
          ipAddress: textOrNull(row.ipAddress),
          userAgent: textOrNull(row.userAgent),
          createdAt: new Date(row.createdAt).toISOString(),
          lastUsedAt: new Date(row.updatedAt).toISOString(),
        }));
      }),

    revokeSession: (input) =>
      asActor(input.actorId, () =>
        runInTransaction(db, async (em) => {
          const user = await findUser(em, input.userId);
          if (!isUuid(input.sessionId)) return false;
          const removed = await em.nativeDelete(AuthSession, { id: input.sessionId.toLowerCase(), userId: user.id });
          if (removed === 0) return false;
          audit(em, user.id, 'users.user.sessions-revoked', { count: removed, sessionId: input.sessionId });
          await em.flush();
          return true;
        }),
      ),

    revokeSessions: (input) =>
      asActor(input.actorId, () =>
        runInTransaction(db, async (em) => {
          const user = await findUser(em, input.userId);
          const removed = await em.nativeDelete(AuthSession, { userId: user.id });
          audit(em, user.id, 'users.user.sessions-revoked', { count: removed });
          await em.flush();
          return removed;
        }),
      ),

    async sendPasswordReset(input) {
      const send = mailOf(auth).sendResetPassword ?? mailUnavailable();
      await runInUnitOfWork(db, (em) => findUser(em, input.userId));
      await limit('reset', input);
      await asActor(input.actorId, () =>
        runInTransaction(db, async (em) => {
          const user = await findUser(em, input.userId);
          const link = await resetLink(user.id, RESET_TTL_SECONDS);
          await send({ to: user.email, ...link });
          audit(em, user.id, 'users.user.password-reset-sent');
          await em.flush();
        }),
      );
    },

    async resendInvite(input) {
      const user = await runInUnitOfWork(db, (em) => findUser(em, input.userId));
      if (statusOf(user) !== 'invited') {
        throw authError(
          'USERS_NOT_INVITED',
          409,
          'The user is not waiting for an invitation.',
          'Send a password reset instead.',
        );
      }
      await limit('invite', input);
      await asActor(input.actorId, () =>
        runInTransaction(db, async (em) => {
          await revokeLinks(em, user.id);
          await sendInvite(user);
          audit(em, user.id, 'users.user.invited', { resent: true });
          await em.flush();
        }),
      );
    },

    async resetMfa(input) {
      refuseSelf(input.actorId, input.userId);
      await runInUnitOfWork(db, (em) => findUser(em, input.userId));
      await limit('mfa-reset', input);
      await asActor(input.actorId, () =>
        runInTransaction(db, async (em) => {
          const user = await findUser(em, input.userId);
          await em.nativeDelete(AuthTwoFactor, { userId: user.id });
          await em.nativeDelete(AuthPasskey, { userId: user.id });
          await em.nativeDelete(AuthSession, { userId: user.id });
          await em.nativeUpdate(AuthUser, { id: user.id }, { twoFactorEnabled: false, updatedAt: new Date() });
          audit(em, user.id, 'users.user.mfa-reset');
          await em.flush();
          await mailOf(auth).sendMfaReset?.({ to: user.email });
        }),
      );
    },
    async setGroups(input) {
      const groups = groupsOf(input.groups, input.groupIds);
      await asActor(input.actorId, () =>
        runInTransaction(db, async (em) => {
          const user = await findUser(em, input.userId, undefined, input.groupIds);
          const current = (await em.find(AuthUserGroup, { userId: user.id })).map((row) => row.groupId);
          const added = groups.filter((group) => !current.includes(group));
          const removed = current.filter((group) => !groups.includes(group));
          if (added.length === 0 && removed.length === 0) return;
          if (removed.length > 0) await em.nativeDelete(AuthUserGroup, { userId: user.id, groupId: { $in: removed } });
          for (const group of added) em.create(AuthUserGroup, { userId: user.id, groupId: group });
          audit(em, user.id, 'users.user.groups-changed', { added, removed });
          await em.flush();
        }),
      );
      return service.get(input.userId);
    },

    async upsertExternalUser(input) {
      const source = sourceOf(input);
      const externalId = input.externalId.trim();
      const email = emailOf(input.email);
      const name = input.name.trim();
      const id = await asActor(null, () =>
        runInTransaction(db, async (em) => {
          const found = await em.findOne(AuthUser, { source, externalId, deletedAt: null });
          const now = new Date();
          if (found === null) {
            if ((await em.count(AuthUser, { email })) > 0) emailTaken();
            const created = uuid7();
            // The provider has verified the address, and the user has no password: the only way in is the provider.
            em.create(AuthUser, {
              id: created,
              name,
              email,
              emailVerified: true,
              source,
              externalId,
              createdAt: now,
              updatedAt: now,
            });
            await em.flush();
            audit(em, created, 'users.user.created', { provider: source, externalId });
            await em.flush();
            if (input.disabled === true) {
              const row = await em.findOneOrFail(AuthUser, { id: created });
              await setManagedState(em, db.dialect, row, true, 'provider');
            }
            return created;
          }
          const data: { name?: string; email?: string } = {};
          if (name !== found.name) data.name = name;
          if (email !== found.email) {
            if ((await em.count(AuthUser, { email, id: { $ne: found.id } })) > 0) emailTaken();
            data.email = email;
          }
          if (Object.keys(data).length > 0) {
            await em.nativeUpdate(AuthUser, { id: found.id }, { ...data, updatedAt: now });
            audit(em, found.id, 'users.user.updated', { fields: Object.keys(data), provider: source });
            await em.flush();
          }
          if (input.disabled !== undefined) await setManagedState(em, db.dialect, found, input.disabled, 'provider');
          return found.id;
        }),
      );
      return service.get(id, input.tenantId === undefined ? {} : { tenantId: input.tenantId });
    },

    async setExternalDisabled(input) {
      const source = sourceOf(input);
      return asActor(null, () =>
        runInTransaction(db, async (em) => {
          const user = await em.findOne(AuthUser, { source, externalId: input.externalId.trim(), deletedAt: null });
          if (user === null) return notFound();
          return setManagedState(em, db.dialect, user, input.disabled, input.reason ?? 'provider');
        }),
      );
    },
  };
  return service;
}
