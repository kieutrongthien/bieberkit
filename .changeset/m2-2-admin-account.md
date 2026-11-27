---
'@bieberkit/auth': minor
'@bieberkit/http': minor
'@bieberkit/server': minor
'@bieberkit/admin-core': minor
'@bieberkit/admin-antd': minor
'@bieberkit/plugin-users': minor
---

<!--
  BieberKit

  @file        .changeset/m2-2-admin-account.md
  @description Changeset for the account screens of the admin and what they need from authentication (UI-26, AUTH-03, AUTH-05, AUTH-06, USR-10, USR-12, ROL-06).
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

The admin has the account screens: the sign in with a second factor, a forgotten and a reset password, the invitation, setting up a second factor, and one's own profile, password, factor and sessions.

What changes for a project:

- A server now turns TOTP on. Nobody has to set it up unless a role or the security policy asks for it.
- A password that is set through a link ends every session of the account, and turning the second factor on ends every other session.
- With the admin installed, the links of an invitation and of a password reset by an administrator lead to `<admin>/reset-password`. Without the admin they lead where they did.
- A holder of the administrator role may turn `requireMfa` of a system role on and off.
- `GET /api/v1/users/me` also answers `mfaRequired`.
- **Breaking:** `AdminClient.signIn` of `@bieberkit/admin-core` answers `{ kind: 'signedIn', user }` or `{ kind: 'secondFactor' }` in place of the user.
