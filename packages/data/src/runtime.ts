/**
 * BieberKit
 *
 * @file        packages/data/src/runtime.ts
 * @description The helpers that the generated validators and serializers need at run time, so that generated code asks for this package and not for Ajv or fast-json-stringify (SCH-06).
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

import { createRequire } from 'node:module';

// The helpers are CommonJS files that no type describes, and the generated code uses them as plain objects.
const load = createRequire(import.meta.url);

/** `ajv/dist/runtime/ucs2length`: the length of a text in code points. */
export const ucs2length: unknown = load('ajv/dist/runtime/ucs2length');
/** `ajv/dist/runtime/equal`: deep equality, for `const` and `enum` of objects. */
export const equal: unknown = load('ajv/dist/runtime/equal');
/** `ajv/dist/runtime/uri`: the parser of `uri` formats. */
export const uri: unknown = load('ajv/dist/runtime/uri');
/** `ajv/dist/runtime/validation_error`. */
export const validationError: unknown = load('ajv/dist/runtime/validation_error');
/** `ajv-formats/dist/formats`: `uuid`, `email`, `date-time` and the others that the schemas use. */
export const formats: unknown = load('ajv-formats/dist/formats');
/** `fast-json-stringify/lib/serializer`. */
export const serializer: unknown = load('fast-json-stringify/lib/serializer');
/** `fast-json-stringify/lib/validator`. */
export const validator: unknown = load('fast-json-stringify/lib/validator');
