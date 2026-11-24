/**
 * BieberKit
 *
 * @file        packages/cli/src/check/rules/generated.ts
 * @description Rule generated: a committed generated file is what the generators give now, so nobody edits it by hand and nobody forgets to regenerate it (GEN-01).
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

import { generateFiles, staleFiles } from '../../generate/files.ts';
import type { Rule } from '../rule.ts';
import { violation } from '../rule.ts';

export const generatedRule: Rule = {
  name: 'generated',
  summary: 'Committed generated files are not stale (GEN-01).',
  async run({ app, root }) {
    try {
      const files = generateFiles(await app()).filter((file) => file.committed);
      return staleFiles(root, files).map((path) =>
        violation(
          'generated',
          'BK_GENERATED_STALE',
          path,
          1,
          `${path} is not what the generators give.`,
          'Run: bieberkit generate (a generated file is never edited by hand).',
        ),
      );
    } catch (error) {
      return [
        violation(
          'generated',
          'BK_APP_UNLOADABLE',
          'bieberkit.config.ts',
          1,
          `The application cannot be loaded: ${error instanceof Error ? error.message.split('\n')[0] : String(error)}`,
          'Run bieberkit plugins to see the problem, and fix it.',
        ),
      ];
    }
  },
};
