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

import { currentEntry, enrolmentNeeded, labelText } from '@bieberkit/admin-core';
import type { GateState, MenuGroup, MessageKey } from '@bieberkit/admin-core';
import { useQueryClient } from '@tanstack/react-query';
import { lazyRouteComponent, Link, Outlet, useNavigate, useRouterState } from '@tanstack/react-router';
import { Dropdown, Grid, Layout, Menu, Result, Select, Skeleton } from 'antd';
import { Suspense, useEffect, useState } from 'react';
import type { JSX } from 'react';
import { Brand, firstLetter } from './Brand.tsx';
import { OfflineBanner } from './connection.tsx';
import { useClient, useMeta, useSession } from './context.ts';
import { GoTo } from './GoTo.tsx';
import { GraceNotice } from './GraceNotice.tsx';
import { usePluginText } from './hooks.ts';
import { FolderArt, Icon } from './icons.tsx';
import { LANGUAGE_NAMES, LOCALES, useLanguage, useT } from './language.tsx';
import { Login } from './Login.tsx';
import { NoticeContext, useNotice } from './notice.ts';
import { reportClientError } from './reports.ts';
import type { GateProps, NoticeProps, SignInProps } from './slot-props.ts';
import { Slot, useAllowed, useRegistry } from './slots.tsx';
import type { Registry } from './slots.tsx';
import { useMenuGroups } from './useMenuGroups.ts';

const { Header, Sider, Content } = Layout;

const enrolScreen = lazyRouteComponent(() => import('./EnrolScreen.tsx'), 'EnrolScreen');

/**
 * The routes of the shell that open without a session, and with one: the pages of a forgotten password and of a password link
 * (UI-26). The pages of plugins that open without a session are added to them.
 */
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

/** The notices of plugins over the frame. One that the person closed stays closed while the page is open. */
function Notices(): JSX.Element {
  const notices = useAllowed(useRegistry().notices);
  const [closed, setClosed] = useState<ReadonlySet<string>>(new Set());
  return (
    <>
      {notices
        .map((notice) => ({ ...notice, name: `${notice.plugin}/${notice.id}` }))
        .filter((notice) => !closed.has(notice.name))
        .map((notice) => (
          <Slot
            key={notice.name}
            name={notice.name}
            load={notice.load}
            fallback={null}
            given={{ close: () => setClosed((now) => new Set(now).add(notice.name)) } satisfies NoticeProps}
          />
        ))}
    </>
  );
}

function Frame(props: { readonly email: string }): JSX.Element {
  const meta = useMeta();
  const t = useT();
  const { locale, setLocale } = useLanguage();
  const groupName = useGroupName();
  const compact = Grid.useBreakpoint().md === false;
  const groups = useMenuGroups();
  const registry = useRegistry();
  const actions = useAllowed(registry.headerActions);
  const text = usePluginText();
  // The address from the parts of the route, so that it is the same wherever the admin is served.
  const params = useRouterState({ select: (state) => state.matches.at(-1)?.params ?? {} });
  const read = (name: string): string | undefined => {
    const value: unknown = Reflect.get(params, name);
    return typeof value === 'string' ? value : undefined;
  };
  const route = useRouterState({ select: (state): string => state.matches.at(-1)?.routeId ?? '' });
  const pluginPage = registry.pages.find((page) => page.path === route);
  const address = pluginPage?.path ?? `/${read('module') ?? ''}/${read('resource') ?? ''}`;
  const here = currentEntry(groups, address);
  const atAccount = route === '/account';
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
          <Notices />
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
              ) : here === undefined ? (
                // A page of a plugin that is in no menu names itself.
                pluginPage === undefined ? null : (
                  <ol>
                    <li aria-current="page">{text(pluginPage.title)}</li>
                  </ol>
                )
              ) : (
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
              {actions.map((action) => (
                <Slot
                  key={`${action.plugin}/${action.id}`}
                  name={`${action.plugin}/${action.id}`}
                  load={action.load}
                  fallback={null}
                />
              ))}
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

/** A gate of a plugin that cannot say whether it is needed is reported, and does not stand in the way. */
function isNeeded(gate: Registry['gates'][number], state: GateState): boolean {
  try {
    return gate.needed(state);
  } catch (error) {
    reportClientError(error);
    return false;
  }
}

/** How a gate of a plugin is called, in the state and in the message of a failure. */
const nameOf = (gate: Registry['gates'][number]): string => `${gate.plugin}/${gate.id}`;

/** The gate of the shell: the second factor that is asked of a person who has none (AUTH-05, POL-02). */
const ENROL = 'enrol';

/**
 * The admin of a signed-in person. While the shell or a gate of a plugin says that something is asked of them, its screen stands in
 * the place of the admin until it is done. Once it is up it stays, whatever is read again meanwhile, so that what it shows once is
 * not lost.
 */
function SignedIn(props: { readonly email: string }): JSX.Element {
  const meta = useMeta();
  const queries = useQueryClient();
  const signOut = useSignOut();
  const { gates } = useRegistry();
  const asked = gates.find((gate) => isNeeded(gate, { metaError: meta.error }));
  const wanted = enrolmentNeeded(meta.error) ? ENROL : asked === undefined ? undefined : nameOf(asked);
  const [held, setHeld] = useState<string | undefined>();
  useEffect(() => {
    if (wanted !== undefined) setHeld((now) => now ?? wanted);
  }, [wanted]);
  const active = held ?? wanted;
  if (active === undefined) return <Frame email={props.email} />;
  const given: GateProps = {
    onDone: () => {
      setHeld(undefined);
      void queries.resetQueries();
    },
    onSignOut: signOut,
  };
  const gate = gates.find((candidate) => nameOf(candidate) === active);
  if (gate !== undefined) {
    return <Slot name={active} load={gate.load} given={given} fallback={<Opening />} />;
  }
  const EnrolScreen = enrolScreen;
  return (
    <Suspense fallback={<Opening />}>
      <EnrolScreen {...given} />
    </Suspense>
  );
}

/** Asks who is signed in. Nobody gets the login page, and a user gets the admin with the screen of the route. */
function Session(): JSX.Element {
  const t = useT();
  const session = useSession();
  const queries = useQueryClient();
  const { signIn } = useRegistry();
  if (session.isPending) return <Opening />;
  if (session.isError) {
    return <Result status="error" title={t('gate.noAnswer')} subTitle={session.error.message} />;
  }
  if (session.data === null) {
    // The sign in of a plugin, and until one gives it, the one of the shell.
    return signIn === undefined ? (
      <Login />
    ) : (
      <Slot
        name={signIn.plugin}
        load={signIn.load}
        fallback={<Opening />}
        given={{ onSignedIn: () => void queries.invalidateQueries() } satisfies SignInProps}
      />
    );
  }
  return <SignedIn email={session.data.email} />;
}

export function Gate(): JSX.Element {
  const route = useRouterState({ select: (state): string => state.matches.at(-1)?.routeId ?? '' });
  const { publicPages } = useRegistry();
  const open = PUBLIC_ROUTES.has(route) || publicPages.some((page) => page.path === route);
  const [notice, setNotice] = useState<string | undefined>();
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
