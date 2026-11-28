/**
 * BieberKit
 *
 * @file        packages/cli/src/check/rules/layout.ts
 * @description The rule `layout` of bieberkit check: a warning for a file of a module of the server or of a plugin of the project that is out of place (MOD-19).
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

import { violation } from '../rule.ts';
import type { Rule, Violation } from '../rule.ts';
import { moduleFileProblem } from './layout-of.ts';

/** The source of a module of the server, or of a plugin that the project holds. */
const SOURCE = /^(?:apps\/server\/src\/modules\/[^/]+|plugins\/[^/]+\/src)\/(.+)$/;

export const layoutRule: Rule = {
  name: 'layout',
  summary: 'The files of modules and plugins are in the folder of their kind (section 7.4).',
  run: ({ files }) =>
    files.flatMap((file): Violation[] => {
      const inside = SOURCE.exec(file.path)?.[1];
      const problem = inside === undefined ? undefined : moduleFileProblem(inside);
      return problem === undefined
        ? []
        : [
            violation(
              'layout',
              'BK_LAYOUT_MISPLACED',
              file.path,
              1,
              `${file.path} is out of place.`,
              problem,
              'warning',
            ),
          ];
    }),
};
