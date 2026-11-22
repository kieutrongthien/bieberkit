/**
 * BieberKit
 *
 * @file        packages/data/src/orm/state-guard.ts
 * @description The rule that a state is changed only by a transition: which properties are states, and the check that a write leaves them alone (MOD-07).
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

export interface StateProperty {
  readonly property: string;
  readonly initial: string;
}

/** The state properties of an entity, read from the marker that the compiler puts on them. */
export function statesOf(meta: EntityMetadata): StateProperty[] {
  const found: StateProperty[] = [];
  for (const [property, options] of Object.entries(meta.properties)) {
    const marker: unknown = Reflect.get(options, 'bkState');
    if (typeof marker === 'object' && marker !== null && typeof Reflect.get(marker, 'initial') === 'string') {
      found.push({ property, initial: String(Reflect.get(marker, 'initial')) });
    }
  }
  return found;
}

/** Rows whose state `transition` has just changed. The next flush may write that change, and only that one. */
const CHANGING = new WeakSet<object>();

export function allowStateChange(row: object): void {
  CHANGING.add(row);
}

export function takeStateChange(row: object): boolean {
  return CHANGING.delete(row);
}

export function refuseStateWrite(entity: string, property: string): never {
  throw dataError(
    'DATA_STATE_DIRECT_WRITE',
    500,
    `${entity}.${property} is a state, and it was written directly.`,
    'Change a state with transition(). A new row starts in the initial state.',
  );
}

/** For a native write: any state in `data` is refused, except the initial state of a new row. */
export function assertStateNotWritten(meta: EntityMetadata, data: object, creating: boolean): void {
  for (const { property, initial } of statesOf(meta)) {
    const value: unknown = Reflect.get(data, property);
    if (value === undefined) continue;
    if (creating && value === initial) continue;
    refuseStateWrite(meta.className, property);
  }
}
