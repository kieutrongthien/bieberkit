/**
 * BieberKit
 *
 * @file        packages/create/src/scaffold/plan.ts
 * @description Checks every choice and resolves the plugin graph before anything is written, so that a failed check leaves the folder alone (section 6, steps 1 to 5).
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

import { existsSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { resolvePlugins } from '@bieberkit/core';
import { CliError } from '../kit/errors.ts';
import type { Choices } from './choices.ts';
import { renderProject } from './render.ts';
import type { Plan, ProjectFile } from './render.ts';
import type { PluginIndex } from './templates.ts';

export interface PlanDeps {
  readonly index: PluginIndex;
  /** The version of the framework: core and every `@bieberkit/*` package share it. */
  readonly framework: string;
  readonly year: number;
  readonly random: () => string;
}

export interface Planned {
  readonly target: string;
  readonly plan: Plan;
  readonly files: readonly ProjectFile[];
  /** What the person should know that is not an error: what this version of the scaffolder does not make yet. */
  readonly notes: readonly string[];
}

/** Step 1: the folder must not exist, or be empty. */
function checkTarget(target: string, folder: string): void {
  if (existsSync(target) && readdirSync(target).length > 0) {
    throw new CliError(`The folder ${folder} exists and is not empty.`, {
      code: 'BK_CREATE_TARGET_NOT_EMPTY',
      exit: 2,
      fix: 'Choose another name, or empty the folder.',
    });
  }
}

/** Steps 1 to 6 as data: the plugin graph is resolved with the resolver of core, on the manifests that the scaffolder carries (PLG-07). */
export function planProject(choices: Choices, cwd: string, deps: PlanDeps): Planned {
  const target = resolve(cwd, choices.project.folder);
  checkTarget(target, choices.project.folder);
  const wanted = [...new Set([...choices.template.plugins, ...choices.extraPlugins])];
  const unknown = wanted.filter((name) => deps.index[name] === undefined);
  if (unknown.length > 0) {
    throw new CliError(
      `${unknown.join(', ')} ${unknown.length === 1 ? 'is' : 'are'} not a plugin that this version can install.`,
      {
        code: 'BK_CREATE_PLUGIN_UNKNOWN',
        exit: 2,
        fix:
          Object.keys(deps.index).length === 0
            ? 'No first-party plugin is published yet.'
            : `Use --plugins with: ${Object.keys(deps.index).join(', ')}.`,
      },
    );
  }
  const installed = wanted.flatMap((name) => {
    const entry = deps.index[name];
    return entry === undefined ? [] : [{ name, version: entry.version, manifest: entry.manifest }];
  });
  // Every problem of the graph is reported together, with the codes of section 11.2, and nothing has been written.
  const { order } = resolvePlugins(installed, { core: deps.framework, dialect: choices.dialect });
  const plan: Plan = {
    plugins: order.flatMap((name) => {
      const entry = deps.index[name];
      return entry === undefined ? [] : [{ name, version: entry.version, env: entry.manifest.env }];
    }),
    year: deps.year,
    framework: deps.framework,
    random: deps.random,
  };
  const notes: string[] = [];
  if (choices.admin || choices.site)
    notes.push('The admin app and the site app come with their own milestones: this project has the server.');
  return { target, plan, files: renderProject(choices, plan), notes };
}
