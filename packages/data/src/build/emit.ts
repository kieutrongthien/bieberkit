/**
 * BieberKit
 *
 * @file        packages/data/src/build/emit.ts
 * @description Emits the standalone Ajv validators and fast-json-stringify serializers of the entities as modules that load without compiling (SCH-06, PERF-06).
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

import { createHash } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import fastJsonStringify from 'fast-json-stringify';
import standaloneModule from 'ajv/dist/standalone/index.js';
import { dataError } from '../errors.ts';
import type { EntityDef } from '../schema/define-entity.ts';
import { toJsonSchema } from '../schema/json-schema.ts';
import type { JsonSchema } from '../schema/json-schema.ts';
import { createAjv } from './ajv.ts';

// Ajv is CommonJS, so its standalone function is the default export of the default export.
const standaloneCode: typeof standaloneModule.default = standaloneModule.default;

/** The format of the three files. A change of it makes `assertCurrent` refuse the old build. */
export const STANDALONE_VERSION = 1;

/** What the generated code asks for, and the name that `@bieberkit/data/runtime` exports it under. */
const RUNTIME_NAMES: Readonly<Record<string, string>> = {
  'ajv/dist/runtime/ucs2length': 'ucs2length',
  'ajv/dist/runtime/equal': 'equal',
  'ajv/dist/runtime/uri': 'uri',
  'ajv/dist/runtime/validation_error': 'validationError',
  'ajv-formats/dist/formats': 'formats',
  'fast-json-stringify/lib/serializer': 'serializer',
  'fast-json-stringify/lib/validator': 'validator',
};

export interface StandaloneManifest {
  readonly version: number;
  /** SHA-256 of the schemas of every entity. `assertCurrent` compares it. */
  readonly hash: string;
  /** The names of the entities in the build, sorted. */
  readonly entities: readonly string[];
}

export interface StandaloneFiles {
  readonly validators: string;
  readonly serializers: string;
  readonly manifest: StandaloneManifest;
}

export interface StandaloneOptions {
  /** What the generated code `require`s. Defaults to `@bieberkit/data/runtime`. Tests that run from the sources name a file. */
  readonly runtime?: string;
}

const RUNTIME = '@bieberkit/data/runtime';

/**
 * Points every `require` of the generated code at the runtime of this package. Ajv and fast-json-stringify are dependencies
 * of `@bieberkit/data`, and a project cannot resolve them under pnpm, but it can resolve this package. A helper that is not
 * in the list stops the build, so that a new one is found here and not at the first request.
 */
export function rewriteRequires(code: string, runtime: string = RUNTIME): string {
  return code.replaceAll(/require\((["'])([^"']+)\1\)/g, (_match, _quote: string, id: string) => {
    if (id === runtime) return `require("${runtime}")`;
    const name = RUNTIME_NAMES[id];
    if (name === undefined) {
      throw dataError(
        'DATA_STANDALONE_UNSUPPORTED',
        500,
        `The generated code asks for "${id}", which @bieberkit/data/runtime does not export.`,
        'Add it to src/runtime.ts and to the list of the emitter.',
      );
    }
    return `require("${runtime}").${name}`;
  });
}

interface EntitySchemas {
  readonly name: string;
  readonly create: JsonSchema;
  readonly update: JsonSchema;
  readonly read: JsonSchema;
}

function schemasOf(defs: readonly EntityDef<string>[]): EntitySchemas[] {
  return defs
    .toSorted((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0))
    .map((def) => ({
      name: def.name,
      create: toJsonSchema(def, 'create'),
      update: toJsonSchema(def, 'update'),
      read: toJsonSchema(def, 'read'),
    }));
}

function hashOfSchemas(schemas: readonly EntitySchemas[]): string {
  return createHash('sha256')
    .update(JSON.stringify([STANDALONE_VERSION, schemas]))
    .digest('hex');
}

/** The hash that a build of these entities has in its manifest. */
export function hashOf(defs: readonly EntityDef<string>[]): string {
  return hashOfSchemas(schemasOf(defs));
}

function validatorsCode(schemas: readonly EntitySchemas[], runtime: string): string {
  const ajv = createAjv({ code: { source: true } });
  const refs: Record<string, string> = {};
  for (const entry of schemas) {
    for (const mode of ['create', 'update'] as const) {
      const schema = entry[mode];
      ajv.addSchema(schema);
      refs[`${entry.name}:${mode}`] = String(schema['$id']);
    }
  }
  return rewriteRequires(standaloneCode(ajv, refs), runtime);
}

/**
 * fast-json-stringify names the schemas that it merges and the roots that it checks with a counter that lives as long as the
 * process, so the same schema gives `__fjs_root_2` in one build and `__fjs_root_9` in another. Each name is renumbered by its first
 * place in the unit, which keeps the output the same for the same entities.
 */
function stabilize(code: string): string {
  const seen = new Map<string, number>();
  const counts = new Map<string, number>();
  return code.replaceAll(/__fjs_([a-z]+)_(\d+)/g, (_match, kind: string, id: string) => {
    const key = `${kind}_${id}`;
    if (!seen.has(key)) {
      const next = counts.get(kind) ?? 0;
      counts.set(kind, next + 1);
      seen.set(key, next);
    }
    return `__fjs_${kind}_${seen.get(key)}`;
  });
}

function serializersCode(schemas: readonly EntitySchemas[], runtime: string): string {
  const functions: string[] = [];
  const make = (key: string, schema: JsonSchema): void => {
    const code = fastJsonStringify(structuredClone(schema), { mode: 'standalone' });
    functions.push(
      `serializers[${JSON.stringify(key)}] = (function () {\nconst module = { exports: {} };\n${rewriteRequires(stabilize(code), runtime)}\nreturn module.exports;\n})();`,
    );
  };
  for (const entry of schemas) {
    make(`${entry.name}:read`, entry.read);
    make(`${entry.name}:list`, { type: 'array', items: entry.read });
  }
  return `'use strict';\nconst serializers = Object.create(null);\n${functions.join('\n')}\nmodule.exports = serializers;\n`;
}

/**
 * The text of the standalone modules of `defs` (SCH-06). The result does not depend on the order of `defs`, on the time or on
 * the machine, so a build can be compared and cached. Pure: it writes nothing.
 */
export function emitStandalone(defs: readonly EntityDef<string>[], options: StandaloneOptions = {}): StandaloneFiles {
  const runtime = options.runtime ?? RUNTIME;
  const schemas = schemasOf(defs);
  return {
    validators: validatorsCode(schemas, runtime),
    serializers: serializersCode(schemas, runtime),
    manifest: {
      version: STANDALONE_VERSION,
      hash: hashOfSchemas(schemas),
      entities: schemas.map((entry) => entry.name),
    },
  };
}

/** Writes `validators.cjs`, `serializers.cjs` and `standalone.json` into `directory`, and returns what it wrote. */
export async function writeStandalone(
  defs: readonly EntityDef<string>[],
  directory: string,
  options: StandaloneOptions = {},
): Promise<StandaloneFiles> {
  const files = emitStandalone(defs, options);
  await mkdir(directory, { recursive: true });
  await writeFile(join(directory, 'validators.cjs'), files.validators);
  await writeFile(join(directory, 'serializers.cjs'), files.serializers);
  await writeFile(join(directory, 'standalone.json'), `${JSON.stringify(files.manifest, null, 2)}\n`);
  return files;
}
