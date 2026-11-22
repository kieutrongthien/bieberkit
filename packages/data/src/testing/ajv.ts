/**
 * BieberKit
 *
 * @file        packages/data/src/testing/ajv.ts
 * @description Test support: an Ajv 2020 instance configured as the build will configure it, with the formats the schemas use.
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

import AjvModule from 'ajv/dist/2020.js';
import formatsModule from 'ajv-formats';

// Both packages are CommonJS. Node gives their `module.exports` as the default import, and each also has the same value as `.default`.
const Ajv: typeof AjvModule.default = AjvModule.default;
const addFormats: typeof formatsModule.default = formatsModule.default;

export type AjvInstance = InstanceType<typeof Ajv>;

/**
 * Strict mode, every error reported, and union types such as `["string", "null"]` allowed, because an optional field is
 * `null` or its value. The standalone validators emitted at build use the same options (SCH-06).
 */
export function createAjv(): AjvInstance {
  const ajv = new Ajv({ strict: true, allErrors: true, allowUnionTypes: true });
  addFormats(ajv);
  return ajv;
}
