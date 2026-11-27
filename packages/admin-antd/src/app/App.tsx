/**
 * BieberKit
 *
 * @file        packages/admin-antd/src/app/App.tsx
 * @description The application of the admin: the client of the API, the query cache, and the routes (login, the lists and the forms of the entities) under /admin (UI-01, UI-02, UI-12).
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

import { backoffMs, createAdminClient, shouldRetry } from '@bieberkit/admin-core';
import type { Locale } from '@bieberkit/admin-core';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createRootRoute, createRoute, createRouter, lazyRouteComponent, RouterProvider } from '@tanstack/react-router';
import { compileAntdTheme, cssVariables, modeOf, readTheme } from '@bieberkit/tokens';
import { App as AntApp, ConfigProvider, Empty, theme as antTheme } from 'antd';
import { FolderArt } from './icons.tsx';
import { useEffect, useState } from 'react';
import { ENGLISH_RESOURCES, initialLocale, LanguageContext, loadResources, saveLocale } from './language.tsx';
import type { Resources } from './language.tsx';
import type { JSX } from 'react';
import { ErrorBoundary, ErrorScreen } from './ErrorScreens.tsx';
import { Gate } from './Gate.tsx';
import { adminBase } from './base.ts';
import { ClientContext } from './context.ts';

const client = createAdminClient();
// A read that failed is tried again as the retry policy says, with a wait that grows and is spread (UI-19).
const queries = new QueryClient({
  defaultOptions: {
    queries: { retry: shouldRetry, retryDelay: (attempt) => backoffMs(attempt), refetchOnWindowFocus: false },
  },
});

const root = createRootRoute({ component: Gate });
// Every screen is a chunk of its own, loaded when its route is opened (UI-12).
const welcome = lazyRouteComponent(() => import('./Welcome.tsx'), 'Welcome');
const listScreen = lazyRouteComponent(() => import('./ListScreen.tsx'), 'ListScreen');
const formScreen = lazyRouteComponent(() => import('./FormScreen.tsx'), 'FormScreen');
const extensionPage = lazyRouteComponent(() => import('./ExtensionPage.tsx'), 'ExtensionPage');
const forgotPassword = lazyRouteComponent(() => import('./ForgotPassword.tsx'), 'ForgotPassword');
const resetPassword = lazyRouteComponent(() => import('./ResetPassword.tsx'), 'ResetPassword');
const myAccount = lazyRouteComponent(() => import('./MyAccount.tsx'), 'MyAccount');
const index = createRoute({ getParentRoute: () => root, path: '/', component: welcome });
// The account screens (UI-26). An address of one segment cannot be the list of an entity, which has two. The two pages of a
// password open without a session: the gate draws them on their own.
const forgot = createRoute({ getParentRoute: () => root, path: 'forgot-password', component: forgotPassword });
const reset = createRoute({ getParentRoute: () => root, path: 'reset-password', component: resetPassword });
const account = createRoute({ getParentRoute: () => root, path: 'account', component: myAccount });
// The pages that plugins add (UI-04). `ext` is a static segment, so it wins over `$module/$resource`.
const extension = createRoute({ getParentRoute: () => root, path: 'ext/$plugin/$page', component: extensionPage });
const list = createRoute({ getParentRoute: () => root, path: '$module/$resource', component: listScreen });
const create = createRoute({ getParentRoute: () => root, path: '$module/$resource/new', component: formScreen });
const edit = createRoute({ getParentRoute: () => root, path: '$module/$resource/$id', component: formScreen });

/**
 * Where the server serves the application: it writes the path in a meta element of the page (`/admin`, `/panel`, or empty for the root
 * of a host), so that one build runs at any address (UI-14).
 */
const served = adminBase();

const router = createRouter({
  routeTree: root.addChildren([index, forgot, reset, account, extension, list, create, edit]),
  basepath: served === '' ? '/' : served,
  defaultPreload: 'intent',
  // Each route has its own boundary with a retry, so one screen that fails does not take the frame with it (UI-19).
  defaultErrorComponent: ({ error, reset }) => <ErrorScreen error={error} reset={reset} />,
});

/** The brand tokens that the server wrote in the page from `theme` of the config (UI-06, TOK-02). */
const brand = readTheme(document.querySelector('meta[name="bk-theme"]')?.getAttribute('content'));
// The server writes the variables in the page. A page without them, such as the one of `vite dev`, gets those of the theme it read.
if (document.getElementById('bk-theme') === null) {
  const style = document.createElement('style');
  style.id = 'bk-theme';
  style.textContent = cssVariables(brand);
  document.head.prepend(style);
}
const dark = window.matchMedia('(prefers-color-scheme: dark)');

/** Whether the system asks for the dark palette, kept up to date while the page is open. */
function useSystemDark(): boolean {
  const [prefers, setPrefers] = useState(dark.matches);
  useEffect(() => {
    const change = (event: MediaQueryListEvent): void => setPrefers(event.matches);
    dark.addEventListener('change', change);
    return () => dark.removeEventListener('change', change);
  }, []);
  return prefers;
}

export function App(): JSX.Element {
  const mode = modeOf(brand, useSystemDark());
  // The parts that the browser draws itself, such as the picker of a date, follow the palette too.
  useEffect(() => {
    document.documentElement.style.colorScheme = mode;
  }, [mode]);
  // English is in the bundle and shows at once. Another language is read first, and the screen waits for it, so that it does not flash in English (UI-12).
  const [resources, setResources] = useState<Resources | undefined>(() => {
    const first = initialLocale();
    return first === 'en' ? ENGLISH_RESOURCES : undefined;
  });
  const change = (next: Locale): void => {
    saveLocale(next);
    // A chunk that is gone (a deploy) or a network that failed: the language that is on the screen stays, or English when none is.
    loadResources(next).then(setResources, () => setResources((now) => now ?? ENGLISH_RESOURCES));
  };
  useEffect(() => {
    if (resources === undefined) change(initialLocale());
  }, []);
  useEffect(() => {
    if (resources !== undefined) document.documentElement.lang = resources.locale;
  }, [resources]);
  const compiled = compileAntdTheme(brand, mode);
  if (resources === undefined) return <div aria-busy="true" />;
  const { locale, dictionary, antd } = resources;
  return (
    <ConfigProvider
      locale={antd}
      // Where Ant Design has nothing to show, the admin shows its empty folder (UI-23).
      renderEmpty={() => <Empty image={<FolderArt />} />}
      theme={{
        token: compiled.token,
        algorithm: compiled.algorithm === 'dark' ? antTheme.darkAlgorithm : antTheme.defaultAlgorithm,
      }}
    >
      <AntApp>
        <LanguageContext.Provider value={{ locale, dictionary, setLocale: change }}>
          <ClientContext.Provider value={client}>
            <QueryClientProvider client={queries}>
              <ErrorBoundary>
                <RouterProvider router={router} />
              </ErrorBoundary>
            </QueryClientProvider>
          </ClientContext.Provider>
        </LanguageContext.Provider>
      </AntApp>
    </ConfigProvider>
  );
}
