/**
 * BieberKit
 *
 * @file        packages/admin-antd/src/app/Gate.tsx
 * @description The gate and the frame of the admin: nobody is shown anything until the session says who signed in, then the menu of the entities that the user may read and the screen of the route (UI-02, AUTH-01).
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

import { labelOf } from '@bieberkit/admin-core';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, Outlet } from '@tanstack/react-router';
import { Button, Grid, Layout, Menu, Result, Select, Skeleton, Space, Typography } from 'antd';
import { Suspense } from 'react';
import type { JSX } from 'react';
import { OfflineBanner } from './connection.tsx';
import { useClient, useMeta } from './context.ts';
import { LANGUAGE_NAMES, LOCALES, useLanguage, useT } from './language.tsx';
import { Login } from './Login.tsx';

const { Header, Sider, Content } = Layout;

function Frame(props: { readonly email: string }): JSX.Element {
  const client = useClient();
  const queries = useQueryClient();
  const meta = useMeta();
  const t = useT();
  const { locale, setLocale } = useLanguage();
  const compact = Grid.useBreakpoint().md === false;
  const entities = (meta.data?.entities ?? []).filter((entity) => entity.operations.list && entity.can.read);
  return (
    <>
      <OfflineBanner />
      <Layout style={{ minHeight: '100vh' }}>
        <Sider breakpoint="md" collapsedWidth={0} theme="light" width={240}>
          <div style={{ padding: 16 }}>
            <Typography.Title level={4} style={{ margin: 0 }}>
              <Link to="/">{t('app.name')}</Link>
            </Typography.Title>
          </div>
          <Menu
            mode="inline"
            items={entities.map((entity) => ({
              key: entity.path,
              label: <Link to={`/${entity.path.replace('/api/v1/', '')}`}>{labelOf(entity, locale)}</Link>,
            }))}
          />
        </Sider>
        <Layout>
          <Header
            style={{
              background: 'transparent',
              textAlign: 'right',
              height: 'auto',
              lineHeight: 'normal',
              padding: compact ? '12px 16px 12px 56px' : '12px 24px',
            }}
          >
            <Space wrap style={{ justifyContent: 'flex-end' }}>
              <Select
                aria-label={t('language.label')}
                value={locale}
                onChange={(next) => setLocale(next)}
                options={LOCALES.map((value) => ({ value, label: LANGUAGE_NAMES[value] }))}
                style={{ width: 130 }}
              />
              {compact ? null : <Typography.Text>{props.email}</Typography.Text>}
              <Button
                onClick={() => {
                  // Everything that was read as this user is dropped, and the session is asked again.
                  void client.signOut().then(() => queries.resetQueries());
                }}
              >
                {t('auth.signOut')}
              </Button>
            </Space>
          </Header>
          <Content style={{ margin: compact ? 12 : 24 }}>
            {meta.isError ? (
              <Result status="error" title={t('gate.menuError')} subTitle={meta.error.message} />
            ) : (
              <Suspense fallback={<Skeleton active />}>
                <Outlet />
              </Suspense>
            )}
          </Content>
        </Layout>
      </Layout>
    </>
  );
}

/** Asks who is signed in. Nobody gets the login page, and a user gets the frame with the screen of the route. */
export function Gate(): JSX.Element {
  const t = useT();
  const client = useClient();
  const session = useQuery({ queryKey: ['session'], queryFn: async () => (await client.session()) ?? null });
  if (session.isPending) return <Skeleton active style={{ padding: 24 }} />;
  if (session.isError) {
    return <Result status="error" title={t('gate.noAnswer')} subTitle={session.error.message} />;
  }
  // A query may not answer `undefined`, so nobody signed in is `null`.
  if (session.data === null) return <Login />;
  return <Frame email={session.data.email} />;
}
