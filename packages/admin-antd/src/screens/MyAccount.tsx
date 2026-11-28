/**
 * BieberKit
 *
 * @file        packages/admin-antd/src/screens/MyAccount.tsx
 * @description The page of one's own account, at `/account`: the tabs that the plugins give, each in a folder tab that the address names (UI-26, UI-35, slot 8).
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

import { shortNameOf } from '@bieberkit/admin-core';
import { useNavigate, useRouterState } from '@tanstack/react-router';
import { Result, Skeleton, Tabs, Typography } from 'antd';
import type { JSX } from 'react';
import { useMeta } from '../lib/context.ts';
import { usePluginText } from '../lib/hooks.ts';
import { useT } from '../lib/language.tsx';
import { Slot, useAllowed, useRegistry } from '../slots/slots.tsx';

export function MyAccount(): JSX.Element {
  const t = useT();
  const navigate = useNavigate();
  const asked = useRouterState({ select: (state): string => String(Reflect.get(state.location.search, 'tab') ?? '') });
  const text = usePluginText();
  const meta = useMeta();
  const added = useAllowed(useRegistry().accountTabs);
  const items: { key: string; label: string; children: JSX.Element }[] = [];
  // The address names a tab by its id, and by the name of its plugin too when a tab before it has that id.
  for (const tab of added) {
    const taken = items.some((item) => item.key === tab.id);
    items.push({
      key: taken ? `${shortNameOf(tab.plugin)}-${tab.id}` : tab.id,
      label: text(tab.title),
      children: <Slot name={`${tab.plugin}/${tab.id}`} load={tab.load} />,
    });
  }
  const active = items.some((item) => item.key === asked) ? asked : items[0]?.key;
  return (
    <>
      <div className="bk-page-head">
        <Typography.Title level={1} className="bk-title">
          {t('account.mine')}
        </Typography.Title>
      </div>
      {/* What a person may see is not known until the metadata is read. */}
      {meta.isPending ? (
        <Skeleton active />
      ) : active === undefined ? (
        <Result status="403" title={t('page.closed')} />
      ) : (
        <Tabs
          type="card"
          className="bk-tabs bk-tabs-wrap"
          activeKey={active}
          // A tab that is left is gone: no form of it stays on the page, and no password stays in one.
          destroyOnHidden
          onChange={(tab) => void navigate({ to: '/account', search: { tab }, replace: true })}
          items={items}
        />
      )}
    </>
  );
}
