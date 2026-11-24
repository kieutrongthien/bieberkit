/**
 * BieberKit
 *
 * @file        packages/create/src/index.ts
 * @description Public API of create-bieberkit: the scaffolder and the command that runs it (section 5.1, section 6).
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

/** npm name of this package. */
export const packageName = 'create-bieberkit';

export { createCommand } from './commands/create.ts';
export type { CreateDeps } from './commands/create.ts';
export { resolveChoices } from './scaffold/choices.ts';
export type { Choices } from './scaffold/choices.ts';
export { renderEnvExample } from './scaffold/env-example.ts';
export { checkProjectName } from './scaffold/names.ts';
export { planProject } from './scaffold/plan.ts';
export type { PlanDeps, Planned } from './scaffold/plan.ts';
export { renderProject } from './scaffold/render.ts';
export type { Plan, ProjectFile } from './scaffold/render.ts';
export { scaffold } from './scaffold/run.ts';
export type { Exec, Scaffolded } from './scaffold/run.ts';
export { BUILTIN_PLUGIN_INDEX, BUILTIN_TEMPLATES } from './scaffold/templates.ts';
export type { PluginIndex, PluginIndexEntry, Template } from './scaffold/templates.ts';
