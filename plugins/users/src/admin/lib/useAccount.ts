/**
 * BieberKit
 *
 * @file        plugins/users/src/admin/lib/useAccount.ts
 * @description What the account screens read: the calls of the account, the profile of the signed-in person, whether they have a password, and the sentence of a failed call (UI-26, UI-25, UI-05).
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

import { useAdminClient, useText } from '@bieberkit/admin-antd';
import { AdminApiError } from '@bieberkit/admin-core';
import { useQuery } from '@tanstack/react-query';
import type { UseQueryResult } from '@tanstack/react-query';
import { useMemo } from 'react';
import { accountApi } from './api.ts';
import type { AccountApi, Me } from './api.ts';
import { authMessageKey } from './rules.ts';

export function useAccountApi(): AccountApi {
  const client = useAdminClient();
  return useMemo(() => accountApi(client), [client]);
}

/** The profile of the signed-in person, or `null` when the server has no route of the profile (USR-12). */
export function useMe(): UseQueryResult<Me | null> {
  const api = useAccountApi();
  return useQuery({ queryKey: ['me'], queryFn: async () => (await api.me()) ?? null, staleTime: 60_000 });
}

/** Whether the account has a password of its own. One that an identity provider made has none (IDN-02). */
export function useHasPassword(): UseQueryResult<boolean> {
  const api = useAccountApi();
  return useQuery({ queryKey: ['has-password'], queryFn: () => api.hasPassword(), staleTime: 60_000 });
}

/** How long to say when the server does not. */
const WAIT_SECONDS = 60;

/** The sentence of a failed call: the one of the screens in the language of the person, or the text of the server with its fix. */
export function useAuthError(): (error: unknown) => string {
  const t = useText();
  return (error) => {
    if (!(error instanceof AdminApiError)) return t('users.auth.noAnswer');
    const key = authMessageKey(error);
    if (key !== undefined) return t(key, { seconds: error.retryAfter ?? WAIT_SECONDS });
    return error.fix === '' ? error.message : `${error.message} ${error.fix}`;
  };
}
