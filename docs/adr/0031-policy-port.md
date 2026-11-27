<!--
  BieberKit

  @file        docs/adr/0031-policy-port.md
  @description Decision record: the authenticator reads the security.* policies through a PolicyReader port that the server wires to the settings service.
  @author      Bieber Kieu <kieutrongthien@gmail.com>
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

# 0031. The authenticator reads policies through a `PolicyReader` port

- Status: Accepted
- Date: 2026-11-27
- Deciders: Bieber Kieu
- Requirements: POL-01 to POL-05, AUTH-05, SET-01, PKG-01, PKG-04, P1, P8

## Context

Slice S6 of [the design](../modules/base-plugins-complete.md) adds session, MFA and network policies that an administrator changes without a restart (decision 7). Each is a setting of group `security` (ADR 0030). The code that enforces them is `createAuthenticator` and the authorizer in `@bieberkit/auth`.

Constraints:

- **Layers (PKG-01).** `auth` is a contract package and `@bieberkit/plugin-settings` is above it. `auth` cannot import the plugin, so it cannot call `SettingsService`.
- **Declaration.** ADR 0030 lets `auth` declare `security.*` through `defineSetting` from core, so the keys, ranges and defaults live in `auth`. `auth` is not a module, so the server adds its declarations to the ones that it passes to the settings service.
- **Every request.** The policy is read on each authenticated request. It must be cheap and must fail closed when the value cannot be read for a network rule (POL-03).
- **Config (P8).** `process.env` is read only in `core/src/config`. Policies are settings, not env keys.
- **Today.** The authenticator builds its principal from the session alone, with no policy input.

## Options

| Option                                                                         | For                                                                                                       | Against                                                                                |
| ------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| A. A `PolicyReader` interface in `auth`; the server adapts `services.settings` | Respects the layers; no new dependency; one reader for all policies; testable with a plain object in auth | The server gains a small adapter; auth works with defaults when no reader is given     |
| B. `auth` imports `@bieberkit/plugin-settings`                                 | No adapter                                                                                                | Breaks PKG-01 (a contract imports a plugin); auth would need the plugin to exist       |
| C. The settings plugin wraps the authenticator after boot                      | Auth unchanged                                                                                            | Session limits need the session row and the sign-in hook, which only auth reaches (P1) |
| D. Policies as env keys                                                        | Simple, no port                                                                                           | Needs a restart, which decision 7 rules out; policies are not per tenant or per role   |

## Decision

Option A. `@bieberkit/auth` exports:

- `PolicyReader`: `read(ctx: { tenantId?: string }): Promise<SecurityPolicy>`, where `SecurityPolicy` is a plain, typed object (`session`, `mfa`, `network`, `signIn`) already validated against the declared ranges (POL-05).
- `securitySettings`: the `defineSetting` declarations of group `security`.
- `createAuthenticator(auth, { policy?, restricted?, onDenied?, clock? })` and the `policy` option of `createAuth`. Without a reader, the safe defaults of the design apply and a single person notices nothing.

`@bieberkit/server` builds the reader in `boot.ts` and `services.ts` from the `settings` service. The rules:

1. The authenticator reads the policy on each request and enforces it itself. The server adapter keeps a read for two seconds, because the settings are cached but eight reads per request would still be eight round trips. A change therefore shows within two seconds, with no restart (POL-01).
2. A per-role override of the session limits is resolved from the roles of the principal, and the strictest value wins. This part is not built in the first slice.
3. The adapter reads with `getStrict` of the settings service, which fails when the store cannot be read, where `get` gives the default. If a read fails, the last good policy is used, and with none the request fails. The network rule never opens because the store was down (POL-03).
4. A refusal throws a `BkError` with a stable code: `AUTH_SESSION_EXPIRED`, `AUTH_NETWORK_DENIED`, `AUTH_MFA_ENROL_REQUIRED`. A network refusal is audited (AUTHZ-05).
5. The lockout guard (`SETTINGS_SELF_LOCKOUT`, POL-05) is a `guard` on the declaration, evaluated by the settings service on write with the client of the person who makes the change. It does not live in the port.

## Evidence

- Wiring points: `createAuthenticator` in `packages/server/src/boot.ts`, `createAuth` in `packages/server/src/services.ts`.
- The settings service reads through the cache: `plugins/settings/src/service.ts`.
- Same direction of dependency as ADR 0030 and `scopedPermissions`: the lower package defines a type, the server wires it.
- Tests: `packages/auth/src/policy.test.ts`, `authenticator.policy.dialects.test.ts`, `session-policy.dialects.test.ts`, `packages/server/src/policy.test.ts`, the `POL-05` cases of `plugins/settings/src/index.test.ts`.

## Consequences

- **Easier.** An SSO plugin or a project can supply its own `PolicyReader`. Auth tests use a plain object.
- **Harder.** A policy change takes up to two seconds to show on a running process. The reader adds one memoized read to a request.
- **Ruled out.** Policies as env keys, and any import of the settings plugin from `auth`.

## Spec changes

- New section 12.7 with POL-01 to POL-05 and the three error codes.
- Document history.

## Follow-ups

- Per-role overrides of the session limits (POL-01).
- A notification inside the app for a new device (POL-04), next to the mail.
