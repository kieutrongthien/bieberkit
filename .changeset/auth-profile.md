---
'@bieberkit/auth': minor
---

<!--
  BieberKit

  @file        .changeset/auth-profile.md
  @description Release note for disabled-user status and provider identity fields in auth.
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

Add disabled-user status and identity-provider fields to `AuthUserRow` and Better Auth user records, with six additive migration steps at version 0.5.0. New users default to the local provider; external identifiers are unique within their provider.

Add `disableUser` and `enableUser` with atomic session revocation and audit entries. Disabled users receive `AUTH_USER_DISABLED` (403) on password, magic-link, passkey and second-factor sign-in, cookie requests and API-key requests. Cookie and key authentication read the current owner status, including when a cached session still describes an enabled user.

Verify durable cookie sessions on framework and native auth routes, including mixed API-key/cookie requests. Enabling an account does not revive cached sessions; session insertion is serialized with disable/enable, including direct auth API calls.
