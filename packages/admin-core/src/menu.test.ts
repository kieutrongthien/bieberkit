/**
 * BieberKit
 *
 * @file        packages/admin-core/src/menu.test.ts
 * @description Tests of the menu of the admin: its groups and their order, the entries that no group names, the search of a page without accents and the entry of an address (UI-24).
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
import { currentEntry, DEFAULT_MENU, menuOf, searchMenu } from './menu.ts';
import type { MenuEntry, MenuGroup } from './menu.ts';
import type { Meta, MetaEntity } from './types.ts';

const entity = (name: string, label: string, more: Partial<MetaEntity> = {}): MetaEntity => {
  const [module = '', short = ''] = name.split('.');
  return {
    name,
    path: `/api/v1/${module}/${short.toLowerCase()}s`,
    label: { en: label, vi: label },
    operations: { list: true, get: true, create: true, update: true, delete: true },
    can: { read: true, create: true, update: true, delete: true },
    softDelete: false,
    tenant: false,
    list: [],
    form: [],
    fields: [],
    ...more,
  };
};

const meta = (entities: readonly MetaEntity[]): Meta => ({ schemaVersion: 2, entities, permissions: [] });

const page = (path: string, module: string, group?: string) => ({
  path,
  module,
  label: { en: path.slice(1) },
  icons: [module],
  ...(group === undefined ? {} : { group }),
});

const shape = (groups: readonly MenuGroup[]): [string, string[]][] =>
  groups.map((group) => [group.id, group.entries.map((entry) => entry.key)]);

describe('UI-24 the groups of the menu', () => {
  it('UI-24 without an order: what the project adds first, then people, content and system, and no empty group', () => {
    const groups = menuOf(
      meta([
        entity('media.Media', 'Media'),
        entity('notifications.Notification', 'Notifications'),
        entity('settings.Setting', 'Settings'),
        entity('shop.Order', 'Orders'),
      ]),
    );
    expect(shape(groups)).toEqual([
      ['app', ['shop.Order']],
      ['content', ['media.Media', 'notifications.Notification']],
      ['system', ['settings.Setting']],
    ]);
    expect(DEFAULT_MENU.map((group) => group.id)).toEqual(['app', 'people', 'content', 'system']);
  });

  it('UI-24 only what the person may list is in it', () => {
    const groups = menuOf(
      meta([
        entity('shop.Order', 'Orders', { can: { read: false, create: false, update: false, delete: false } }),
        entity('shop.Item', 'Items', {
          operations: { list: false, get: true, create: false, update: false, delete: false },
        }),
      ]),
    );
    expect(groups).toEqual([]);
  });

  it('UI-24 an order of the config names an entity, a module or a page of a plugin, in the order of its items', () => {
    const groups = menuOf(
      meta([entity('shop.Item', 'Items'), entity('shop.Order', 'Orders'), entity('crm.Deal', 'Deals')]),
      [{ id: 'sales', label: { en: 'Sales' }, items: ['/sales', 'shop.Order', 'shop'] }],
      [page('/sales', 'reports')],
    );
    expect(shape(groups)).toEqual([
      ['sales', ['/sales', 'shop.Order', 'shop.Item']],
      // What no group names is not lost: it goes to `app`, at the end when the order has none.
      ['app', ['crm.Deal']],
    ]);
    expect(groups[0]?.label).toEqual({ en: 'Sales' });
  });

  it('UI-24 an entry that two groups name is in the first one only, and a name of nothing is ignored', () => {
    const groups = menuOf(meta([entity('shop.Order', 'Orders')]), [
      { id: 'one', label: 'One', items: ['nothing', 'shop'] },
      { id: 'two', label: 'Two', items: ['shop.Order'] },
    ]);
    expect(shape(groups)).toEqual([['one', ['shop.Order']]]);
  });

  it('UI-24 an entry knows its address and the names of its icon, the one of the entity first', () => {
    const [group] = menuOf(meta([entity('shop.Order', 'Orders', { icon: 'bell' })]), DEFAULT_MENU, [
      page('/sales', 'reports'),
    ]);
    expect(group?.entries.map((entry) => [entry.path, entry.icons])).toEqual([
      ['/shop/orders', ['bell', 'shop']],
      ['/sales', ['reports']],
    ]);
  });
});

const label = (entry: MenuEntry): string => entry.label['vi'] ?? entry.name;

describe('UI-24 go to a page', () => {
  const groups = menuOf(meta([entity('users.User', 'Người dùng'), entity('shop.Order', 'Đơn hàng')]));
  const found = (text: string): string[] => searchMenu(groups, text, label).map((entry) => entry.key);

  it('UI-24 it finds a label without case and without accents, and đ is d', () => {
    expect(found('nguoi dung')).toEqual(['users.User']);
    expect(found('DON HANG')).toEqual(['shop.Order']);
    expect(found('  Đơn ')).toEqual(['shop.Order']);
  });

  it('UI-24 no text gives every page in the order of the menu, and a text of nothing gives none', () => {
    expect(found('')).toEqual(['shop.Order', 'users.User']);
    expect(found('zzz')).toEqual([]);
  });
});

describe('UI-24 the entry of an address', () => {
  const groups = menuOf(meta([entity('shop.Order', 'Orders')]), DEFAULT_MENU, [
    page('/a', 'reports'),
    page('/a2', 'reports'),
  ]);

  it('UI-24 the list, a record and a new record are the entry of the list', () => {
    for (const path of ['/shop/orders', '/shop/orders/new', '/shop/orders/0198'])
      expect(currentEntry(groups, path)?.entry.key).toBe('shop.Order');
    expect(currentEntry(groups, '/a2')?.entry.key).toBe('/a2');
  });

  it('UI-24 an address of no entry has none', () => {
    expect(currentEntry(groups, '/')).toBeUndefined();
    expect(currentEntry(groups, '/shop/ordersx')).toBeUndefined();
  });
});

describe('UI-35 the pages of plugins in the menu', () => {
  const entities = [entity('media.Media', 'Media'), entity('shop.Order', 'Orders')];

  it('UI-35 a page goes to the group that it asks for, after what is there, and one that asks for none to what the project adds', () => {
    const groups = menuOf(meta(entities), DEFAULT_MENU, [
      page('/reports', 'crm'),
      page('/albums', 'albums', 'content'),
      page('/team', 'team', 'people'),
    ]);
    expect(shape(groups)).toEqual([
      ['app', ['shop.Order', '/reports']],
      ['people', ['/team']],
      ['content', ['media.Media', '/albums']],
    ]);
  });

  it('UI-24 the order of the config wins over the group that a page asks for, by its address or the name of its plugin', () => {
    const order = [
      { id: 'first', items: ['/reports', 'albums'] },
      { id: 'content', items: ['media'] },
    ];
    const groups = menuOf(meta(entities), order, [
      page('/reports', 'crm', 'content'),
      page('/albums', 'albums', 'content'),
    ]);
    expect(shape(groups)).toEqual([
      ['first', ['/reports', '/albums']],
      ['content', ['media.Media']],
      ['app', ['shop.Order']],
    ]);
  });

  it('UI-35 a page that asks for a group that the menu has not makes that group', () => {
    const groups = menuOf(meta([]), DEFAULT_MENU, [page('/stock', 'stock', 'warehouse')]);
    expect(shape(groups)).toEqual([['warehouse', ['/stock']]]);
    expect(groups[0]?.entries[0]).toEqual({
      key: '/stock',
      path: '/stock',
      label: { en: 'stock' },
      name: '/stock',
      icons: ['stock'],
    });
  });
});
