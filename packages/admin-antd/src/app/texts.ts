/**
 * BieberKit
 *
 * @file        packages/admin-antd/src/app/texts.ts
 * @description The texts of the admin parts of the plugins, in one language over their English (UI-05, UI-36).
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

import type { AdminPart, Locale, Texts } from '@bieberkit/admin-core';
import { reportClientError } from './reports.ts';

/**
 * The texts of every part in one language. A key that the language lacks is in English, and a plugin whose texts cannot be read is
 * reported and leaves those of the others. The build of the project makes sure that no two plugins share a key.
 */
export async function loadTexts<C>(parts: readonly AdminPart<C>[], locale: Locale): Promise<Texts> {
  const languages: readonly Locale[] = locale === 'en' ? ['en'] : ['en', locale];
  let texts: Record<string, string> = {};
  for (const language of languages) {
    const found = await Promise.allSettled(parts.map(async (part) => part.messages?.[language]?.()));
    for (const result of found) {
      if (result.status === 'rejected') reportClientError(result.reason);
      else texts = { ...texts, ...result.value?.default };
    }
  }
  return texts;
}
