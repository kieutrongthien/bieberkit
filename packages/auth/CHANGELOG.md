<!--
  BieberKit

  @file        packages/auth/CHANGELOG.md
  @description Release history generated from changesets for @bieberkit/auth.
  @author      Bieber Kieu <kieutrongthien@gmail.com>
  @generated   pnpm changeset version (license header normalized)
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

# @bieberkit/auth

## 0.2.0

### Minor Changes

- 7e00afe: Add disabled-user status and identity-provider fields to `AuthUserRow` and Better Auth user records, with six additive migration steps at version 0.5.0. New users default to the local provider; external identifiers are unique within their provider.

  Add `disableUser` and `enableUser` with atomic session revocation and audit entries. Disabled users receive `AUTH_USER_DISABLED` (403) on password, magic-link, passkey and second-factor sign-in, cookie requests and API-key requests. Cookie and key authentication read the current owner status, including when a cached session still describes an enabled user.

  Verify durable cookie sessions on framework and native auth routes, including mixed API-key/cookie requests. Enabling an account does not revive cached sessions; session insertion is serialized with disable/enable, including direct auth API calls.

### Patch Changes

- @bieberkit/http@0.2.0
  - @bieberkit/core@0.2.0
  - @bieberkit/data@0.2.0
