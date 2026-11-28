/**
 * BieberKit
 *
 * @file        packages/admin-core/src/compose.test.ts
 * @description Tests of the admin part of a plugin: what the parts of a project make together, every mistake that stops its build, the texts of each language and what a person may see (UI-34, UI-35, UI-36).
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
import { allowed, composeAdmin, messageProblems } from './compose.ts';
import { defineAdminPlugin, shortNameOf } from './part.ts';
import type { AdminPart, AdminPartInput } from './part.ts';

type View = () => null;
const load = async (): Promise<{ default: View }> => ({ default: () => null });
const part = (name: string, input: Omit<AdminPartInput<View>, 'name'> = {}): AdminPart<View> =>
  defineAdminPlugin<View>({ name, ...input });
/** A part that gives the sign in, which the admin needs. */
const base = part('@bieberkit/plugin-users', { signIn: { load } });
const codes = (parts: readonly AdminPart<View>[]): string[] => composeAdmin(parts).problems.map((p) => p.code);

describe('UI-35 what the parts make together', () => {
  it('UI-35 keeps the order of the parts in every slot, and says whose each contribution is', () => {
    const { admin, problems } = composeAdmin([
      base,
      part('bieberkit-plugin-notes', {
        pages: [{ path: '/notes', title: 'notes.title', load }],
        menu: [{ page: '/notes', group: 'content', permission: 'notes.read' }],
        headerActions: [{ id: 'new', load }],
        recordTabs: [{ id: 'notes', entity: '*', title: 'notes.title', load }],
      }),
      part('bieberkit-plugin-tags', { headerActions: [{ id: 'new', load }] }),
    ]);
    expect(problems).toEqual([]);
    expect(admin.pages.map((page) => [page.plugin, page.path])).toEqual([['bieberkit-plugin-notes', '/notes']]);
    expect(admin.menu.map((entry) => [entry.plugin, entry.page, entry.permission])).toEqual([
      ['bieberkit-plugin-notes', '/notes', 'notes.read'],
    ]);
    expect(admin.headerActions.map((action) => action.plugin)).toEqual([
      'bieberkit-plugin-notes',
      'bieberkit-plugin-tags',
    ]);
    expect(admin.signIn?.plugin).toBe('@bieberkit/plugin-users');
    expect(admin.recordTabs).toHaveLength(1);
  });

  it('UI-26 the tabs of the account of the plugin that gives the sign in come first, whatever the order of the plugins', () => {
    const tab = (id: string) => ({ id, title: `x.${id}`, load });
    const { admin } = composeAdmin([
      part('bieberkit-plugin-a', { accountTabs: [tab('tokens')] }),
      part('@bieberkit/plugin-users', { signIn: { load }, accountTabs: [tab('profile'), tab('sessions')] }),
      part('bieberkit-plugin-z', { accountTabs: [tab('keys')] }),
    ]);
    expect(admin.accountTabs.map((item) => item.id)).toEqual(['profile', 'sessions', 'tokens', 'keys']);
  });

  it('UI-36 the short name of a plugin, which its texts begin with, is the one without the marks of a plugin', () => {
    expect(shortNameOf('@bieberkit/plugin-audit-log')).toBe('audit-log');
    expect(shortNameOf('bieberkit-plugin-notes')).toBe('notes');
    expect(shortNameOf('@acme/bieberkit-plugin-crm')).toBe('crm');
    expect(shortNameOf('@acme/plugin-crm')).toBe('crm');
    expect(shortNameOf('app')).toBe('app');
  });
});

/** A part that gives a control and replaces a screen. */
const one = (name: string) =>
  part(name, {
    fields: [{ id: 'f', widget: 'file', load }],
    screens: [{ id: 's', replace: 'list:crm.Deal', load }],
  });

describe('UI-36 the mistakes that stop the build', () => {
  it('UI-36 a key that is no slot: the list of slots is closed', () => {
    // What a plugin written in JavaScript, or against another version, can give: a key that the type does not have.
    const wrong: AdminPartInput<View> = Object.assign({ name: 'bieberkit-plugin-x' }, { sidebar: [] });
    const { problems } = composeAdmin([base, defineAdminPlugin(wrong)]);
    expect(problems).toEqual([
      { plugin: 'bieberkit-plugin-x', code: 'unknown-key', message: expect.stringContaining('sidebar') },
    ]);
  });

  it('UI-36 an address that is not one segment, which would be taken for the list of an entity', () => {
    const paths = ['notes', '/a/b', '/', '/Notes', '/notes/', '/:id'];
    const found = paths.map((path) => [
      path,
      codes([base, part('bieberkit-plugin-x', { pages: [{ path, title: 'x.t', load }] })]),
    ]);
    expect(found).toEqual(paths.map((path) => [path, ['bad-path']]));
  });

  it('UI-36 an address of the shell', () => {
    const found = ['/account', '/ext'].map((path) =>
      codes([base, part('bieberkit-plugin-x', { publicPages: [{ path, load }] })]),
    );
    expect(found).toEqual([['reserved-path'], ['reserved-path']]);
  });

  it('UI-36 one address for two pages, with a session or without one, of two plugins', () => {
    const { problems } = composeAdmin([
      base,
      part('bieberkit-plugin-a', { pages: [{ path: '/same', title: 'a.t', load }] }),
      part('bieberkit-plugin-b', { publicPages: [{ path: '/same', load }] }),
    ]);
    expect(problems).toEqual([
      { plugin: 'bieberkit-plugin-b', code: 'duplicate-path', message: expect.stringContaining('bieberkit-plugin-a') },
    ]);
  });

  it('UI-36 one id twice in a plugin, and not the same id in two plugins', () => {
    expect(
      codes([base, part('bieberkit-plugin-x', { headerActions: [{ id: 'a', load }], notices: [{ id: 'a', load }] })]),
    ).toEqual(['duplicate-id']);
  });

  it('UI-36 two controls for one widget, and two screens in place of one', () => {
    expect(codes([base, one('bieberkit-plugin-a'), one('bieberkit-plugin-b')])).toEqual([
      'duplicate-field',
      'duplicate-screen',
    ]);
  });

  it('UI-36 a menu entry for a page that the plugin does not have', () => {
    expect(codes([base, part('bieberkit-plugin-x', { menu: [{ page: '/nowhere' }] })])).toEqual(['menu-without-page']);
  });

  it('UI-26 no sign in, which the admin needs, and two of them', () => {
    expect(codes([])).toEqual(['no-sign-in']);
    expect(codes([base, part('bieberkit-plugin-x', { signIn: { load } })])).toEqual(['two-sign-ins']);
  });

  it('UI-36 every mistake is told at once, in the order of the parts', () => {
    const { problems } = composeAdmin([
      part('bieberkit-plugin-a', { menu: [{ page: '/x' }], pages: [{ path: 'bad', title: 'a.t', load }] }),
      part('bieberkit-plugin-b', { publicPages: [{ path: '/account', load }] }),
    ]);
    expect(problems.map((p) => [p.plugin, p.code])).toEqual([
      ['bieberkit-plugin-a', 'bad-path'],
      ['bieberkit-plugin-a', 'menu-without-page'],
      ['bieberkit-plugin-b', 'reserved-path'],
      ['', 'no-sign-in'],
    ]);
  });
});

const texts = (value: Readonly<Record<string, string>>) => async () => ({ default: value });

/** A plugin with one page, whose title is a key, and these texts. */
const notes = (messages: AdminPartInput<View>['messages']) =>
  part('bieberkit-plugin-notes', {
    pages: [{ path: '/notes', title: 'notes.title', load }],
    ...(messages === undefined ? {} : { messages }),
  });

describe('UI-36 every language', () => {
  it('UI-36 a plugin with the same keys in each language of the project is accepted', async () => {
    const both = notes({ en: texts({ 'notes.title': 'Notes' }), vi: texts({ 'notes.title': 'Ghi chú' }) });
    expect(await messageProblems([both], ['en', 'vi'])).toEqual([]);
  });

  it('UI-36 a language of the project that is missing, a key that is missing and a key that no other language has', async () => {
    const some = notes({
      en: texts({ 'notes.title': 'Notes', 'notes.add': 'Add' }),
      vi: texts({ 'notes.title': 'Ghi chú', 'notes.old': 'Cũ' }),
    });
    const found = await messageProblems([some], ['en', 'vi', 'zh']);
    expect(found.map((p) => [p.code, p.message])).toEqual([
      ['message-missing', expect.stringContaining('notes.add')],
      ['message-extra', expect.stringContaining('notes.old')],
      ['message-missing', expect.stringContaining('zh')],
    ]);
  });

  it('UI-36 a language that the admin does not bundle is not asked of a plugin', async () => {
    expect(await messageProblems([notes({ en: texts({ 'notes.title': 'Notes' }) })], ['en', 'fr'])).toEqual([]);
  });

  it('UI-36 a title that is no text of the plugin, and a plugin with titles and no texts', async () => {
    expect((await messageProblems([notes({ en: texts({ 'notes.other': 'x' }) })], ['en'])).map((p) => p.code)).toEqual([
      'message-missing',
    ]);
    expect((await messageProblems([notes(undefined)], ['en'])).map((p) => p.code)).toEqual(['message-missing']);
  });

  it('UI-36 a key that does not begin with the short name of the plugin', async () => {
    const wrong = notes({ en: texts({ 'notes.title': 'Notes', 'users.title': 'Stolen' }) });
    expect(await messageProblems([wrong], ['en'])).toEqual([
      { plugin: 'bieberkit-plugin-notes', code: 'message-prefix', message: expect.stringContaining('users.title') },
    ]);
  });
});

describe('UI-36 what a person may see', () => {
  it('UI-36 keeps what asks for no permission and what the person holds', () => {
    const items = [{ id: 'free' }, { id: 'mine', permission: 'a.read' }, { id: 'other', permission: 'b.read' }];
    expect(allowed(items, new Set(['a.read'])).map((item) => item.id)).toEqual(['free', 'mine']);
    expect(allowed(items, new Set()).map((item) => item.id)).toEqual(['free']);
  });
});
