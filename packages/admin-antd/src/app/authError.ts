/**
 * BieberKit
 *
 * @file        packages/admin-antd/src/app/authError.ts
 * @description The sentence of a failed call of the account screens: the one of the admin in the language of the person, or the text of the server with its fix (UI-25, UI-05).
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

import { AdminApiError, authMessageKey } from '@bieberkit/admin-core';
import { useT } from './language.tsx';

/** How long to say when the server does not. */
const WAIT_SECONDS = 60;

export function useAuthError(): (error: unknown) => string {
  const t = useT();
  return (error) => {
    if (!(error instanceof AdminApiError)) return t('auth.noAnswer');
    const key = authMessageKey(error);
    if (key !== undefined) return t(key, { seconds: error.retryAfter ?? WAIT_SECONDS });
    return error.fix === '' ? error.message : `${error.message} ${error.fix}`;
  };
}
