/**
 * BieberKit
 *
 * @file        packages/content/src/errors.ts
 * @description The error of @bieberkit/content, with every problem that was found (MOD-17).
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

import { BkError } from '@bieberkit/core/errors';
import type { ContentProblem } from './types.ts';

export type ContentErrorCode = 'CONTENT_INVALID' | 'CONTENT_VERSION' | 'CONTENT_BLOCK_INVALID';

const KINDS: Readonly<Record<ContentErrorCode, { status: number; fix: string }>> = {
  CONTENT_INVALID: { status: 400, fix: 'Correct the blocks at the paths that are listed.' },
  CONTENT_VERSION: { status: 400, fix: 'Send a document with version: 1.' },
  CONTENT_BLOCK_INVALID: { status: 500, fix: 'Name the block <namespace>.<name>, and declare it once.' },
};

export class ContentError extends BkError {
  readonly problems: readonly ContentProblem[];

  constructor(code: ContentErrorCode, problems: readonly ContentProblem[]) {
    super(problems.map((problem) => `${problem.path}: ${problem.message}`).join(' '), { code, ...KINDS[code] });
    this.problems = problems;
  }
}
