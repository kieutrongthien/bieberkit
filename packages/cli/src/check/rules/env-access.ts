/**
 * BieberKit
 *
 * @file        packages/cli/src/check/rules/env-access.ts
 * @description Rule env-access: code of the project never reads the process environment, because core validates it once (P8, CFG-02).
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

import { lineAt, matchesInCode } from '../code.ts';
import type { Rule } from '../rule.ts';
import { isCode, violation } from '../rule.ts';

// Each pattern is a way to reach the environment that a plain `process.env` search would miss.
const PATTERNS: readonly RegExp[] = [
  /\bprocess\s*(?:\.\s*env\b|\[\s*['"]env['"]\s*\])/g,
  /\bimport\s*(?:type\s*)?\{[^}]*\benv\b[^}]*\}\s*from\s*['"](?:node:)?process['"]/g,
  /\{[^}]*\benv\b[^}]*\}\s*=\s*(?:globalThis\.)?process\b/g,
  /\bprocess\s*\.\s*loadEnvFile\b/g,
  /\bimport\.meta\.env\b/g,
];

/** The configs of the tools (`vite.config.ts`) read the environment on purpose. The one of the project does not. */
const isToolConfig = (path: string): boolean =>
  /(?:^|\/)[^/]+\.config\.[cm]?[jt]s$/.test(path) && !path.endsWith('bieberkit.config.ts');

export const envAccessRule: Rule = {
  name: 'env-access',
  summary: 'Nothing reads process.env: take validated config from core (P8).',
  run: ({ files }) =>
    files
      .filter((file) => isCode(file) && !isToolConfig(file.path))
      .flatMap((file) => {
        // Strings are kept so that `process['env']` is found, and a match counts only when it starts in code.
        return PATTERNS.flatMap((pattern) =>
          matchesInCode(file.text, pattern).map((match) =>
            violation(
              'env-access',
              'BK_ENV_ACCESS',
              file.path,
              lineAt(file.text, match.index),
              'The environment is read directly.',
              'Take the validated config from loadEnv() of @bieberkit/core, or declare the key in the env schema of the project or the plugin.',
            ),
          ),
        );
      }),
};
