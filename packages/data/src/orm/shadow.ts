/**
 * BieberKit
 *
 * @file        packages/data/src/orm/shadow.ts
 * @description Which fields of an entity have a shadow column, and the check that a native write fills it (DATA-21).
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

import type { EntityMetadata } from '@mikro-orm/core';
import { dataError } from '../errors.ts';
import { fold } from '../text/fold.ts';
import type { ShadowFn } from './compile.ts';

export interface Shadow {
  /** The property that holds the folded text. */
  readonly property: string;
  /** The compared field it is made from. */
  readonly source: string;
  readonly fold: ShadowFn['mode'];
}

/** The shadow columns of an entity, read from the functions that fill them. */
export function shadowsOf(meta: EntityMetadata): Shadow[] {
  const found: Shadow[] = [];
  for (const [property, options] of Object.entries(meta.properties)) {
    const hook: unknown = options.onCreate;
    if (typeof hook === 'function' && 'shadowOf' in hook && typeof hook.shadowOf === 'string' && 'mode' in hook) {
      // The marker was put there by the compiler, together with the mode.
      // oxlint-disable-next-line typescript/no-unsafe-type-assertion
      found.push({ property, source: hook.shadowOf, fold: hook.mode as ShadowFn['mode'] });
    }
  }
  return found;
}

/** The shadow values for a plain object that is about to be written, for the compared fields it contains. */
export function shadowValues(
  shadows: readonly Shadow[],
  data: Readonly<Record<string, unknown>>,
): Record<string, string | null> {
  const values: Record<string, string | null> = {};
  for (const shadow of shadows) {
    if (!(shadow.source in data)) continue;
    const text: unknown = Reflect.get(data, shadow.source);
    values[shadow.property] = typeof text === 'string' ? fold(shadow.fold, text) : null;
  }
  return values;
}

/** Throws `DATA_SHADOW_STALE` when `data` sets a compared field and leaves its shadow column out. */
export function assertShadowsWritten(meta: EntityMetadata, data: object): void {
  for (const shadow of shadowsOf(meta)) {
    if (Reflect.get(data, shadow.source) !== undefined && !(shadow.property in data)) {
      throw dataError(
        'DATA_SHADOW_STALE',
        500,
        `A write sets ${meta.className}.${shadow.source} and leaves ${shadow.property} out, so lookups would use the old text.`,
        'Use bulkInsert and bulkUpdate from @bieberkit/data/orm, which keep the shadow columns right.',
      );
    }
  }
}
