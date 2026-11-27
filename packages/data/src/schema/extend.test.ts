/**
 * BieberKit
 *
 * @file        packages/data/src/schema/extend.test.ts
 * @description Tests of entity extensions: the declaration, its validation, and the effective entity that the rest of the framework reads (PLG-06, ADR 0033).
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
import { defineEntity } from './define-entity.ts';
import type { FieldLike } from './define-entity.ts';
import { defineExtension, resolveExtensions } from './extend.ts';
import { f } from './fields.ts';

const Page = defineEntity({
  name: 'pages.Page',
  table: 'pages_pages',
  tenant: true,
  fields: { id: f.id(), title: f.string({ max: 100 }), slug: f.string({ max: 100 }).unique() },
  permissions: { read: 'pages.read', update: 'pages.write', fields: { slug: { update: 'pages.slug' } } },
  api: { list: true, get: true, create: true, update: true },
});
const Tag = defineEntity({
  name: 'pages.Tag',
  table: 'pages_tags',
  fields: { id: f.id(), name: f.string({ max: 20 }) },
});

const PageSeo = defineExtension({
  table: 'seo_page_ext',
  fields: { seoTitle: f.string({ max: 70 }).optional(), noindex: f.boolean().default(false) },
  permissions: { fields: { noindex: { read: 'seo.read', update: 'seo.manage' } } },
});

const make =
  (table: string, fields: Record<string, FieldLike> = { a: f.string({ max: 5 }) }) =>
  () =>
    defineExtension({ table, fields });
const onlyField = (field: FieldLike) => () => defineExtension({ table: 'seo_page_ext', fields: { bad: field } });
const ghostPermission = () =>
  defineExtension({
    table: 'seo_page_ext',
    fields: { seoTitle: f.string({ max: 5 }) },
    permissions: { fields: { ghost: { read: 'seo.read' } } },
  });

const failure = (run: () => unknown): { code: unknown; message: unknown } => {
  try {
    run();
  } catch (error) {
    return Object(error);
  }
  throw new Error('It did not throw.');
};

describe('PLG-06 defineExtension', () => {
  it('PLG-06 keeps the table, the fields and the permissions of the declaration, frozen', () => {
    expect(PageSeo.table).toBe('seo_page_ext');
    expect(Object.keys(PageSeo.fields)).toEqual(['seoTitle', 'noindex']);
    expect(PageSeo.permissions.fields).toEqual({ noindex: { read: 'seo.read', update: 'seo.manage' } });
    expect(Object.isFrozen(PageSeo)).toBe(true);
  });

  it('PLG-06 refuses a table that is not snake case or is longer than 40 characters, and an empty list of fields', () => {
    expect(failure(make('Seo-Page')).code).toBe('DATA_EXTENSION_INVALID');
    expect(failure(make('s'.repeat(41))).code).toBe('DATA_EXTENSION_INVALID');
    expect(failure(make('seo_page_ext', {})).code).toBe('DATA_EXTENSION_INVALID');
  });

  it('PLG-06 refuses a relation, a feature-like or generated field: only scalar fields are stored in an extension', () => {
    expect(failure(onlyField(f.belongsTo(() => Tag))).code).toBe('DATA_EXTENSION_INVALID');
    expect(failure(onlyField(f.sequence({ pattern: 'P-{seq:4}' }))).code).toBe('DATA_EXTENSION_INVALID');
  });

  it('PLG-06 refuses a name that the entity reserves, such as id, version and tenantId', () => {
    for (const name of ['id', 'version', 'tenantId', 'createdAt']) {
      expect(
        failure(() => defineExtension({ table: 'seo_page_ext', fields: { [name]: f.string({ max: 5 }) } })).code,
      ).toBe('DATA_EXTENSION_INVALID');
    }
  });

  it('PLG-06 refuses a field permission for a field that the extension does not have', () => {
    expect(failure(ghostPermission).code).toBe('DATA_EXTENSION_INVALID');
  });
});

describe('PLG-06 resolveExtensions', () => {
  const seo = { module: 'seo', target: 'pages.Page', extension: PageSeo };

  it('PLG-06 gives the target its own fields and then the fields of its extensions, and leaves the other entities as they are', () => {
    const resolved = resolveExtensions([Page, Tag], [seo]);
    const page = resolved.entities.find((entity) => entity.name === 'pages.Page');
    expect(Object.keys(page?.fields ?? {})).toEqual(['id', 'title', 'slug', 'seoTitle', 'noindex']);
    expect(resolved.entities.find((entity) => entity.name === 'pages.Tag')).toBe(Tag);
    expect(resolved.entities.map((entity) => entity.name)).toEqual(['pages.Page', 'pages.Tag']);
  });

  it("PLG-06 merges the permissions: the field masks of the extension join those of the target, and the rest is the target's", () => {
    const page = resolveExtensions([Page], [seo]).entities[0];
    expect(page?.permissions).toEqual({
      read: 'pages.read',
      update: 'pages.write',
      fields: { slug: { update: 'pages.slug' }, noindex: { read: 'seo.read', update: 'seo.manage' } },
    });
    expect(page?.api).toEqual(Page.api);
    expect(page?.tenant).toBe(true);
  });

  it('PLG-06 makes the extension entity: the table of the declaration, the tenant of the target, the record that it belongs to and the fields', () => {
    const [ext] = resolveExtensions([Page], [seo]).extensions;
    expect(ext).toMatchObject({ module: 'seo', target: 'pages.Page', fields: ['seoTitle', 'noindex'] });
    expect(ext?.entity).toMatchObject({ table: 'seo_page_ext', tenant: true, name: 'seo.PageExt' });
    expect(Object.keys(ext?.entity.fields ?? {})).toEqual(['id', 'record', 'seoTitle', 'noindex']);
  });

  it('PLG-06 a target with no tenant has an extension with no tenant', () => {
    const Plain = defineEntity({ name: 'pages.Plain', table: 'pages_plain', fields: { id: f.id() } });
    const [ext] = resolveExtensions(
      [Plain],
      [
        {
          module: 'seo',
          target: 'pages.Plain',
          extension: defineExtension({ table: 'seo_plain_ext', fields: { x: f.int({ min: 0 }) } }),
        },
      ],
    ).extensions;
    expect(ext?.entity.tenant).toBe(false);
  });

  it('PLG-06 two extensions of one target are both merged, in the order that they are given', () => {
    const second = defineExtension({ table: 'meta_page_ext', fields: { note: f.text({ max: 50 }).optional() } });
    const page = resolveExtensions([Page], [seo, { module: 'meta', target: 'pages.Page', extension: second }])
      .entities[0];
    expect(Object.keys(page?.fields ?? {})).toEqual(['id', 'title', 'slug', 'seoTitle', 'noindex', 'note']);
  });

  it('PLG-06 without an extension the entities come back as they are', () => {
    const resolved = resolveExtensions([Page, Tag], []);
    expect(resolved.entities).toEqual([Page, Tag]);
    expect(resolved.extensions).toEqual([]);
  });

  it('PLG-06 an unknown target is DATA_EXTENSION_TARGET_UNKNOWN and names the module and the target', () => {
    const error = failure(() => resolveExtensions([Page], [{ ...seo, target: 'pages.Ghost' }]));
    expect(error['code']).toBe('DATA_EXTENSION_TARGET_UNKNOWN');
    expect(String(error['message'])).toContain('pages.Ghost');
    expect(String(error['message'])).toContain('seo');
  });

  it('PLG-06 a field that the target has is DATA_EXTENSION_FIELD_CLASH, and so is one that another extension has', () => {
    const clash = defineExtension({ table: 'seo_page_ext', fields: { title: f.string({ max: 5 }) } });
    expect(failure(() => resolveExtensions([Page], [{ ...seo, extension: clash }]))['code']).toBe(
      'DATA_EXTENSION_FIELD_CLASH',
    );
    const again = defineExtension({ table: 'meta_page_ext', fields: { seoTitle: f.string({ max: 5 }) } });
    const error = failure(() =>
      resolveExtensions([Page], [seo, { module: 'meta', target: 'pages.Page', extension: again }]),
    );
    expect(error['code']).toBe('DATA_EXTENSION_FIELD_CLASH');
    expect(String(error['message'])).toContain('seoTitle');
  });

  it('PLG-06 a table that an entity or another extension uses is DATA_EXTENSION_TABLE_CLASH', () => {
    const taken = defineExtension({ table: 'pages_tags', fields: { a: f.string({ max: 5 }) } });
    expect(failure(() => resolveExtensions([Page, Tag], [{ ...seo, extension: taken }]))['code']).toBe(
      'DATA_EXTENSION_TABLE_CLASH',
    );
    const same = defineExtension({ table: 'seo_page_ext', fields: { other: f.string({ max: 5 }) } });
    expect(
      failure(() => resolveExtensions([Page], [seo, { module: 'meta', target: 'pages.Page', extension: same }]))[
        'code'
      ],
    ).toBe('DATA_EXTENSION_TABLE_CLASH');
  });

  it('PLG-06 an extension cannot extend an extension: its target is an entity of a module', () => {
    const error = failure(() =>
      resolveExtensions([Page], [seo, { module: 'meta', target: 'seo.PageExt', extension: PageSeo }]),
    );
    expect(error['code']).toBe('DATA_EXTENSION_TARGET_UNKNOWN');
  });
});
