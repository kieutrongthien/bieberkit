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
import { BkError } from "@bieberkit/core";
import { C as ScopedPermission, D as PermissionEntry, E as MaskedField, O as PermissionRegistry, S as EntityShape, T as Action, _ as Ability, a as AuthRole, b as AccessAnswer, c as AuthRoleRow, d as GrantLoader, f as Grants, g as loadGrants, h as authMigrationSteps, i as AUTH_PLUGIN, k as buildPermissionRegistry, l as AuthUserRole, m as authEntities, n as AuthorizerOptions, o as AuthRolePermission, p as NIL_TENANT, r as createAuthorizer, s as AuthRolePermissionRow, t as AccessAuthorizer, u as AuthUserRoleRow, v as AbilityInput, w as buildAbility, x as Condition, y as AbilityUser } from "./authorizer-BoG804Wo.js";
export declare class AuthzError extends BkError {}
export declare function authzError(code: string, status: number, message: string, fix: string): AuthzError;
export declare const packageName = "@bieberkit/auth";
declare module "@bieberkit/core" {
  interface ModuleContributions {
    scopedPermissions?: Readonly<Record<string, ScopedPermission>>;
  }
}
export { AUTH_PLUGIN, type Ability, type AbilityInput, type AbilityUser, type AccessAnswer, type AccessAuthorizer, type Action, AuthRole, AuthRolePermission, type AuthRolePermissionRow, type AuthRoleRow, AuthUserRole, type AuthUserRoleRow, type AuthorizerOptions, type Condition, type EntityShape, type GrantLoader, type Grants, type MaskedField, NIL_TENANT, type PermissionEntry, type PermissionRegistry, type ScopedPermission, authEntities, authMigrationSteps, buildAbility, buildPermissionRegistry, createAuthorizer, loadGrants };
```
