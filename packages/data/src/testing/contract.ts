/**
 * BieberKit
 *
 * @file        packages/data/src/testing/contract.ts
 * @description Test support: runs shared fixtures through Ajv and Zod Mini and lists every disagreement (SCH-03).
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

import type { EntityDef } from '../schema/define-entity.ts';
import { toJsonSchema } from '../schema/json-schema.ts';
import { normalizeInput } from '../schema/normalize.ts';
import { toZodMini } from '../schema/zod-mini.ts';
import { createAjv } from './ajv.ts';

export type ContractMode = 'create' | 'update';

export interface Fixture {
  readonly name: string;
  readonly mode: ContractMode;
  readonly input: unknown;
  /** What both validators must say. */
  readonly valid: boolean;
}

export interface Disagreement {
  readonly fixture: string;
  readonly mode: ContractMode;
  readonly expected: boolean;
  readonly ajv: boolean;
  readonly zod: boolean;
}

export interface ContractOverrides {
  /** Replaces the JSON Schema of a mode. Tests use it to prove the suite notices a difference. */
  readonly jsonSchema?: (mode: ContractMode) => object;
  /** Leaves out the NFC step before Ajv, to prove the suite notices that it is needed. */
  readonly skipNormalize?: boolean;
  /** Replaces the Zod schema of a mode. */
  readonly zod?: (mode: ContractMode) => { safeParse(input: unknown): { success: boolean } };
}

/**
 * Runs every fixture through the Ajv validator of the JSON Schema (after the NFC step) and through the Zod Mini schema,
 * and returns the fixtures where the two, or either of them and the expected verdict, differ. An empty list is a pass.
 */
export function checkContract(
  def: EntityDef<string>,
  fixtures: readonly Fixture[],
  overrides: ContractOverrides = {},
): Disagreement[] {
  const ajv = createAjv();
  const validators = {
    create: ajv.compile(overrides.jsonSchema?.('create') ?? toJsonSchema(def, 'create')),
    update: ajv.compile(overrides.jsonSchema?.('update') ?? toJsonSchema(def, 'update')),
  };
  const schemas = {
    create: overrides.zod?.('create') ?? toZodMini(def, 'create'),
    update: overrides.zod?.('update') ?? toZodMini(def, 'update'),
  };
  const found: Disagreement[] = [];
  for (const fixture of fixtures) {
    const ajvVerdict = validators[fixture.mode](
      overrides.skipNormalize === true ? fixture.input : normalizeInput(fixture.input),
    );
    const zodVerdict = schemas[fixture.mode].safeParse(fixture.input).success;
    if (ajvVerdict !== fixture.valid || zodVerdict !== fixture.valid) {
      found.push({
        fixture: fixture.name,
        mode: fixture.mode,
        expected: fixture.valid,
        ajv: ajvVerdict,
        zod: zodVerdict,
      });
    }
  }
  return found;
}
