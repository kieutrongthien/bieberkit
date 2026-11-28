/**
 * BieberKit
 *
 * @file        packages/admin-antd/src/app/hooks.ts
 * @description What the screens of a plugin are given: the client of the API, the signed-in person, the metadata, the texts, the language, navigation and the notice of the sign in (UI-35, UI-38).
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

import { fillText } from '@bieberkit/admin-core';
import type { AdminClient, Locale, Meta, SessionUser } from '@bieberkit/admin-core';
import { useNavigate } from '@tanstack/react-router';
import { useCallback, useMemo } from 'react';
import { adminBase } from './base.ts';
import { useClient, useMeta as useMetaQuery, useSession as useSessionQuery } from './context.ts';
import { useLanguage as useShellLanguage } from './language.tsx';
import { useNotice as useShellNotice } from './notice.ts';

/** The client of the API of the admin: it carries the session and reads a refusal as an `AdminApiError`. */
export function useAdminClient(): AdminClient {
  return useClient();
}

/** Who is signed in: `null` for nobody, and `undefined` while it is not known. */
export function useSession(): SessionUser | null | undefined {
  return useSessionQuery().data;
}

/** The metadata of the signed-in person, once it is read: the entities and the permissions that they hold. */
export function useMeta(): Meta | undefined {
  return useMetaQuery().data;
}

/** Whether the person holds a permission, to draw or not to draw. The server stays the authority. */
export function useCan(permission: string): boolean {
  return useMetaQuery().data?.permissions.includes(permission) ?? false;
}

export type Text = (key: string, values?: Readonly<Record<string, string | number>>) => string;

/** The texts of the plugins in the language that is on. A key that no plugin has is shown as it is. */
export function usePluginText(): Text {
  const { texts } = useShellLanguage();
  return useMemo(() => (key, values) => fillText(texts[key] ?? key, values), [texts]);
}

export interface AdminLanguage {
  readonly locale: Locale;
  readonly setLocale: (locale: Locale) => void;
}

/** The language that is on the screen. */
export function useLanguage(): AdminLanguage {
  const { locale, setLocale } = useShellLanguage();
  return { locale, setLocale };
}

export interface NavigateOptions {
  readonly search?: Readonly<Record<string, string>>;
  /** The page that is left is not kept in the history of the browser. */
  readonly replace?: boolean;
}

/** Opens a route of the admin, such as `/crm/accounts`. */
export function useAdminNavigate(): (to: string, options?: NavigateOptions) => void {
  const navigate = useNavigate();
  return useMemo(
    () => (to, options) =>
      void navigate({
        to,
        ...(options?.search === undefined ? {} : { search: options.search }),
        ...(options?.replace === undefined ? {} : { replace: options.replace }),
      }),
    [navigate],
  );
}

/** The whole address of a route of the admin, for a link that leaves the browser, such as one that is mailed. */
export function useAdminAddress(): (path: string) => string {
  return useCallback((path) => `${window.location.origin}${adminBase()}${path}`, []);
}

export interface AdminNotice {
  /** A key of the texts of a plugin, or `undefined` for none. */
  readonly notice: string | undefined;
  readonly setNotice: (notice: string | undefined) => void;
}

/** One sentence that a page leaves for the sign in that follows it. It is in no address and no storage. */
export function useNotice(): AdminNotice {
  return useShellNotice();
}
