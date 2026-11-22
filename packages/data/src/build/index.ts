/**
 * BieberKit
 *
 * @file        packages/data/src/build/index.ts
 * @description The public exports of @bieberkit/data/build: the emitter of the standalone modules and the runtime that loads them (SCH-06).
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

export { createAjv } from './ajv.ts';
export type { AjvInstance } from './ajv.ts';
export { emitStandalone, writeStandalone } from './emit.ts';
export type { StandaloneFiles, StandaloneManifest, StandaloneOptions } from './emit.ts';
export { createStandaloneRuntime, issuesOf, loadStandalone } from './standalone.ts';
export type { AjvError, StandaloneParts, StandaloneRuntime, ValidationIssue, ValidationResult } from './standalone.ts';
