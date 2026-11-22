/**
 * BieberKit
 *
 * @file        packages/core/src/plugins/errors.ts
 * @description PluginError: one error that carries every problem of a plugin check, with stable PLG_ codes (spec 11.2, ADR 0011).
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

import { BkError } from '../errors/errors.ts';

export interface PluginProblem {
  readonly code: string;
  readonly message: string;
  readonly fix: string;
}

/** Thrown by the resolver, `definePlugin` and the range matcher. Its `code` is the code of the first problem. */
export class PluginError extends BkError {
  readonly problems: readonly PluginProblem[];

  constructor(problems: readonly PluginProblem[]) {
    super(problems.map((problem) => `${problem.code}: ${problem.message}`).join('\n'), {
      code: problems[0]?.code ?? 'PLG_UNKNOWN',
      safeMessage: 'The plugins of this project cannot be loaded.',
      fix: [...new Set(problems.map((problem) => problem.fix))].join('\n'),
    });
    this.problems = problems;
  }
}
