/**
 * BieberKit
 *
 * @file        packages/admin-antd/src/slot-types.test.ts
 * @description The types of the slots: one admin part holds components with the props of each slot, with the contract of admin-core and no cast (UI-35, UI-38). `pnpm typecheck` is what fails.
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

import { composeAdmin, defineAdminPlugin } from '@bieberkit/admin-core';
import { describe, expect, it } from 'vitest';
import type {
  AdminPart,
  FieldProps,
  GateProps,
  NoticeProps,
  RecordTabProps,
  ScreenProps,
  SignInProps,
} from './index.ts';

const tab = (_props: RecordTabProps): null => null;
const field = (_props: FieldProps): null => null;
const notice = (_props: NoticeProps): null => null;
const gate = (_props: GateProps): null => null;
const screen = (_props: ScreenProps): null => null;
const signIn = (_props: SignInProps): null => null;
const plain = (): null => null;
const of =
  <C>(component: C) =>
  async (): Promise<{ default: C }> => ({ default: component });

describe('UI-35 the types of the slots', () => {
  it('UI-35 one part holds components with the props of each slot', () => {
    const part: AdminPart = defineAdminPlugin({
      name: 'bieberkit-plugin-notes',
      pages: [{ path: '/notes', title: 'notes.title', load: of(plain) }],
      recordTabs: [{ id: 'tab', entity: '*', title: 'notes.title', load: of(tab) }],
      fields: [{ id: 'field', widget: 'note', load: of(field) }],
      notices: [{ id: 'notice', load: of(notice) }],
      gates: [{ id: 'gate', needed: (state) => state.metaError !== null, load: of(gate) }],
      screens: [{ id: 'screen', replace: 'list:notes.Note', load: of(screen) }],
      signIn: { load: of(signIn) },
    });
    expect(composeAdmin([part]).problems).toEqual([]);
  });

  it('UI-36 a key that a contribution does not have is a type error, so a permission that is spelled wrong is not left out', () => {
    const part: AdminPart = defineAdminPlugin({
      name: 'bieberkit-plugin-notes',
      // @ts-expect-error -- `permision` is no key of a page
      pages: [{ path: '/notes', title: 'notes.title', load: of(plain), permision: 'notes.read' }],
    });
    expect(part.name).toBe('bieberkit-plugin-notes');
  });
});
