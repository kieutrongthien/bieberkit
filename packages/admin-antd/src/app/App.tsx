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

import { createAdminClient } from '@bieberkit/admin-core';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createRootRoute, createRoute, createRouter, RouterProvider } from '@tanstack/react-router';
import { compileAntdTheme, modeOf, readTheme } from '@bieberkit/tokens';
import { App as AntApp, ConfigProvider, theme as antTheme } from 'antd';
import { useEffect, useState } from 'react';
import { antdLocaleOf, initialLocale, LanguageContext } from './language.tsx';
import type { JSX } from 'react';
import { Welcome } from './Welcome.tsx';
import { FormScreen } from './FormScreen.tsx';
import { ListScreen } from './ListScreen.tsx';
import { Gate } from './Gate.tsx';
import { ClientContext } from './context.ts';

const client = createAdminClient();
const queries = new QueryClient({ defaultOptions: { queries: { retry: 1, refetchOnWindowFocus: false } } });

const root = createRootRoute({ component: Gate });
const index = createRoute({ getParentRoute: () => root, path: '/', component: Welcome });
const list = createRoute({ getParentRoute: () => root, path: '$module/$resource', component: ListScreen });
const create = createRoute({ getParentRoute: () => root, path: '$module/$resource/new', component: FormScreen });
const edit = createRoute({ getParentRoute: () => root, path: '$module/$resource/$id', component: FormScreen });

/**
 * Where the server serves the application: it writes the path in a meta element of the page (`/admin`, `/panel`, or empty for the root
 * of a host), so that one build runs at any address (UI-14).
 */
const served = document.querySelector('meta[name="bk-admin-base"]')?.getAttribute('content') ?? '';

const router = createRouter({
  routeTree: root.addChildren([index, list, create, edit]),
  basepath: served === '' ? '/' : served,
  defaultPreload: 'intent',
});

/** The brand tokens that the server wrote in the page from `theme` of the config (UI-06, TOK-02). */
const brand = readTheme(document.querySelector('meta[name="bk-theme"]')?.getAttribute('content'));
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
  const [locale, setLocale] = useState(initialLocale);
  useEffect(() => {
    document.documentElement.lang = locale;
  }, [locale]);
  const compiled = compileAntdTheme(brand, mode);
  return (
    <ConfigProvider
      locale={antdLocaleOf(locale)}
      theme={{
        token: compiled.token,
        algorithm: compiled.algorithm === 'dark' ? antTheme.darkAlgorithm : antTheme.defaultAlgorithm,
      }}
    >
      <AntApp>
        <LanguageContext.Provider value={{ locale, setLocale }}>
          <ClientContext.Provider value={client}>
            <QueryClientProvider client={queries}>
              <RouterProvider router={router} />
            </QueryClientProvider>
          </ClientContext.Provider>
        </LanguageContext.Provider>
      </AntApp>
    </ConfigProvider>
  );
}
