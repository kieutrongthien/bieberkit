/**
 * BieberKit
 *
 * @file        packages/admin-core/src/shortcuts.test.ts
 * @description Tests of the keyboard shortcuts of the admin: save, new and search (UI-17).
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

import { describe, expect, it } from 'vitest';
import { shortcutOf } from './shortcuts.ts';

const press = (
  key: string,
  extra: Partial<{ ctrl: boolean; meta: boolean; alt: boolean; shift: boolean; typing: boolean }> = {},
) => shortcutOf({ key, ctrl: false, meta: false, alt: false, shift: false, typing: false, ...extra });

describe('UI-17 the shortcuts', () => {
  it('UI-17 Ctrl+S and Cmd+S save, also when a field has the focus', () => {
    expect(press('s', { ctrl: true, typing: true })).toBe('save');
    expect(press('S', { meta: true })).toBe('save');
    expect(press('s')).toBeUndefined();
    expect(press('s', { ctrl: true, alt: true })).toBeUndefined();
  });

  it('UI-17 N opens a new record and / goes to the search, but only when nobody is typing', () => {
    expect(press('n')).toBe('new');
    expect(press('/')).toBe('search');
    expect(press('n', { typing: true })).toBeUndefined();
    expect(press('/', { typing: true })).toBeUndefined();
    expect(press('n', { ctrl: true })).toBeUndefined();
    expect(press('n', { shift: true })).toBeUndefined();
  });

  it('UI-17 any other key is not a shortcut', () => {
    for (const key of ['a', 'Enter', 'Escape', 'ArrowDown']) expect(press(key)).toBeUndefined();
  });
});
