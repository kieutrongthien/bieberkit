/**
 * BieberKit
 *
 * @file        packages/cli/src/generate/header.ts
 * @description The header of a generated file: the project, the file, what made it, and no date, so that the same input gives the same bytes (HDR-05, GEN-01, GEN-03).
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

import type { ProjectConfigInput } from '@bieberkit/core';

/**
 * The header of a generated file in the layout of section 23, with a `@generated` tag that names the command that writes it. It has no
 * copyright year, because a year that changes would make every generated file stale on 1 January (GEN-03).
 */
export function generatedHeader(
  config: ProjectConfigInput,
  file: string,
  description: string,
  command: string,
): string {
  return [
    '/**',
    ` * ${config.name}`,
    ' *',
    ` * @file        ${file}`,
    ` * @description ${description}`,
    ` * @author      ${config.author}`,
    ` * @generated   ${command}. Do not edit it by hand: change the source and run the command again.`,
    ` * @license     ${config.license}`,
    ' */',
    '',
    '',
  ].join('\n');
}
