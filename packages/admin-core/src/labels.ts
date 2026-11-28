/**
 * BieberKit
 *
 * @file        packages/admin-core/src/labels.ts
 * @description A text that comes by language, as the metadata and the config give it (UI-05).
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

import type { MetaLabel } from './types.ts';

/** A label in the language, then in English, then the first that there is, then the fallback. */
export function labelText(label: MetaLabel | undefined, locale: string, fallback = ''): string {
  if (label === undefined) return fallback;
  return label[locale] ?? label['en'] ?? Object.values(label)[0] ?? fallback;
}
