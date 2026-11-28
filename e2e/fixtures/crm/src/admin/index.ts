/**
 * BieberKit
 *
 * @file        e2e/fixtures/crm/src/admin/index.ts
 * @description The admin part of the fixture plugin: one contribution or more for each slot of the admin, with one that throws (UI-35).
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

import { AdminApiError, defineAdminPlugin } from '@bieberkit/admin-core';

export default defineAdminPlugin({
  name: '@bieberkit/plugin-crm',
  menu: [
    { page: '/reports', group: 'content' },
    { page: '/secret', group: 'content' },
  ],
  pages: [
    { path: '/reports', title: 'crm.reports', load: () => import('./Reports.tsx') },
    // No plugin declares this permission, so nobody holds it: the page of a person without a right (UI-35).
    { path: '/secret', title: 'crm.secret', permission: 'crm.secret.read', load: () => import('./Secret.tsx') },
  ],
  headerActions: [{ id: 'quick', load: () => import('./QuickAction.tsx') }],
  notices: [{ id: 'notice', load: () => import('./CrmNotice.tsx') }],
  recordTabs: [{ id: 'panel', entity: 'crm.Account', title: 'crm.panel', load: () => import('./Panel.tsx') }],
  fields: [{ id: 'rating', widget: 'rating', load: () => import('./Rating.tsx') }],
  homeBlocks: [
    { id: 'stats', title: 'crm.stats', load: () => import('./Stats.tsx') },
    { id: 'broken', title: 'crm.broken', load: () => import('./Broken.tsx') },
  ],
  accountTabs: [{ id: 'crm', title: 'crm.account', load: () => import('./AccountTab.tsx') }],
  publicPages: [{ path: '/crm-status', load: () => import('./Status.tsx') }],
  gates: [
    {
      id: 'terms',
      needed: ({ metaError }) => metaError instanceof AdminApiError && metaError.code === 'CRM_TERMS_REQUIRED',
      load: () => import('./Terms.tsx'),
    },
  ],
  screens: [{ id: 'labels', replace: 'list:crm.Label', load: () => import('./Labels.tsx') }],
  messages: {
    en: () => import('./messages/en.ts'),
    vi: () => import('./messages/vi.ts'),
    zh: () => import('./messages/zh.ts'),
  },
});
