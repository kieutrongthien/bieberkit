/**
 * BieberKit
 *
 * @file        packages/admin-antd/src/lib/shortcuts.ts
 * @description The keys of the screens: the hook that listens for them and hands over the shortcut that a press is (UI-17).
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

import { shortcutOf } from '@bieberkit/admin-core';
import type { Shortcut } from '@bieberkit/admin-core';
import { useEffect } from 'react';

/** Whether the focus is in a place where a key is typed. */
export const isTyping = (target: EventTarget | null): boolean =>
  target instanceof HTMLElement &&
  (['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName) || target.isContentEditable);

/** Calls `handle` for each shortcut of the page. `handle` may say that it took the key, and then the browser does not get it. */
export function useShortcuts(handle: (shortcut: Shortcut) => boolean): void {
  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      const shortcut = shortcutOf({
        key: event.key,
        ctrl: event.ctrlKey,
        meta: event.metaKey,
        alt: event.altKey,
        shift: event.shiftKey,
        typing: isTyping(event.target),
      });
      if (shortcut !== undefined && handle(shortcut)) event.preventDefault();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  });
}
