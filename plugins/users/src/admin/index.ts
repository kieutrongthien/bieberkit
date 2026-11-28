/**
 * BieberKit
 *
 * @file        plugins/users/src/admin/index.ts
 * @description The admin part of the users plugin: the sign in, the pages of a forgotten and of a new password, the screen that asks for a second factor, the notice of the days of grace, and the tabs of one's own account (UI-26, UI-34).
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

import { defineAdminPlugin } from '@bieberkit/admin-core';
import type { AdminPart, AdminView } from '@bieberkit/admin-core';
import { enrolmentNeeded } from './rules.ts';

const part: AdminPart<AdminView> = defineAdminPlugin({
  name: '@bieberkit/plugin-users',
  signIn: { load: async () => ({ default: (await import('./SignIn.tsx')).SignIn }) },
  publicPages: [
    {
      path: '/forgot-password',
      load: async () => ({ default: (await import('./ForgotPassword.tsx')).ForgotPassword }),
    },
    // An address of one segment cannot be the list of an entity, which has two.
    { path: '/reset-password', load: async () => ({ default: (await import('./ResetPassword.tsx')).ResetPassword }) },
  ],
  gates: [
    {
      id: 'enrol',
      needed: ({ metaError }) => enrolmentNeeded(metaError),
      load: async () => ({ default: (await import('./EnrolScreen.tsx')).EnrolScreen }),
    },
  ],
  notices: [{ id: 'grace', load: async () => ({ default: (await import('./GraceNotice.tsx')).GraceNotice }) }],
  accountTabs: [
    {
      id: 'profile',
      title: 'users.account.tab.profile',
      load: async () => ({ default: (await import('./tabs/Profile.tsx')).ProfileTab }),
    },
    {
      id: 'password',
      title: 'users.account.tab.password',
      load: async () => ({ default: (await import('./tabs/Password.tsx')).PasswordTab }),
    },
    {
      id: 'factor',
      title: 'users.account.tab.factor',
      load: async () => ({ default: (await import('./tabs/TwoFactor.tsx')).TwoFactorTab }),
    },
    {
      id: 'sessions',
      title: 'users.account.tab.sessions',
      load: async () => ({ default: (await import('./tabs/Sessions.tsx')).SessionsTab }),
    },
  ],
  messages: {
    en: async () => ({ default: (await import('./messages/en.ts')).en }),
    vi: async () => ({ default: (await import('./messages/vi.ts')).vi }),
    zh: async () => ({ default: (await import('./messages/zh.ts')).zh }),
  },
});

export default part;
