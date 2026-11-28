/**
 * BieberKit
 *
 * @file        packages/admin-antd/src/app/useMenuGroups.ts
 * @description The groups of the menu of the signed-in person: the entities that they may list and the pages of plugins that they may open (UI-24, UI-35).
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

import { menuOf, shortNameOf } from '@bieberkit/admin-core';
import type { MenuGroup, MenuPage } from '@bieberkit/admin-core';
import { pageSettings } from './Brand.tsx';
import { useMeta } from './context.ts';
import { usePluginText } from './hooks.ts';
import { useLanguage } from './language.tsx';
import { useAllowed, useRegistry } from './slots.tsx';

export function useMenuGroups(): readonly MenuGroup[] {
  const meta = useMeta();
  const { locale } = useLanguage();
  const registry = useRegistry();
  const text = usePluginText();
  const entries = useAllowed(registry.menu);
  const open = useAllowed(registry.pages);
  if (meta.data === undefined) return [];
  const pages = entries.flatMap((entry): MenuPage[] => {
    const page = open.find((candidate) => candidate.plugin === entry.plugin && candidate.path === entry.page);
    if (page === undefined) return [];
    const module = shortNameOf(entry.plugin);
    return [
      {
        path: page.path,
        module,
        label: { [locale]: text(page.title) },
        icons: entry.icon === undefined ? [module] : [entry.icon, module],
        ...(entry.group === undefined ? {} : { group: entry.group }),
      },
    ];
  });
  return menuOf(meta.data, pageSettings().menu, pages);
}
