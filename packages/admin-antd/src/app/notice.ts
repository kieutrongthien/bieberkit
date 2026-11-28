/**
 * BieberKit
 *
 * @file        packages/admin-antd/src/app/notice.ts
 * @description One sentence that a page leaves for the sign in that follows it, such as that the new password is set. The gate holds it, so it lives as long as the application and is in no address and no storage (UI-26).
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

import { createContext, useContext } from 'react';
import type { Context } from 'react';

export interface Notice {
  /** A key of the texts of the shell or of a plugin. */
  readonly notice: string | undefined;
  readonly setNotice: (notice: string | undefined) => void;
}

export const NoticeContext: Context<Notice> = createContext<Notice>({
  notice: undefined,
  setNotice: () => undefined,
});

export const useNotice = (): Notice => useContext(NoticeContext);
