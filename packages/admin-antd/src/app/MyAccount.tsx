/**
 * BieberKit
 *
 * @file        packages/admin-antd/src/app/MyAccount.tsx
 * @description The page of one's own account, at `/account`: the profile, the password, the second factor and the sessions, each in a folder tab that the address names (UI-26, USR-12).
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

import { useNavigate, useRouterState } from '@tanstack/react-router';
import { Tabs, Typography } from 'antd';
import type { JSX } from 'react';
import { PasswordTab } from './account/Password.tsx';
import { ProfileTab } from './account/Profile.tsx';
import { SessionsTab } from './account/Sessions.tsx';
import { TwoFactorTab } from './account/TwoFactor.tsx';
import { useT } from './language.tsx';

const TABS = ['profile', 'password', 'factor', 'sessions'] as const;
type TabName = (typeof TABS)[number];

export function MyAccount(): JSX.Element {
  const t = useT();
  const navigate = useNavigate();
  const asked = useRouterState({ select: (state): string => String(Reflect.get(state.location.search, 'tab') ?? '') });
  const active: TabName = TABS.find((name) => name === asked) ?? 'profile';
  return (
    <>
      <div className="bk-page-head">
        <Typography.Title level={1} className="bk-title">
          {t('account.mine')}
        </Typography.Title>
      </div>
      <Tabs
        type="card"
        className="bk-tabs bk-tabs-wrap"
        activeKey={active}
        // A tab that is left is gone: no form of it stays on the page, and no password stays in one.
        destroyOnHidden
        onChange={(tab) => void navigate({ to: '/account', search: { tab }, replace: true })}
        items={[
          { key: 'profile', label: t('account.tab.profile'), children: <ProfileTab /> },
          { key: 'password', label: t('account.tab.password'), children: <PasswordTab /> },
          { key: 'factor', label: t('account.tab.factor'), children: <TwoFactorTab /> },
          { key: 'sessions', label: t('account.tab.sessions'), children: <SessionsTab /> },
        ]}
      />
    </>
  );
}
