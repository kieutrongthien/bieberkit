/**
 * BieberKit
 *
 * @file        packages/admin-core/src/shortcuts.ts
 * @description The keyboard shortcuts of the admin: save, new and search (UI-17).
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

export type Shortcut = 'save' | 'new' | 'search' | 'goto';

export interface KeyPress {
  readonly key: string;
  readonly ctrl: boolean;
  readonly meta: boolean;
  readonly alt: boolean;
  readonly shift: boolean;
  /** A field, a text area or an editable element has the focus. */
  readonly typing: boolean;
}

/**
 * The shortcut that a key press is. Ctrl+S or Cmd+S saves, also from a field. `n` for a new record and `/` for the search work only
 * when nobody is typing, and never with a modifier, so they do not take a letter from a field or a command of the browser.
 */
export function shortcutOf(press: KeyPress): Shortcut | undefined {
  const mod = press.ctrl || press.meta;
  if (mod && !press.alt) {
    const key = press.key.toLowerCase();
    // Ctrl+Shift+K is a command of a browser.
    if (key === 'k') return press.shift ? undefined : 'goto';
    return key === 's' ? 'save' : undefined;
  }
  if (mod || press.alt || press.shift || press.typing) return undefined;
  if (press.key === 'n') return 'new';
  if (press.key === '/') return 'search';
  return undefined;
}
