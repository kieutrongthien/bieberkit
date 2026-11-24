<!--
  BieberKit

  @file        packages/auth/api/authorizer.api.md
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
import { AccessAnswer, AccessAnswer as AccessAnswer$1, Authorizer, HttpServer, Principal, RequestInfo } from "@bieberkit/http";
import { Database, OrmSchema } from "@bieberkit/data/orm";
import { EntityDef, PluginMigrationStep } from "@bieberkit/data";
import { EntitySchema } from "@mikro-orm/core";
type Action = "read" | "create" | "update" | "delete" | `transition:${string}`;
interface PermissionEntry {
  readonly permission: string;
  readonly subject: string;
  readonly action: Action;
  readonly field?: string;
  readonly fieldAccess?: "read" | "update";
}
interface MaskedField {
  readonly read?: string;
  readonly update?: string;
}
interface PermissionRegistry {
  readonly entries: readonly PermissionEntry[];
  entriesOf(permission: string): readonly PermissionEntry[];
  declares(permission: string): boolean;
  transitionPermission(entity: string, transition: string): string | undefined;
  maskedFields(entity: string): ReadonlyMap<string, MaskedField>;
}
declare function buildPermissionRegistry(entities: readonly EntityDef<string>[]): PermissionRegistry;
type Row = Record<string, unknown>;
type Condition = Record<string, unknown>;
interface AbilityUser {
  readonly id: string;
  readonly tenantId?: string;
}
interface ScopedPermission {
  readonly subject: string;
  readonly action: Action;
  when(user: AbilityUser): Condition;
}
interface EntityShape {
  readonly name: string;
  readonly properties: ReadonlySet<string>;
  readonly fields: readonly string[];
}
interface Ability {
  has(permission: string): boolean;
  covers(permission: string): boolean;
  access(entity: EntityShape, action: Action): AccessAnswer;
  allows(entity: EntityShape, action: Action, row: Row): boolean;
}
interface AbilityInput {
  readonly registry: PermissionRegistry;
  readonly granted: ReadonlySet<string>;
  readonly scoped?: Readonly<Record<string, ScopedPermission>>;
  readonly user: AbilityUser;
}
declare function explainCondition(condition: unknown, properties: ReadonlySet<string>, options?: {
  readonly oneOperator?: boolean;
}): string | undefined;
declare function buildAbility(input: AbilityInput): Ability;
declare const AUTH_PLUGIN = "@bieberkit/auth";
declare const NIL_TENANT = "00000000-0000-0000-0000-000000000000";
interface AuthRoleRow {
  id: string;
  tenant: string;
  name: string;
  system: boolean;
  requireMfa: boolean;
}
interface AuthRolePermissionRow {
  roleId: string;
  permission: string;
}
interface AuthUserRoleRow {
  tenant: string;
  userId: string;
  roleId: string;
}
declare const AuthRole: EntitySchema<AuthRoleRow>;
declare const AuthRolePermission: EntitySchema<AuthRolePermissionRow>;
declare const AuthUserRole: EntitySchema<AuthUserRoleRow>;
declare const authEntities: readonly EntitySchema[];
declare const authMigrationSteps: readonly PluginMigrationStep[];
interface Grants {
  readonly permissions: Set<string>;
  readonly roles: string[];
  readonly requireMfa: boolean;
}
type GrantLoader = (db: Database, tenantId: string | undefined, userId: string) => Promise<Grants>;
declare const loadGrants: GrantLoader;
interface AuthorizerOptions {
  readonly db: Database;
  readonly entities: readonly EntityDef<string>[];
  readonly schemas: readonly OrmSchema[];
  readonly scoped?: Readonly<Record<string, ScopedPermission>>;
  readonly grants?: GrantLoader;
}
interface AccessAuthorizer extends Authorizer {
  access(principal: Principal, entity: string, action: string, request: RequestInfo): Promise<AccessAnswer$1>;
  allows(principal: Principal, entity: string, action: string, row: Readonly<Record<string, unknown>>, request: RequestInfo): Promise<boolean>;
  install(server: HttpServer): void;
}
declare function createAuthorizer(options: AuthorizerOptions): AccessAuthorizer;
export { buildPermissionRegistry as A, ScopedPermission as C, MaskedField as D, Action as E, PermissionEntry as O, EntityShape as S, explainCondition as T, Ability as _, AuthRolePermission as a, AccessAnswer as b, AuthUserRole as c, Grants as d, NIL_TENANT as f, AUTH_PLUGIN as g, loadGrants as h, AuthRole as i, PermissionRegistry as k, AuthUserRoleRow as l, authMigrationSteps as m, AuthorizerOptions as n, AuthRolePermissionRow as o, authEntities as p, createAuthorizer as r, AuthRoleRow as s, AccessAuthorizer as t, GrantLoader as u, AbilityInput as v, buildAbility as w, Condition as x, AbilityUser as y };
```
