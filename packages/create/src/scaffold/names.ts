/**
 * BieberKit
 *
 * @file        packages/create/src/scaffold/names.ts
 * @description Checks the name of a new project: a valid npm package name, and the folder that it makes (section 6, step 1).
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

import { usageError } from '../kit/errors.ts';

// The rules of npm for a new package: at most 214 characters, lower case, no leading dot or underscore, and URL safe characters.
const NAME = /^(?:@[a-z0-9~-][a-z0-9._~-]*\/)?[a-z0-9~-][a-z0-9._~-]*$/;

export interface ProjectName {
  /** The name as given, with its scope. */
  readonly name: string;
  /** The name of the folder: the name without its scope. */
  readonly folder: string;
}

/** Validates the name as an npm package name, which is the first step of section 6. */
export function checkProjectName(value: string): ProjectName {
  if (value === '' || value.length > 214 || !NAME.test(value)) {
    throw usageError(
      'BK_CREATE_NAME_INVALID',
      `"${value}" is not a name for a project.`,
      'Use lower case letters, digits, dashes and dots, as npm does: my-app, or @team/my-app.',
    );
  }
  return { name: value, folder: value.replace(/^@[^/]+\//, '') };
}
