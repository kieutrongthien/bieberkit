/**
 * BieberKit
 *
 * @file        packages/auth/src/registry.test.ts
 * @description Tests of the permission registry: how the strings of an entity map to a subject and an action (AUTHZ-01, AUTHZ-03).
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
import { defineEntity, f } from '@bieberkit/data';
import { buildPermissionRegistry } from './registry.ts';
import { Deal, Plain } from './testing/sample.ts';

describe('AUTHZ-01 the registry of permissions', () => {
  const registry = buildPermissionRegistry([Deal, Plain]);
  const of = (permission: string) =>
    registry.entriesOf(permission).map((entry) => [entry.subject, entry.action, entry.field, entry.fieldAccess]);

  it('AUTHZ-01 maps the four permissions of an entity to its name and the four actions', () => {
    expect(of('crm.deal.read')).toEqual([['crm.Deal', 'read', undefined, undefined]]);
    expect(of('crm.deal.create')).toEqual([['crm.Deal', 'create', undefined, undefined]]);
    expect(of('crm.deal.update')).toEqual([['crm.Deal', 'update', undefined, undefined]]);
    expect(of('crm.deal.delete')).toEqual([['crm.Deal', 'delete', undefined, undefined]]);
  });

  it('AUTHZ-01 does not read the meaning out of the name: any string can be a permission', () => {
    const odd = buildPermissionRegistry([
      defineEntity({
        name: 'sales.Quote',
        table: 'sales_quotes',
        fields: { id: f.id() },
        permissions: { read: 'sales.view', update: 'sales.manage' },
      }),
    ]);
    expect(odd.entriesOf('sales.view').map((entry) => [entry.subject, entry.action])).toEqual([
      ['sales.Quote', 'read'],
    ]);
    expect(odd.entriesOf('sales.manage').map((entry) => [entry.subject, entry.action])).toEqual([
      ['sales.Quote', 'update'],
    ]);
  });

  it('AUTHZ-01 names the default permissions of an entity that declares none like the HTTP layer does', () => {
    expect(of('crm.plain.read')).toEqual([['crm.Plain', 'read', undefined, undefined]]);
    expect(of('crm.plain.delete')).toEqual([['crm.Plain', 'delete', undefined, undefined]]);
  });

  it('MOD-06 maps the permission of a transition to the action transition:<name>', () => {
    expect(of('crm.deal.close')).toEqual([['crm.Deal', 'transition:close', undefined, undefined]]);
  });

  it('MOD-06 a transition without a permission needs the update permission, and no entry of its own', () => {
    const plain = buildPermissionRegistry([
      defineEntity({
        name: 'crm.Task',
        table: 'crm_tasks',
        fields: { id: f.id(), s: f.state({ initial: 'a', transitions: { go: { from: ['a'], to: 'b' } } }) },
      }),
    ]);
    expect(plain.entries.some((entry) => entry.action === 'transition:go')).toBe(false);
    expect(plain.transitionPermission('crm.Task', 'go')).toBe('crm.task.update');
  });

  it('AUTHZ-03 maps the permissions of a masked field to the field and to read or update', () => {
    expect(of('crm.deal.read-margin')).toEqual([['crm.Deal', 'read', 'margin', 'read']]);
    expect(of('crm.deal.edit-margin')).toEqual([['crm.Deal', 'update', 'margin', 'update']]);
  });

  it('AUTHZ-01 a string that two entities, or two actions, use gives every entry', () => {
    const both = buildPermissionRegistry([
      defineEntity({
        name: 'crm.A',
        table: 'crm_a',
        fields: { id: f.id() },
        permissions: { read: 'crm.all', update: 'crm.all' },
      }),
      defineEntity({ name: 'crm.B', table: 'crm_b', fields: { id: f.id() }, permissions: { read: 'crm.all' } }),
    ]);
    expect(both.entriesOf('crm.all').map((entry) => `${entry.subject}:${entry.action}`)).toEqual([
      'crm.A:read',
      'crm.A:update',
      'crm.B:read',
    ]);
  });

  it('AUTHZ-01 a string that no entity declares has no entry, and is a plain capability', () => {
    expect(registry.entriesOf('system.api-docs')).toEqual([]);
    expect(registry.declares('crm.deal.read')).toBe(true);
    expect(registry.declares('system.api-docs')).toBe(false);
  });

  it('AUTHZ-01 lists the entries in a fixed order, whatever the order of the entities', () => {
    const one = buildPermissionRegistry([Deal, Plain]).entries.map((entry) => entry.permission);
    const two = buildPermissionRegistry([Plain, Deal]).entries.map((entry) => entry.permission);
    expect(two).toEqual(one);
  });

  it('AUTHZ-01 refuses an entity that is listed twice', () => {
    expect(() => buildPermissionRegistry([Deal, Deal])).toThrow(
      expect.objectContaining({ code: 'AUTHZ_PERMISSION_CONFLICT' }),
    );
  });
});
