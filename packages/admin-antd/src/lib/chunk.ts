/**
 * BieberKit
 *
 * @file        packages/admin-antd/src/lib/chunk.ts
 * @description The reload of a tab whose screen files were replaced by a deploy (UI-22).
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

import { chunkReload, isChunkError } from '@bieberkit/admin-core';

const KEY = 'bk-chunk-reload';

function lastReload(): number | undefined {
  try {
    const text = window.sessionStorage.getItem(KEY);
    const at = text === null ? Number.NaN : Number(text);
    return Number.isFinite(at) ? at : undefined;
  } catch {
    return undefined;
  }
}

/**
 * A screen that could not be loaded means that the files of this tab are gone: reload the page, once. A second failure within a minute
 * is shown to the person, so a bad deploy cannot make the page reload for ever. It answers what it did.
 */
export function reloadForChunk(error: unknown): 'reload' | 'show' | 'ignore' {
  if (!isChunkError(error)) return 'ignore';
  const now = Date.now();
  const decision = chunkReload(now, lastReload());
  if (decision === 'reload') {
    try {
      window.sessionStorage.setItem(KEY, String(now));
    } catch {
      // Without storage the page may reload more than once, and the person sees the error at the second chunk failure of a load.
    }
    window.location.reload();
  }
  return decision;
}
