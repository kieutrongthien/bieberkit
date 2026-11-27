/**
 * BieberKit
 *
 * @file        packages/server/src/plugin-admin.ts
 * @description What the plugins add to the admin: their pages, widgets and screens are read from the `admin` key, checked together with the files that they name, and their folders are served under the admin (UI-04, ADR 0037).
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

import { existsSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { shortNameOf } from '@bieberkit/core';
import { adminExtensionsOf, extensionProblems } from '@bieberkit/http';
import type { AdminContribution, AdminExtensions } from '@bieberkit/http';
import { ServerError } from './errors.ts';
import type { Project } from './project.ts';

/** The folder of a plugin whose files the browser loads. */
export const PLUGIN_ADMIN_DIR = 'admin';

export interface PluginAdmin {
  readonly extensions: AdminExtensions;
  /** The folders to serve: `/plugins/<short name>` under the admin, from the folder `admin` of the package. */
  readonly folders: readonly { readonly plugin: string; readonly directory: string }[];
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/** The files that a contribution names, as names of files of the folder. */
function filesOf(admin: AdminContribution): string[] {
  return [
    ...(admin.pages ?? []).map((page) => page.module),
    ...(admin.widgets ?? []).map((widget) => widget.module),
    ...(admin.screens ?? []).map((screen) => screen.module),
  ];
}

/**
 * Reads the `admin` key of every plugin. A contribution that is not well formed, or that names a file that the plugin does not have, stops
 * the boot with every problem together, so that a page that cannot load is found by the person who adds it and not by the person who opens it.
 */
export function pluginAdminOf(project: Pick<Project, 'plugins'>): PluginAdmin {
  const found: { plugin: string; admin: AdminContribution; directory: string }[] = [];
  const problems: string[] = [];
  for (const { def, root } of project.plugins) {
    const given: unknown = def.module.contributions['admin'];
    if (given === undefined) continue;
    if (!isRecord(given)) {
      problems.push(`${def.name}: admin is an object with pages, widgets and screens.`);
      continue;
    }
    // The package of the plugin declared the type of its own key; this checks the values.
    // oxlint-disable-next-line typescript/no-unsafe-type-assertion
    const admin = given as AdminContribution;
    const plugin = shortNameOf(def.name);
    const wrong = extensionProblems(plugin, admin);
    problems.push(...wrong);
    const directory = join(root, PLUGIN_ADMIN_DIR);
    if (wrong.length === 0) {
      for (const file of new Set(filesOf(admin))) {
        const path = join(directory, file);
        if (!existsSync(path) || !statSync(path).isFile())
          problems.push(`${def.name}: admin names ${file}, and ${PLUGIN_ADMIN_DIR}/${file} is not in the package.`);
      }
    }
    found.push({ plugin, admin, directory });
  }
  if (problems.length > 0) {
    throw new ServerError(`What a plugin adds to the admin is not valid:\n- ${problems.join('\n- ')}`, {
      code: 'BK_ADMIN_CONTRIBUTION_INVALID',
      fix: 'Fix the admin key of the plugin, and build its files into the folder admin of its package.',
    });
  }
  return {
    extensions: adminExtensionsOf(found.map(({ plugin, admin }) => ({ plugin, admin }))),
    folders: found.map(({ plugin, directory }) => ({ plugin, directory })),
  };
}
