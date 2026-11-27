/**
 * BieberKit
 *
 * @file        packages/admin-core/src/settings.ts
 * @description The `admin` key of bieberkit.config.ts: the brand of a project and the order of its menu, checked at boot and read back from the page (UI-24, UI-33).
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

import { LOCALES } from './i18n.ts';
import type { MetaLabel } from './types.ts';

export interface BrandSettings {
  /** 1 to 60 characters. It is the title of the page too. */
  readonly name?: string;
  /** A `data:` URI of a PNG, JPEG, WebP or SVG image. It shows on the frame, so it should read on a dark color. */
  readonly logo?: string;
  /** The sentence of the sign in, as one text or by language. */
  readonly tagline?: string | MetaLabel;
}

export interface MenuGroupSettings {
  /** `app`, `people`, `content` and `system` have a translated name. Another id takes a `label`. */
  readonly id: string;
  readonly label?: string | MetaLabel;
  /** Each names an entity (`shop.Order`), a module (`shop`) or the address of a page of a plugin (`/ext/reports/sales`). */
  readonly items: readonly string[];
}

export interface AdminSettings {
  readonly brand?: BrandSettings;
  readonly menu?: readonly MenuGroupSettings[];
}

/** The ids of the groups that the framework names in every language. */
export const BUILTIN_MENU_GROUPS: readonly string[] = ['app', 'people', 'content', 'system'];

const NAME_MAX = 60;
const TAGLINE_MAX = 120;
const LABEL_MAX = 60;
const LOGO_MAX = 100_000;
const LOGO = /^data:image\/(?:png|jpeg|webp|svg\+xml);base64,[A-Za-z0-9+/]+={0,2}$/;
const GROUP_ID = /^[a-z][a-z0-9-]*$/;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const isText = (value: unknown, max: number): value is string =>
  typeof value === 'string' && value.trim() !== '' && value.length <= max;

function unknownKeys(input: Record<string, unknown>, known: readonly string[], path: string, problems: string[]): void {
  for (const key of Object.keys(input))
    if (!known.includes(key)) problems.push(`${path}.${key}: is not a key (${known.join(', ')}).`);
}

/** One text, or one for each language of the admin. */
function checkLabel(input: unknown, max: number, path: string, problems: string[]): void {
  if (isText(input, max)) return;
  if (!isRecord(input) || Object.keys(input).length === 0) {
    problems.push(`${path}: is a text of 1 to ${max} characters, or one for each language (${LOCALES.join(', ')}).`);
    return;
  }
  for (const [locale, text] of Object.entries(input)) {
    if (!LOCALES.some((known) => known === locale))
      problems.push(`${path}.${locale}: is not a language of the admin (${LOCALES.join(', ')}).`);
    else if (!isText(text, max)) problems.push(`${path}.${locale}: is a text of 1 to ${max} characters.`);
  }
}

function checkBrand(input: unknown, problems: string[]): void {
  if (!isRecord(input)) {
    problems.push('admin.brand: is an object with name, logo and tagline.');
    return;
  }
  unknownKeys(input, ['name', 'logo', 'tagline'], 'admin.brand', problems);
  if (input['name'] !== undefined && !isText(input['name'], NAME_MAX))
    problems.push(`admin.brand.name: is a text of 1 to ${NAME_MAX} characters.`);
  const logo = input['logo'];
  if (logo !== undefined && !(typeof logo === 'string' && logo.length <= LOGO_MAX && LOGO.test(logo)))
    problems.push(
      `admin.brand.logo: is a data: URI of a PNG, JPEG, WebP or SVG image in base64, of at most ${LOGO_MAX} characters.`,
    );
  if (input['tagline'] !== undefined) checkLabel(input['tagline'], TAGLINE_MAX, 'admin.brand.tagline', problems);
}

function checkMenu(input: unknown, problems: string[]): void {
  if (!Array.isArray(input)) {
    problems.push('admin.menu: is a list of groups.');
    return;
  }
  const seen = new Set<string>();
  for (const [index, group] of input.entries()) {
    const path = `admin.menu[${index}]`;
    if (!isRecord(group)) {
      problems.push(`${path}: is a group with id, label and items.`);
      continue;
    }
    unknownKeys(group, ['id', 'label', 'items'], path, problems);
    const id = group['id'];
    if (typeof id !== 'string' || !GROUP_ID.test(id))
      problems.push(`${path}.id: is lower case letters, digits and dashes.`);
    else if (seen.has(id)) problems.push(`${path}.id: "${id}" is the id of a group before it.`);
    else seen.add(id);
    if (group['label'] !== undefined) checkLabel(group['label'], LABEL_MAX, `${path}.label`, problems);
    else if (typeof id === 'string' && GROUP_ID.test(id) && !BUILTIN_MENU_GROUPS.includes(id))
      problems.push(`${path}.label: a group other than ${BUILTIN_MENU_GROUPS.join(', ')} needs a label.`);
    const items = group['items'];
    if (!Array.isArray(items) || !items.every((item) => typeof item === 'string' && item !== ''))
      problems.push(`${path}.items: is a list of names of entities, modules or addresses of pages.`);
  }
}

/** Checks the `admin` of the config. Every problem is reported together (CFG-09). */
export function parseAdminSettings(input: unknown): AdminSettings {
  if (input === undefined) return {};
  if (!isRecord(input)) throw new Error('admin: must be an object.');
  const problems: string[] = [];
  unknownKeys(input, ['brand', 'menu'], 'admin', problems);
  if (input['brand'] !== undefined) checkBrand(input['brand'], problems);
  if (input['menu'] !== undefined) checkMenu(input['menu'], problems);
  if (problems.length > 0) throw new Error(`The admin has ${problems.length} problem(s):\n${problems.join('\n')}`);
  // Every key and value was checked above, so the input has this shape.
  return input;
}

/**
 * The `admin` section of `bieberkit.config.ts`, in the shape that `validateConfig` of core takes. This package does not import core: the
 * server declares the key in the config and passes this section.
 */
export const adminSection: {
  readonly key: 'admin';
  readonly parser: { parse(input: unknown): AdminSettings | undefined };
} = {
  key: 'admin',
  parser: {
    parse(input) {
      return input === undefined ? undefined : parseAdminSettings(input);
    },
  },
};

/** The settings that the server wrote in the page. Anything else gives none: the admin must open, however the page was changed. */
export function readAdminSettings(text: string | null | undefined): AdminSettings {
  if (text === null || text === undefined || text === '') return {};
  try {
    return parseAdminSettings(JSON.parse(text));
  } catch {
    return {};
  }
}
