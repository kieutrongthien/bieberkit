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
import { Auth, BetterAuthOptions, BetterAuthOptions as BetterAuthOptions$1 } from "better-auth";
import { Authenticator, HttpServer, TenantResolver } from "@bieberkit/http";
import { BkError, Dialect } from "@bieberkit/core";
import { C as ScopedPermission, D as PermissionEntry, E as MaskedField, O as PermissionRegistry, S as EntityShape, T as Action, _ as Ability, a as AuthRolePermission, b as AccessAnswer, c as AuthUserRole, d as Grants, f as NIL_TENANT, g as AUTH_PLUGIN, h as loadGrants, i as AuthRole, k as buildPermissionRegistry, l as AuthUserRoleRow, m as authMigrationSteps, n as AuthorizerOptions, o as AuthRolePermissionRow, p as authEntities, r as createAuthorizer, s as AuthRoleRow, t as AccessAuthorizer, u as GrantLoader, v as AbilityInput, w as buildAbility, x as Condition, y as AbilityUser } from "./authorizer-DnBhrCWS.js";
import { Database } from "@bieberkit/data/orm";
import { EntitySchema } from "@mikro-orm/core";
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
interface CreateAuthOptions {
  readonly db: Database;
  readonly dialect: Dialect;
  readonly secret: string;
  readonly baseUrl: string;
  readonly trustedOrigins?: readonly string[];
  readonly limits?: AuthLimits;
  readonly mail?: {
    sendVerification?(mail: AuthMail): Promise<void>;
    sendResetPassword?(mail: AuthMail): Promise<void>;
  };
}
type AuthInstance = Auth;
export declare function limiterOf(auth: AuthInstance): RateLimiter | undefined;
export declare function createAuth(options: CreateAuthOptions): AuthInstance;
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
interface AuthRoutesOptions {
  readonly auth: AuthInstance;
  readonly db: Database;
  readonly prefix?: string;
}
export declare function registerAuthRoutes(server: HttpServer, options: AuthRoutesOptions): void;
interface AuthUserRow {
  id: string;
  name: string;
  email: string;
  emailVerified: boolean;
  image?: string | null;
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
export { AUTH_PLUGIN, type Ability, type AbilityInput, type AbilityUser, type AccessAnswer, type AccessAuthorizer, type Action, type AuthAccountRow, type AuthInstance, type AuthLimits, type AuthMail, type AuthRateLimitRow, AuthRole, AuthRolePermission, type AuthRolePermissionRow, type AuthRoleRow, type AuthRoutesOptions, type AuthSessionRow, AuthUserRole, type AuthUserRoleRow, type AuthUserRow, type AuthVerificationRow, type AuthorizerOptions, type BetterAuthOptions, type Condition, type CreateAuthOptions, type DriftEntity, type DriftProperty, type EntityShape, type GrantLoader, type Grants, type Limit, type Limit2, type MaskedField, NIL_TENANT, type PermissionEntry, type PermissionRegistry, type ScopedPermission, type TenantResolverOptions, authEntities, authMigrationSteps, buildAbility, buildPermissionRegistry, createAuthorizer, loadGrants };
```
