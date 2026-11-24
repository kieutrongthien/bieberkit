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
import { A as buildPermissionRegistry, C as ScopedPermission, D as MaskedField, E as Action, O as PermissionEntry, S as EntityShape, T as explainCondition, _ as Ability, a as AuthRolePermission, b as AccessAnswer, c as AuthUserRole, d as Grants, f as NIL_TENANT, g as AUTH_PLUGIN, h as loadGrants, i as AuthRole, k as PermissionRegistry, l as AuthUserRoleRow, m as authMigrationSteps, n as AuthorizerOptions, o as AuthRolePermissionRow, p as authEntities, r as createAuthorizer, s as AuthRoleRow, t as AccessAuthorizer, u as GrantLoader, v as AbilityInput, w as buildAbility, x as Condition, y as AbilityUser } from "./authorizer-B3QFV22q.js";
import { Auth, BetterAuthOptions, BetterAuthOptions as BetterAuthOptions$1 } from "better-auth";
import { Authenticator, HttpServer, TenantResolver } from "@bieberkit/http";
import { BkError, Dialect } from "@bieberkit/core";
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
  readonly dialect: Dialect;
  readonly secret: string;
  readonly baseUrl: string;
  readonly trustedOrigins?: readonly string[];
  readonly previousSecrets?: readonly string[];
  readonly limits?: AuthLimits;
  readonly secondaryStorage?: AuthSecondaryStorage;
  readonly apiKeys?: AuthApiKeys;
  readonly methods?: AuthMethods;
  readonly mail?: {
    sendVerification?(mail: AuthMail): Promise<void>;
    sendResetPassword?(mail: AuthMail): Promise<void>;
  };
}
type AuthInstance = Auth;
type AuthSecondaryStorage = NonNullable<BetterAuthOptions["secondaryStorage"]>;
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
export declare function createAuthenticator(auth: AuthInstance): Authenticator;
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
interface NewRole {
  readonly tenantId?: string;
  readonly name: string;
  readonly permissions?: readonly string[];
  readonly requireMfa?: boolean;
  readonly system?: boolean;
}
interface Assignment {
  readonly tenantId?: string;
  readonly userId: string;
  readonly roleId: string;
}
export declare function createRole(db: Database, input: NewRole): Promise<string>;
export declare function setRolePermissions(db: Database, roleId: string, permissions: readonly string[]): Promise<boolean>;
export declare function updateRole(db: Database, roleId: string, changes: {
  readonly name?: string;
  readonly requireMfa?: boolean;
}): Promise<boolean>;
export declare function deleteRole(db: Database, roleId: string): Promise<void>;
export declare function assignRole(db: Database, input: Assignment): Promise<boolean>;
export declare function revokeRole(db: Database, input: Assignment): Promise<boolean>;
interface DisableUserInput {
  readonly userId: string;
  readonly reason: string;
  readonly actorId: string | null;
}
interface EnableUserInput {
  readonly userId: string;
  readonly actorId: string | null;
}
export declare function disableUser(db: Database, input: DisableUserInput): Promise<boolean>;
export declare function enableUser(db: Database, input: EnableUserInput): Promise<boolean>;
interface AuthRoutesOptions {
  readonly auth: AuthInstance;
  readonly db: Database;
  readonly prefix?: string;
}
export declare function registerAuthRoutes(server: HttpServer, options: AuthRoutesOptions): void;
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
export { AUTH_PLUGIN, type Ability, type AbilityInput, type AbilityUser, type AccessAnswer, type AccessAuthorizer, type Action, type ApiKeyInput, type Assignment, type AuthAccountRow, type AuthApiKeyRow, type AuthApiKeys, type AuthInstance, type AuthLimits, type AuthMail, type AuthPasskeyRow, type AuthRateLimitRow, AuthRole, AuthRolePermission, type AuthRolePermissionRow, type AuthRoleRow, type AuthRoutesOptions, type AuthSecondaryStorage, type AuthSessionRow, type AuthTwoFactorRow, AuthUserRole, type AuthUserRoleRow, type AuthUserRow, type AuthVerificationRow, type AuthorizerOptions, type BetterAuthOptions, type Condition, type ConditionFinding, type CreateAuthOptions, type CreatedApiKey, type DisableUserInput, type DriftEntity, type DriftProperty, type EnableUserInput, type EntityShape, type GrantLoader, type Grants, type ImpersonationEntry, type Limit, type Limit2, type MaskedField, NIL_TENANT, type NewRole, type PermissionEntry, type PermissionRegistry, type ScopedPermission, type TenantResolverOptions, authEntities, authMigrationSteps, buildAbility, buildPermissionRegistry, createAuthorizer, explainCondition, loadGrants };
```
