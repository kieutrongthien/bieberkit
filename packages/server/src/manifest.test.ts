/**
 * BieberKit
 *
 * @file        packages/server/src/manifest.test.ts
 * @description Tests of the collectors that fill the tables and the routes of a plugin manifest, including the tables of its extensions (PLG-06, PLG-07).
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

import { definePlugin, toManifest } from '@bieberkit/core';
import { defineEntity, defineExtension, f } from '@bieberkit/data';
import { expect, it } from 'vitest';
import { COLLECTORS } from './manifest.ts';

const Page = defineEntity({ name: 'pages.Page', table: 'pages_pages', fields: { id: f.id() } });
const PageSeo = defineExtension({ table: 'seo_page_ext', fields: { seoTitle: f.string({ max: 70 }).optional() } });
const MoreSeo = defineExtension({ table: 'seo_page_more', fields: { score: f.int({ min: 0 }).optional() } });

const plugin = (name: string, extra: Record<string, unknown> = {}) =>
  definePlugin({ name, version: '1.0.0', core: '*', dialects: ['sqlite'], ...extra });

it('PLG-07 the tables of a plugin are those of its entities', () => {
  expect(toManifest(plugin('@bieberkit/plugin-pages', { entities: [Page] }), COLLECTORS).tables).toEqual([
    'pages_pages',
  ]);
});

it('PLG-06 the tables of its extensions are listed too, so the resolver, the check and remove see them', () => {
  const seo = plugin('@bieberkit/plugin-seo', { extends: { 'pages.Page': PageSeo } });
  expect(toManifest(seo, COLLECTORS).tables).toEqual(['seo_page_ext']);
});

it('PLG-06 a plugin with entities and extensions lists all of its tables, sorted and once', () => {
  const both = plugin('@bieberkit/plugin-seo', {
    entities: [defineEntity({ name: 'seo.Meta', table: 'seo_meta', fields: { id: f.id() } })],
    extends: { 'pages.Page': PageSeo, 'pages.Tag': MoreSeo },
  });
  expect(toManifest(both, COLLECTORS).tables).toEqual(['seo_meta', 'seo_page_ext', 'seo_page_more']);
});
