/**
 * BieberKit
 *
 * @file        packages/core/src/module/define-module.ts
 * @description defineModule and registerModule: the only public entry of a module and how its services reach the container (MOD-01, MOD-02).
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

import type { Container, Registration, ServiceName } from '../container/container.ts';
import { BkError } from '../errors/errors.ts';

/**
 * What a module can contribute beyond services: entities, routes, jobs, schedules, workflows, events and admin screens.
 * Each package that handles one adds its key by declaration merging, through the package entry:
 * `declare module '@bieberkit/core' { interface ModuleContributions { jobs?: readonly JobDef[] } }`.
 */
// oxlint-disable-next-line typescript/no-empty-interface
export interface ModuleContributions {}

export type ServiceDefs = { readonly [N in ServiceName]?: Registration<N> };

export interface ModuleInput extends ModuleContributions {
  /** Lower case letters, digits and dashes. It prefixes the module's events and permissions. */
  readonly name: string;
  readonly services?: ServiceDefs;
}

export interface ModuleDef {
  readonly kind: 'module';
  readonly name: string;
  readonly services: ServiceDefs;
  /** Every key of the input except `name` and `services`. Core keeps them for the package that owns each key. */
  readonly contributions: Readonly<Record<string, unknown>>;
}

/** The pattern of a module name, shared with event names (MOD-05). */
export const MODULE_NAME: RegExp = /^[a-z][a-z0-9-]*$/;

/** Collects what a module declares. The result is frozen and shares no array with the input. */
export function defineModule(input: ModuleInput): ModuleDef {
  if (!MODULE_NAME.test(input.name)) {
    throw new BkError(`"${input.name}" is not a module name.`, {
      code: 'MOD_NAME_INVALID',
      fix: 'Use lower case letters, digits and dashes, starting with a letter.',
    });
  }
  const contributions: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(input)) {
    if (key === 'name' || key === 'services') continue;
    contributions[key] = Array.isArray(value) ? Object.freeze([...value]) : value;
  }
  return Object.freeze({
    kind: 'module',
    name: input.name,
    services: Object.freeze({ ...input.services }),
    contributions: Object.freeze(contributions),
  });
}

/** Registers the services of a module in the container. A name used twice is `CORE_SERVICE_DUPLICATE`. */
export function registerModule(container: Container, def: ModuleDef): void {
  for (const [name, registration] of Object.entries(def.services)) {
    if (registration === undefined) continue;
    // `ServiceDefs` ties each name to its own registration type, which `Object.entries` cannot keep.
    // oxlint-disable-next-line typescript/no-unsafe-type-assertion
    container.register(name as ServiceName, registration);
  }
}
