<!--
  BieberKit

  @file        packages/auth/api/index.api.md
  @description API report of @bieberkit/auth: its public surface, checked in CI and reviewed in pull requests.
  @author      Bieber Kieu <kieutrongthien@gmail.com>
  @generated   pnpm api:update
  @copyright   Copyright (c) 2026 Bieber Kieu
  @license     Apache-2.0

  Licensed under the Apache License, Version 2.0 (the "License");
  you may not use this file except in compliance with the License.
  You may obtain a copy of the License at

      http://www.apache.org/licenses/LICENSE-2.0

  Unless required by applicable law or agreed to in writing, software
  distributed under the License is distributed on an "AS IS" BASIS,
  WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
  See the License for the specific language governing permissions and
  limitations under the License.

  SPDX-License-Identifier: Apache-2.0
-->

# API report: @bieberkit/auth

Generated from the built declaration files by `pnpm api:update`. Do not edit by hand. A change here is a change to the public API and needs a changeset (spec section 22.3).

```ts
import "@bieberkit/data";
import { A as Action, C as AbilityUser, D as ScopedPermission, E as EntityShape, M as PermissionEntry, N as PermissionRegistry, O as buildAbility, P as buildPermissionRegistry, S as AbilityInput, T as Condition, _ as loadGrants, a as AuthRolePermission, b as AUTH_PLUGIN, c as AuthUserGroup, d as AuthUserRoleRow, f as GrantLoader, g as authMigrationSteps, h as authEntities, i as AuthRole, j as MaskedField, k as explainCondition, l as AuthUserGroupRow, m as NIL_TENANT, n as AuthorizerOptions, o as AuthRolePermissionRow, p as Grants, r as createAuthorizer, s as AuthRoleRow, t as AccessAuthorizer, u as AuthUserRole, v as manageScope, w as AccessAnswer, x as Ability, y as restrictedRoleLookup } from "./authorizer-CAQRsGSc.js";
import { Auth, BetterAuthOptions, BetterAuthOptions as BetterAuthOptions$1 } from "better-auth";
import { Authenticator, HttpServer, TenantResolver } from "@bieberkit/http";
import { BkError, Dialect, SettingDef } from "@bieberkit/core";
import { Database } from "@bieberkit/data/orm";
import { EntityDef as EntityDef$1 } from "@bieberkit/data/schema";
import { EntityManager, EntitySchema, OptionalProps } from "@mikro-orm/core";
interface Limit {
  readonly window: number;
  readonly max: number;
}
interface Limit2 {
  readonly perIp?: Limit;
  readonly perAccount?: Limit;
}
interface AuthLimits {
  readonly signIn?: Limit2;
  readonly signUp?: Limit2;
  readonly passwordReset?: Limit2;
  readonly magicLink?: Limit2;
  readonly mfa?: Limit2;
}
interface Consumption {
  readonly key: string;
  readonly rule: Limit;
}
interface ConsumeResult {
  readonly allowed: boolean;
  readonly retryAfter: number | null;
}
interface RateStorage {
  consume(key: string, rule: Limit): Promise<ConsumeResult>;
}
interface RateLimiter {
  readonly storage: RateStorage;
  capture<T>(run: () => Promise<T>): Promise<{
    readonly value: T;
    readonly consumed: readonly Consumption[];
  }>;
  replay(consumed: readonly Consumption[]): Promise<void>;
}
export declare function limitActor(db: Database, input: {
  readonly action: string;
  readonly actorId: string | null | undefined;
  readonly rule: Limit;
}): Promise<void>;
interface SessionPolicy {
  readonly idleMinutes: number;
  readonly absoluteHours: number;
  readonly maxConcurrent: number;
}
interface MfaPolicy {
  readonly requiredForAll: boolean;
  readonly graceDays: number;
  readonly since: Date | null;
}
interface NetworkPolicy {
  readonly adminAllowlist: readonly string[];
}
interface SignInPolicy {
  readonly notifyNewDevice: boolean;
}
interface SecurityPolicy {
  readonly session: SessionPolicy;
  readonly mfa: MfaPolicy;
  readonly network: NetworkPolicy;
  readonly signIn: SignInPolicy;
}
export declare const DEFAULT_POLICY: SecurityPolicy;
interface PolicyReader {
  read(context: {
    readonly tenantId?: string;
  }): Promise<SecurityPolicy>;
}
export declare const defaultPolicyReader: PolicyReader;
export declare function isCidr(range: string): boolean;
export declare function checkNetwork(allowlist: readonly string[], ip: string): boolean;
type SessionVerdict = "ok" | "idle" | "absolute";
export declare function checkSession(policy: SessionPolicy, session: {
  readonly createdAt: Date;
  readonly lastSeenAt: Date;
  readonly now: Date;
}): SessionVerdict;
type MfaVerdict = {
  readonly status: "ok";
} | {
  readonly status: "grace";
  readonly enrolBy: Date;
} | {
  readonly status: "enrol";
};
export declare function checkMfa(policy: MfaPolicy, user: {
  readonly mfa: boolean;
  readonly createdAt: Date;
  readonly now: Date;
}): MfaVerdict;
export declare const securitySettings: readonly SettingDef[];
export declare function policyOf(read: (def: SettingDef) => unknown): SecurityPolicy;
interface AuthMail {
  readonly to: string;
  readonly url: string;
  readonly token: string;
}
interface AuthApiKeys {
  readonly defaultExpiresInDays?: number;
  readonly maxExpiresInDays?: number;
  readonly rateLimit?: {
    readonly window: number;
    readonly max: number;
  };
}
interface AuthMethods {
  readonly totp?: {
    readonly issuer: string;
  };
  readonly passkey?: {
    readonly rpName: string;
    readonly rpId?: string;
  };
  readonly magicLink?: {
    send(mail: AuthMail): Promise<void>;
    readonly expiresIn?: number;
  };
}
interface CreateAuthOptions {
  readonly db: Database;
  readonly policy?: PolicyReader;
  readonly dialect: Dialect;
  readonly secret: string;
  readonly baseUrl: string;
  readonly trustedOrigins?: readonly string[];
  readonly previousSecrets?: readonly string[];
  readonly limits?: AuthLimits;
  readonly secondaryStorage?: AuthSecondaryStorage;
  readonly apiKeys?: AuthApiKeys;
  readonly methods?: AuthMethods;
  readonly mail?: AuthMailOptions;
}
interface AuthMailOptions {
  readonly sendVerification?: (mail: AuthMail) => Promise<void>;
  readonly sendResetPassword?: (mail: AuthMail) => Promise<void>;
  readonly sendInvite?: (mail: AuthMail) => Promise<void>;
  readonly sendMfaReset?: (notice: {
    readonly to: string;
  }) => Promise<void>;
  readonly sendNewDevice?: (notice: {
    readonly to: string;
    readonly device: string;
    readonly ip: string;
    readonly at: Date;
  }) => Promise<void>;
}
type AuthInstance = Auth;
type AuthSecondaryStorage = NonNullable<BetterAuthOptions["secondaryStorage"]>;
export declare function mailOf(auth: AuthInstance): AuthMailOptions;
export declare function limiterOf(auth: AuthInstance): RateLimiter | undefined;
export declare function createAuth(options: CreateAuthOptions): AuthInstance;
export declare const API_KEY_PREFIX = "bk_";
interface ApiKeyInput {
  readonly userId: string;
  readonly tenantId?: string;
  readonly name: string;
  readonly permissions: readonly string[];
  readonly expiresInDays?: number;
}
interface CreatedApiKey {
  readonly id: string;
  readonly key: string;
  readonly expiresAt: string;
}
export declare function createApiKey(auth: AuthInstance, db: Database, input: ApiKeyInput): Promise<CreatedApiKey>;
export declare function revokeApiKey(db: Database, input: {
  readonly id: string;
}): Promise<void>;
interface AuthenticatorOptions {
  readonly policy?: PolicyReader;
  readonly restricted?: (userId: string) => Promise<boolean>;
  readonly onDenied?: (event: {
    readonly userId: string;
    readonly ip: string;
  }) => void | Promise<void>;
  readonly clock?: () => Date;
}
export declare function auditNetworkDenied(db: Database): NonNullable<AuthenticatorOptions["onDenied"]>;
export declare function createAuthenticator(auth: AuthInstance, options?: AuthenticatorOptions): Authenticator;
interface DriftProperty {
  nullable?: boolean;
  unique?: boolean;
}
interface DriftEntity {
  properties: Record<string, DriftProperty>;
}
export declare function driftEntities(db: Database): Record<string, DriftEntity>;
export declare function checkAuthDrift(options: BetterAuthOptions$1, entities: Record<string, DriftEntity>): string[];
interface ImpersonationEntry {
  readonly actorId: string;
  readonly targetId: string;
  readonly tenantId?: string;
  readonly reason?: string;
}
export declare function recordImpersonationStart(em: EntityManager, entry: ImpersonationEntry): void;
export declare function recordImpersonationEnd(em: EntityManager, entry: ImpersonationEntry): void;
interface ConditionFinding {
  readonly permission: string;
  readonly code: "SUBJECT_UNKNOWN" | "ACTION_INVALID" | "CONDITION_THROWS" | "CONDITION_NOT_ALLOWED";
  readonly message: string;
  readonly fix: string;
}
export declare function checkScopedPermissions(scoped: Readonly<Record<string, ScopedPermission>>, entities: readonly EntityDef$1<string>[]): ConditionFinding[];
export declare const ADMIN_ROLE_NAME = "admin";
interface NewRole {
  readonly tenantId?: string;
  readonly name: string;
  readonly permissions?: readonly string[];
  readonly requireMfa?: boolean;
  readonly ipRestricted?: boolean;
  readonly system?: boolean;
}
interface Assignment {
  readonly tenantId?: string;
  readonly userId: string;
  readonly roleId: string;
  readonly groupId?: string;
}
interface BatchAssignment {
  readonly tenantId?: string;
  readonly roleId: string;
  readonly groupId?: string;
  readonly userIds: readonly string[];
}
interface BatchResult {
  readonly userId: string;
  readonly result: "assigned" | "revoked" | "unchanged" | "not_found" | "refused";
  readonly code?: string;
  readonly warning?: string;
}
interface RoleView {
  readonly id: string;
  readonly name: string;
  readonly system: boolean;
  readonly requireMfa: boolean;
  readonly ipRestricted: boolean;
  readonly permissions: readonly string[];
  readonly memberCount: number;
}
interface RoleMember {
  readonly id: string;
  readonly name: string;
  readonly email: string;
}
interface MemberPage {
  readonly data: readonly RoleMember[];
  readonly nextCursor: string | null;
  readonly pageSize: number;
}
interface EffectivePermission {
  readonly permission: string;
  readonly roles: readonly {
    readonly id: string;
    readonly name: string;
  }[];
  readonly condition?: Condition;
}
export declare function createRole(db: Database, input: NewRole): Promise<string>;
export declare function duplicateRole(db: Database, roleId: string, input: {
  readonly name: string;
}): Promise<string>;
export declare function setRolePermissions(db: Database, roleId: string, permissions: readonly string[]): Promise<boolean>;
export declare function updateRole(db: Database, roleId: string, changes: {
  readonly name?: string;
  readonly requireMfa?: boolean;
  readonly ipRestricted?: boolean;
}): Promise<boolean>;
export declare function deleteRole(db: Database, roleId: string, options?: {
  readonly reassignTo?: string;
}): Promise<void>;
export declare function assignRole(db: Database, input: Assignment): Promise<boolean>;
export declare function revokeRole(db: Database, input: Assignment): Promise<boolean>;
export declare function assignRoles(db: Database, input: BatchAssignment): Promise<{
  readonly results: BatchResult[];
}>;
export declare function revokeRoles(db: Database, input: BatchAssignment): Promise<{
  readonly results: BatchResult[];
}>;
export declare function getRole(db: Database, roleId: string, options?: {
  readonly tenantId?: string;
}): Promise<RoleView>;
export declare function listMembers(db: Database, roleId: string, options?: {
  readonly tenantId?: string;
  readonly pageSize?: unknown;
  readonly cursor?: string;
}): Promise<MemberPage>;
export declare function effectivePermissions(db: Database, input: {
  readonly userId: string;
  readonly tenantId?: string;
  readonly scoped?: Readonly<Record<string, ScopedPermission>>;
}): Promise<EffectivePermission[]>;
interface AuthUserRow {
  [OptionalProps]?: "source";
  id: string;
  name: string;
  email: string;
  emailVerified: boolean;
  image?: string | null;
  twoFactorEnabled?: boolean | null;
  disabledAt?: Date | null;
  disabledReason?: string | null;
  disabledBy?: string | null;
  source: string;
  externalId?: string | null;
  lastSignInAt?: Date | null;
  deletedAt?: Date | null;
  createdAt: Date;
  updatedAt: Date;
}
interface AuthSessionRow {
  id: string;
  userId: string;
  token: string;
  expiresAt: Date;
  ipAddress?: string | null;
  userAgent?: string | null;
  createdAt: Date;
  updatedAt: Date;
}
interface AuthAccountRow {
  id: string;
  userId: string;
  externalId: string;
  providerId: string;
  accessToken?: string | null;
  refreshToken?: string | null;
  idToken?: string | null;
  accessTokenExpiresAt?: Date | null;
  refreshTokenExpiresAt?: Date | null;
  scope?: string | null;
  password?: string | null;
  createdAt: Date;
  updatedAt: Date;
}
interface AuthVerificationRow {
  id: string;
  identifier: string;
  value: string;
  expiresAt: Date;
  createdAt: Date;
  updatedAt: Date;
}
interface AuthTwoFactorRow {
  id: string;
  userId: string;
  secret: string;
  backupCodes: string;
  verified?: boolean | null;
  failedVerificationCount?: number | null;
  lockedUntil?: Date | null;
}
interface AuthPasskeyRow {
  id: string;
  userId: string;
  name?: string | null;
  publicKey: string;
  credentialID: string;
  counter: number;
  deviceType: string;
  backedUp: boolean;
  transports?: string | null;
  createdAt?: Date | null;
  aaguid?: string | null;
}
interface AuthApiKeyRow {
  id: string;
  configId: string;
  name?: string | null;
  start?: string | null;
  referenceId: string;
  prefix?: string | null;
  key: string;
  refillInterval?: number | null;
  refillAmount?: number | null;
  lastRefillAt?: Date | null;
  enabled?: boolean | null;
  rateLimitEnabled?: boolean | null;
  rateLimitTimeWindow?: number | null;
  rateLimitMax?: number | null;
  requestCount?: number | null;
  remaining?: number | null;
  lastRequest?: Date | null;
  expiresAt?: Date | null;
  createdAt: Date;
  updatedAt: Date;
  permissions?: string | null;
  metadata?: string | null;
}
interface AuthRateLimitRow {
  id: string;
  key: string;
  count: number;
  lastRequest: number;
}
export declare const AuthUser: EntitySchema<AuthUserRow>;
export declare const AuthSession: EntitySchema;
export declare const AuthAccount: EntitySchema;
export declare const AuthVerification: EntitySchema<AuthVerificationRow>;
export declare const AuthRateLimit: EntitySchema<AuthRateLimitRow>;
export declare const AuthTwoFactor: EntitySchema;
export declare const AuthPasskey: EntitySchema;
export declare const AuthApiKey: EntitySchema;
interface DisableUserInput {
  readonly userId: string;
  readonly reason: string;
  readonly actorId: string | null;
  readonly overrideExternal?: boolean;
}
interface EnableUserInput {
  readonly userId: string;
  readonly actorId: string | null;
  readonly overrideExternal?: boolean;
}
type UserStatus = "active" | "disabled" | "invited";
type UserSort = "createdAt" | "-createdAt" | "name" | "-name" | "email" | "-email";
interface UserRecord {
  readonly id: string;
  readonly name: string;
  readonly email: string;
  readonly emailVerified: boolean;
  readonly status: UserStatus;
  readonly source: string;
  readonly roles: readonly {
    readonly id: string;
    readonly name: string;
  }[];
  readonly mfaEnabled: boolean;
  readonly lastSignInAt: string | null;
  readonly createdAt: string;
}
interface UserDetail extends UserRecord {
  readonly activeSessions: number;
  readonly groups: readonly string[];
}
interface UserListQuery {
  readonly tenantId?: string;
  readonly q?: string;
  readonly role?: string;
  readonly status?: UserStatus;
  readonly emailVerified?: boolean;
  readonly createdFrom?: string;
  readonly createdTo?: string;
  readonly sort?: UserSort;
  readonly pageSize?: unknown;
  readonly cursor?: string;
  readonly withTotal?: boolean;
  readonly groupIds?: readonly string[];
}
interface UserPage {
  readonly data: readonly UserRecord[];
  readonly nextCursor: string | null;
  readonly pageSize: number;
  readonly total?: number;
}
interface UserSession {
  readonly id: string;
  readonly ipAddress: string | null;
  readonly userAgent: string | null;
  readonly createdAt: string;
  readonly lastUsedAt: string;
}
interface NewUser {
  readonly name: string;
  readonly email: string;
  readonly password?: string;
  readonly invite?: boolean;
  readonly roles?: readonly string[];
  readonly groups?: readonly string[];
  readonly groupIds?: readonly string[];
  readonly tenantId?: string;
  readonly actorId: string | null;
}
interface UserChange {
  readonly userId: string;
  readonly name?: string;
  readonly email?: string;
  readonly tenantId?: string;
  readonly actorId: string | null;
  readonly overrideExternal?: boolean;
}
interface UserAction {
  readonly userId: string;
  readonly actorId: string | null;
}
interface UserServiceOptions {
  readonly db: Database;
  readonly auth: AuthInstance;
  readonly inviteTtlSeconds?: number;
  readonly limits?: {
    readonly perTarget?: Limit;
    readonly perActor?: Limit;
  };
  readonly rateStorage?: RateStorage;
}
interface UserService {
  list(query: UserListQuery): Promise<UserPage>;
  get(userId: string, options?: {
    readonly tenantId?: string;
    readonly groupIds?: readonly string[];
  }): Promise<UserDetail>;
  setGroups(input: UserAction & {
    readonly groups: readonly string[];
    readonly groupIds?: readonly string[];
  }): Promise<UserDetail>;
  create(input: NewUser): Promise<UserDetail>;
  update(input: UserChange): Promise<UserDetail>;
  disable(input: DisableUserInput): Promise<boolean>;
  enable(input: EnableUserInput): Promise<boolean>;
  remove(input: UserAction): Promise<void>;
  sessions(userId: string): Promise<UserSession[]>;
  revokeSession(input: UserAction & {
    readonly sessionId: string;
  }): Promise<boolean>;
  revokeSessions(input: UserAction): Promise<number>;
  sendPasswordReset(input: UserAction): Promise<void>;
  resendInvite(input: UserAction): Promise<void>;
  resetMfa(input: UserAction): Promise<void>;
  upsertExternalUser(input: ExternalUser): Promise<UserDetail>;
  setExternalDisabled(input: ExternalDisabled): Promise<boolean>;
}
interface ExternalIdentity {
  readonly source: string;
  readonly externalId: string;
}
interface ExternalUser extends ExternalIdentity {
  readonly name: string;
  readonly email: string;
  readonly disabled?: boolean;
  readonly tenantId?: string;
}
interface ExternalDisabled extends ExternalIdentity {
  readonly disabled: boolean;
  readonly reason?: string;
}
export declare function disableUser(db: Database, input: DisableUserInput): Promise<boolean>;
export declare function enableUser(db: Database, input: EnableUserInput): Promise<boolean>;
export declare function createUserService(options: UserServiceOptions): UserService;
interface AuthRoutesOptions {
  readonly auth: AuthInstance;
  readonly db: Database;
  readonly prefix?: string;
}
export declare function registerAuthRoutes(server: HttpServer, options: AuthRoutesOptions): void;
interface TenantResolverOptions {
  readonly db: Database;
}
export declare function createTenantResolver(options: TenantResolverOptions): TenantResolver;
export declare class AuthzError extends BkError {}
export declare function authzError(code: string, status: number, message: string, fix: string): AuthzError;
export declare class AuthError extends BkError {}
export declare function authError(code: string, status: number, message: string, fix: string): AuthError;
export declare const packageName = "@bieberkit/auth";
declare module "@bieberkit/core" {
  interface ModuleContributions {
    scopedPermissions?: Readonly<Record<string, ScopedPermission>>;
  }
}
declare module "@bieberkit/core" {
  interface ServiceRegistry {
    auth: AuthInstance;
    permissions: readonly string[];
  }
}
export { AUTH_PLUGIN, type Ability, type AbilityInput, type AbilityUser, type AccessAnswer, type AccessAuthorizer, type Action, type ApiKeyInput, type Assignment, type AuthAccountRow, type AuthApiKeyRow, type AuthApiKeys, type AuthInstance, type AuthLimits, type AuthMail, type AuthMailOptions, type AuthPasskeyRow, type AuthRateLimitRow, AuthRole, AuthRolePermission, type AuthRolePermissionRow, type AuthRoleRow, type AuthRoutesOptions, type AuthSecondaryStorage, type AuthSessionRow, type AuthTwoFactorRow, AuthUserGroup, type AuthUserGroupRow, AuthUserRole, type AuthUserRoleRow, type AuthUserRow, type AuthVerificationRow, type AuthenticatorOptions, type AuthorizerOptions, type BatchAssignment, type BatchResult, type BetterAuthOptions, type Condition, type ConditionFinding, type CreateAuthOptions, type CreatedApiKey, type DisableUserInput, type DriftEntity, type DriftProperty, type EffectivePermission, type EnableUserInput, type EntityShape, type ExternalDisabled, type ExternalIdentity, type ExternalUser, type GrantLoader, type Grants, type ImpersonationEntry, type Limit, type Limit2, type MaskedField, type MemberPage, type MfaPolicy, type MfaVerdict, NIL_TENANT, type NetworkPolicy, type NewRole, type NewUser, type PermissionEntry, type PermissionRegistry, type PolicyReader, type RoleMember, type RoleView, type ScopedPermission, type SecurityPolicy, type SessionPolicy, type SessionVerdict, type SignInPolicy, type TenantResolverOptions, type UserAction, type UserChange, type UserDetail, type UserListQuery, type UserPage, type UserRecord, type UserService, type UserServiceOptions, type UserSession, type UserSort, type UserStatus, authEntities, authMigrationSteps, buildAbility, buildPermissionRegistry, createAuthorizer, explainCondition, loadGrants, manageScope, restrictedRoleLookup };
```
