/**
 * BieberKit
 *
 * @file        packages/data/src/build/standalone.ts
 * @description The run time side of the standalone build: load the modules, validate with normalization, serialize, and refuse a stale build (SCH-06, PERF-06, API-01).
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

import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { dataError } from '../errors.ts';
import type { EntityDef } from '../schema/define-entity.ts';
import { normalizeInput } from '../schema/normalize.ts';
import { hashOf } from './emit.ts';
import type { StandaloneManifest } from './emit.ts';

export interface ValidationIssue {
  /** Dotted path of the field: `balance.amount`. Empty for the body itself. */
  readonly path: string;
  /** The rule that failed: `required`, `minLength`, `enum`, `additionalProperties`... */
  readonly keyword: string;
  readonly message: string;
}

export type ValidationResult =
  | { readonly ok: true; readonly value: unknown }
  | { readonly ok: false; readonly issues: ValidationIssue[] };

interface AjvError {
  readonly instancePath: string;
  readonly keyword: string;
  readonly message?: string;
  readonly params: Readonly<Record<string, unknown>>;
}

type Validator = ((data: unknown) => boolean) & { errors?: AjvError[] | null };
type Serializer = (data: unknown) => string;

export interface StandaloneParts {
  /** What `validators.cjs` exports. */
  readonly validators: Readonly<Record<string, Validator>>;
  /** What `serializers.cjs` exports. */
  readonly serializers: Readonly<Record<string, Serializer>>;
  readonly manifest: StandaloneManifest;
}

export interface StandaloneRuntime {
  readonly manifest: StandaloneManifest;
  /** Normalizes the input to NFC (SCH-05), then validates it. A valid input comes back as the normalized value. */
  validate(entity: string, mode: 'create' | 'update', input: unknown): ValidationResult;
  /** The JSON text of a row of the API: only the fields of the read schema (API-01). */
  serialize(entity: string, row: unknown): string;
  /** The JSON text of a list of rows. */
  serializeMany(entity: string, rows: readonly unknown[]): string;
  /** Throws `DATA_STANDALONE_STALE` when the entities are not the ones that the build was made from. */
  assertCurrent(defs: readonly EntityDef<string>[]): void;
}

const unescape = (segment: string): string => segment.replaceAll('~1', '/').replaceAll('~0', '~');

function pathOf(error: AjvError): string {
  const parts = error.instancePath === '' ? [] : error.instancePath.slice(1).split('/').map(unescape);
  const extra =
    error.keyword === 'required'
      ? error.params['missingProperty']
      : error.keyword === 'additionalProperties'
        ? error.params['additionalProperty']
        : undefined;
  if (typeof extra === 'string') parts.push(extra);
  return parts.join('.');
}

function unknownBuild(what: string): never {
  throw dataError(
    'DATA_STANDALONE_UNKNOWN',
    500,
    `${what} is not in the standalone build.`,
    'Check the name, and run the build again if the entity is new.',
  );
}

/** A runtime over modules that are already loaded. `loadStandalone` is this over the files of a directory. */
export function createStandaloneRuntime(parts: StandaloneParts): StandaloneRuntime {
  const { validators, serializers, manifest } = parts;
  const known = new Set(manifest.entities);
  const pick = <T>(table: Readonly<Record<string, T>>, entity: string, kind: string): T => {
    const found = known.has(entity) ? table[`${entity}:${kind}`] : undefined;
    return found ?? unknownBuild(`${entity}:${kind}`);
  };
  return {
    manifest,
    validate(entity, mode, input) {
      const validator = pick(validators, entity, mode);
      const value = normalizeInput(input);
      if (validator(value)) return { ok: true, value };
      const issues = (validator.errors ?? []).map((error) => ({
        path: pathOf(error),
        keyword: error.keyword,
        message: error.message ?? error.keyword,
      }));
      return { ok: false, issues };
    },
    serialize: (entity, row) => pick(serializers, entity, 'read')(row),
    serializeMany: (entity, rows) => pick(serializers, entity, 'list')(rows),
    assertCurrent(defs) {
      if (hashOf(defs) !== manifest.hash) {
        throw dataError(
          'DATA_STANDALONE_STALE',
          500,
          'The standalone validators were built from other entities than the ones that are loaded.',
          'Run the build again, so that the validators match the entities.',
        );
      }
    },
  };
}

/** Loads the three files that `writeStandalone` made. No schema is compiled, which is the point (SCH-06). */
export async function loadStandalone(directory: string): Promise<StandaloneRuntime> {
  let text: string;
  try {
    text = await readFile(join(directory, 'standalone.json'), 'utf8');
  } catch (error) {
    throw dataError(
      'DATA_STANDALONE_UNKNOWN',
      500,
      `There is no standalone build in ${directory}.`,
      'Run the build first, or point at the folder that it wrote.',
      error,
    );
  }
  // The manifest and the two modules were written by writeStandalone, which is the only place that makes them.
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion
  const manifest = JSON.parse(text) as StandaloneManifest;
  const load = createRequire(import.meta.url);
  return createStandaloneRuntime({
    validators: load(join(directory, 'validators.cjs')),
    serializers: load(join(directory, 'serializers.cjs')),
    manifest,
  });
}
