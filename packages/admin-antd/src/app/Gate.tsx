/**
 * BieberKit
 *
 * @file        packages/admin-antd/src/app/Gate.tsx
 * @description The gate and the frame of the admin: nobody is shown anything until the session says who signed in, then the brand, the grouped menu and the account on the frame, and the breadcrumb, the box that goes to a page and the screen of the route on the page (UI-02, UI-23, UI-24, AUTH-01).
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

import { currentEntry, enrolmentNeeded, labelText, menuOf } from '@bieberkit/admin-core';
import type { MenuGroup, MessageKey } from '@bieberkit/admin-core';
import { useQueryClient } from '@tanstack/react-query';
import { lazyRouteComponent, Link, Outlet, useNavigate, useRouterState } from '@tanstack/react-router';
import { Dropdown, Grid, Layout, Menu, Result, Select, Skeleton } from 'antd';
import { Suspense, useEffect, useState } from 'react';
import type { JSX } from 'react';
import { Brand, firstLetter, pageSettings } from './Brand.tsx';
import { OfflineBanner } from './connection.tsx';
import { useClient, useMeta, useSession } from './context.ts';
import { GoTo } from './GoTo.tsx';
import { GraceNotice } from './GraceNotice.tsx';
import { FolderArt, Icon } from './icons.tsx';
import { LANGUAGE_NAMES, LOCALES, useLanguage, useT } from './language.tsx';
import { Login } from './Login.tsx';
import { NoticeContext, useNotice } from './notice.ts';

const { Header, Sider, Content } = Layout;

const enrolScreen = lazyRouteComponent(() => import('./EnrolScreen.tsx'), 'EnrolScreen');

/** The routes that open without a session, and with one: the pages of a forgotten password and of a password link (UI-26). */
const PUBLIC_ROUTES: ReadonlySet<string> = new Set(['/forgot-password', '/reset-password']);

const GROUP_KEYS: Readonly<Record<string, MessageKey>> = {
  app: 'menu.group.app',
  people: 'menu.group.people',
  content: 'menu.group.content',
  system: 'menu.group.system',
};

/** The name of a group in the language of the person: the one of the config, or the one of the framework. */
export function useGroupName(): (group: MenuGroup) => string {
  const t = useT();
  const { locale } = useLanguage();
  return (group) => {
    if (typeof group.label === 'string') return group.label;
    if (group.label !== undefined) return labelText(group.label, locale, group.id);
    const key = GROUP_KEYS[group.id];
    return key === undefined ? group.id : t(key);
  };
}

/** The initials of an account, from the name of its email. */
const initialsOf = (email: string): string =>
  (email.split('@')[0] ?? '')
    .split(/[._-]+/)
    .map(firstLetter)
    .join('')
    .slice(0, 2)
    .toUpperCase();

/** Ends the session, goes to the home page, and drops everything that was read as this person. */
function useSignOut(): () => void {
  const client = useClient();
  const queries = useQueryClient();
  const navigate = useNavigate();
  return () =>
    void client
      .signOut()
      // The next person at this browser does not land on the page of this one.
      .then(() => navigate({ to: '/' }))
      .then(() => queries.resetQueries());
}

function Account(props: { readonly email: string }): JSX.Element {
  const navigate = useNavigate();
  const signOut = useSignOut();
  const t = useT();
  return (
    <Dropdown
      trigger={['click']}
      placement="topLeft"
      menu={{
        items: [
          { key: 'account', label: t('account.mine') },
          { key: 'sign-out', label: t('auth.signOut') },
        ],
        onClick: ({ key }) => {
          if (key === 'account') void navigate({ to: '/account' });
          else signOut();
        },
      }}
    >
      <button type="button" className="bk-account" aria-haspopup="menu">
        <span className="bk-account-initials" aria-hidden="true">
          {initialsOf(props.email)}
        </span>
        <span className="bk-account-email">{props.email}</span>
        <span className="bk-sr-only">{t('account.menu')}</span>
      </button>
    </Dropdown>
  );
}

function Frame(props: { readonly email: string }): JSX.Element {
  const meta = useMeta();
  const t = useT();
  const { locale, setLocale } = useLanguage();
  const groupName = useGroupName();
  const compact = Grid.useBreakpoint().md === false;
  const groups = meta.data === undefined ? [] : menuOf(meta.data, pageSettings().menu);
  // The address from the parts of the route, so that it is the same wherever the admin is served.
  const params = useRouterState({ select: (state) => state.matches.at(-1)?.params ?? {} });
  const read = (name: string): string | undefined => {
    const value: unknown = Reflect.get(params, name);
    return typeof value === 'string' ? value : undefined;
  };
  const plugin = read('plugin');
  const address =
    plugin === undefined
      ? `/${read('module') ?? ''}/${read('resource') ?? ''}`
      : `/ext/${plugin}/${read('page') ?? ''}`;
  const here = currentEntry(groups, address);
  const atAccount = useRouterState({ select: (state) => state.matches.at(-1)?.routeId === '/account' });
  const { setNotice } = useNotice();
  // A sentence that was meant for the sign in is not shown to somebody who is already in.
  useEffect(() => setNotice(undefined), [setNotice]);
  return (
    <>
      <OfflineBanner />
      <Layout className="bk-shell">
        <Sider className="bk-rail" breakpoint="md" collapsedWidth={0} theme="light" width={248}>
          <div className="bk-rail-inner">
            <div className="bk-rail-brand">
              <Link to="/">
                <Brand />
              </Link>
            </div>
            <nav className="bk-rail-menu" aria-label={t('menu.label')}>
              <Menu
                mode="inline"
                selectedKeys={here === undefined ? [] : [here.entry.key]}
                items={groups.map((group) => ({
                  type: 'group' as const,
                  key: `group:${group.id}`,
                  label: groupName(group),
                  children: group.entries.map((entry) => ({
                    key: entry.key,
                    icon: <Icon names={entry.icons} />,
                    label: <Link to={entry.path}>{labelText(entry.label, locale, entry.name)}</Link>,
                  })),
                }))}
              />
            </nav>
            <Account email={props.email} />
          </div>
        </Sider>
        <Layout>
          <GraceNotice />
          <Header className={compact ? 'bk-header bk-header-compact' : 'bk-header'}>
            <nav className="bk-crumbs" aria-label={t('breadcrumb.label')}>
              {atAccount ? (
                <ol>
                  <li>
                    <Link to="/account" aria-current="page">
                      {t('account.mine')}
                    </Link>
                  </li>
                </ol>
              ) : here === undefined ? null : (
                <ol>
                  <li>{groupName(here.group)}</li>
                  <li>
                    {address === here.entry.path && read('id') === undefined ? (
                      <Link to={here.entry.path} aria-current="page">
                        {labelText(here.entry.label, locale, here.entry.name)}
                      </Link>
                    ) : (
                      <Link to={here.entry.path}>{labelText(here.entry.label, locale, here.entry.name)}</Link>
                    )}
                  </li>
                </ol>
              )}
            </nav>
            <div className="bk-header-tools">
              <GoTo groups={groups} />
              <Select
                aria-label={t('language.label')}
                value={locale}
                onChange={(next) => setLocale(next)}
                options={LOCALES.map((value) => ({ value, label: LANGUAGE_NAMES[value] }))}
                style={{ width: 130 }}
              />
            </div>
          </Header>
          <Content className="bk-content">
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

function Opening(): JSX.Element {
  const t = useT();
  return (
    <div className="bk-opening" role="status">
      <FolderArt />
      <span>{t('gate.loading')}</span>
    </div>
  );
}

/**
 * The admin of a signed-in person. When the API says that a second factor is asked of them, the screen that sets it up stands in its
 * place until it is done (AUTH-05, POL-02). Once it is up it stays, whatever is read again meanwhile, so the backup codes that are
 * shown once are not lost.
 */
function SignedIn(props: { readonly email: string }): JSX.Element {
  const meta = useMeta();
  const queries = useQueryClient();
  const signOut = useSignOut();
  const [enrolling, setEnrolling] = useState(false);
  const needed = enrolmentNeeded(meta.error);
  useEffect(() => {
    if (needed) setEnrolling(true);
  }, [needed]);
  if (!needed && !enrolling) return <Frame email={props.email} />;
  const EnrolScreen = enrolScreen;
  return (
    <Suspense fallback={<Opening />}>
      <EnrolScreen
        onDone={() => {
          setEnrolling(false);
          void queries.resetQueries();
        }}
        onSignOut={signOut}
      />
    </Suspense>
  );
}

/** Asks who is signed in. Nobody gets the login page, and a user gets the admin with the screen of the route. */
function Session(): JSX.Element {
  const t = useT();
  const session = useSession();
  if (session.isPending) return <Opening />;
  if (session.isError) {
    return <Result status="error" title={t('gate.noAnswer')} subTitle={session.error.message} />;
  }
  if (session.data === null) return <Login />;
  return <SignedIn email={session.data.email} />;
}

export function Gate(): JSX.Element {
  const open = useRouterState({ select: (state) => PUBLIC_ROUTES.has(state.matches.at(-1)?.routeId ?? '') });
  const [notice, setNotice] = useState<MessageKey | undefined>();
  return (
    <NoticeContext.Provider value={{ notice, setNotice }}>
      {open ? (
        <Suspense fallback={<Opening />}>
          <Outlet />
        </Suspense>
      ) : (
        <Session />
      )}
    </NoticeContext.Provider>
  );
}
