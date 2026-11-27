/**
 * BieberKit
 *
 * @file        packages/auth/src/index.ts
 * @description Public entry point of @bieberkit/auth.
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

/** npm name of this package. */
export const packageName = '@bieberkit/auth';

export { buildAbility, explainCondition } from './ability.ts';
export type {
  Ability,
  AbilityInput,
  AbilityUser,
  AccessAnswer,
  Condition,
  EntityShape,
  ScopedPermission,
} from './ability.ts';
export { API_KEY_PREFIX, createApiKey, revokeApiKey } from './api-keys.ts';
export type { ApiKeyInput, CreatedApiKey } from './api-keys.ts';
export { createAuthenticator } from './authenticator.ts';
export { createAuth, limiterOf, mailOf, pagesOf } from './better-auth.ts';
export type {
  AuthApiKeys,
  AuthInstance,
  AuthLimits,
  AuthMail,
  AuthMailOptions,
  AuthPages,
  AuthSecondaryStorage,
  BetterAuthOptions,
  CreateAuthOptions,
  Limit,
  Limit2,
} from './better-auth.ts';
export { checkAuthDrift, driftEntities } from './drift.ts';
export type { DriftEntity, DriftProperty } from './drift.ts';
export { recordImpersonationEnd, recordImpersonationStart } from './impersonation.ts';
export type { ImpersonationEntry } from './impersonation.ts';
export { checkScopedPermissions } from './check-conditions.ts';
export type { ConditionFinding } from './check-conditions.ts';
export { createAuthorizer } from './authorizer.ts';
export { ADMIN_ROLE_NAME } from './admin-guard.ts';
export {
  assignRole,
  assignRoles,
  createRole,
  deleteRole,
  duplicateRole,
  effectivePermissions,
  getRole,
  listMembers,
  revokeRole,
  revokeRoles,
  setRolePermissions,
  updateRole,
} from './role-service.ts';
export type {
  Assignment,
  BatchAssignment,
  BatchResult,
  EffectivePermission,
  MemberPage,
  NewRole,
  RoleMember,
  RoleView,
} from './role-service.ts';
export { createUserService, disableUser, enableUser } from './user-service.ts';
export type {
  DisableUserInput,
  EnableUserInput,
  NewUser,
  UserAction,
  ExternalDisabled,
  ExternalIdentity,
  ExternalUser,
  UserChange,
  UserDetail,
  UserListQuery,
  UserPage,
  UserRecord,
  UserService,
  UserServiceOptions,
  UserSession,
  UserSort,
  UserStatus,
} from './user-service.ts';
export { registerAuthRoutes } from './routes.ts';
export type { AuthRoutesOptions } from './routes.ts';
export {
  AuthAccount,
  AuthApiKey,
  AuthPasskey,
  AuthRateLimit,
  AuthSession,
  AuthTwoFactor,
  AuthUser,
  AuthVerification,
} from './tables.ts';
export type {
  AuthAccountRow,
  AuthApiKeyRow,
  AuthPasskeyRow,
  AuthRateLimitRow,
  AuthSessionRow,
  AuthTwoFactorRow,
  AuthUserRow,
  AuthVerificationRow,
} from './tables.ts';
export { createTenantResolver } from './tenant.ts';
export type { TenantResolverOptions } from './tenant.ts';
export type { AccessAuthorizer, AuthorizerOptions } from './authorizer.ts';
export { limitActor } from './limits.ts';
export { AuthError, AuthzError, authError, authzError } from './errors.ts';
export { buildPermissionRegistry } from './registry.ts';
export type { Action, MaskedField, PermissionEntry, PermissionRegistry } from './registry.ts';
export {
  AUTH_PLUGIN,
  AuthRole,
  AuthRolePermission,
  AuthUserGroup,
  AuthUserRole,
  authEntities,
  authMigrationSteps,
  loadGrants,
  manageScope,
  restrictedRoleLookup,
  NIL_TENANT,
} from './roles.ts';
export type {
  AuthUserGroupRow,
  AuthRolePermissionRow,
  AuthRoleRow,
  AuthUserRoleRow,
  GrantLoader,
  Grants,
} from './roles.ts';

export {
  DEFAULT_POLICY,
  checkMfa,
  checkNetwork,
  checkSession,
  defaultPolicyReader,
  isCidr,
  policyOf,
  securitySettings,
} from './policy.ts';
export type {
  MfaPolicy,
  MfaVerdict,
  NetworkPolicy,
  PolicyReader,
  SecurityPolicy,
  SessionPolicy,
  SessionVerdict,
  SignInPolicy,
} from './policy.ts';
export { auditNetworkDenied } from './authenticator.ts';
export type { AuthenticatorOptions } from './authenticator.ts';

import type { ScopedPermission } from './ability.ts';
import type { AuthInstance as ServiceAuth } from './better-auth.ts';

declare module '@bieberkit/core' {
  interface ModuleContributions {
    /** The permissions of the module that carry a condition, by permission string (AUTHZ-02). */
    scopedPermissions?: Readonly<Record<string, ScopedPermission>>;
  }
}

declare module '@bieberkit/core' {
  interface ServiceRegistry {
    /** Better Auth over the database of the process: sign up, sign in and the session API. The server registers it for every role. */
    auth: ServiceAuth;
    /** Every permission string that the project knows: those of its entities, its routes and its plugins, sorted. The administrator role gets all of them. */
    permissions: readonly string[];
  }
}
