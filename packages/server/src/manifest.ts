/**
 * BieberKit
 *
 * @file        packages/server/src/manifest.ts
 * @description The collectors that fill the tables and the routes of a plugin manifest from what its module contributes, so that collisions are found before boot (section 11.1, section 11.2, PLG-07).
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

import type { KeyCollector } from '@bieberkit/core';

const listOf = (contributions: Readonly<Record<string, unknown>>, key: string): readonly unknown[] => {
  const value = contributions[key];
  return Array.isArray(value) ? value : [];
};

const textOf = (item: unknown, key: string): string => String(Reflect.get(Object(item), key));

/**
 * What a plugin owns, read from its module: the tables of its entities, and the method and path of the routes that it declares itself.
 * The routes that `registerEntityRoutes` makes from the `api` settings of an entity follow its table, so they are not listed. Admin paths
 * come with the admin.
 */
export const COLLECTORS: readonly KeyCollector[] = [
  {
    field: 'tables',
    collect: (contributions) => listOf(contributions, 'entities').map((entity) => textOf(entity, 'table')),
  },
  {
    field: 'routes',
    collect: (contributions) =>
      listOf(contributions, 'routes').map((route) => `${textOf(route, 'method')} ${textOf(route, 'url')}`),
  },
];
