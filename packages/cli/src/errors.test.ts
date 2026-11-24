/**
 * BieberKit
 *
 * @file        packages/cli/src/errors.test.ts
 * @description Tests of the failures of the CLI: each kind of error gives a code, a fix, a link and an exit code (section 5.3, AI-02).
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

import { BkError, EnvValidationError } from '@bieberkit/core';
import { describe, expect, it } from 'vitest';
import { CliError, DOCS_BASE, docsLink, failureOf, usageError } from './errors.ts';

describe('AI-02 failures', () => {
  it('AI-02 an error of the CLI keeps its code and fix, links to its page, and ends with its exit code', () => {
    expect(
      failureOf(new CliError('no project', { code: 'BK_PROJECT_NOT_FOUND', fix: 'Run it in a project.' })),
    ).toEqual({
      code: 'BK_PROJECT_NOT_FOUND',
      message: 'no project',
      fix: 'Run it in a project.',
      docs: `${DOCS_BASE}/BK_PROJECT_NOT_FOUND`,
      exit: 1,
    });
    expect(failureOf(usageError('BK_USAGE_UNKNOWN_FLAG', 'x', 'y')).exit).toBe(2);
  });

  it('AI-02 an error of the framework keeps its own code, so an agent finds it in the docs', () => {
    const failure = failureOf(new BkError('bad', { code: 'PLG_CYCLE', fix: 'Break the cycle.' }));
    expect(failure).toMatchObject({ code: 'PLG_CYCLE', fix: 'Break the cycle.', exit: 1, docs: docsLink('PLG_CYCLE') });
  });

  it('AI-02 an error with no fix still says where to look', () => {
    expect(failureOf(new BkError('bad', { code: 'X_Y' })).fix).not.toBe('');
  });

  it('AI-02 a list of problems is kept, each with its key and its own code', () => {
    const error = new EnvValidationError([
      { key: 'DATABASE_URL', code: 'CFG_ENV_MISSING', message: 'is missing', fix: 'Set it.' },
    ]);
    const failure = failureOf(error);
    expect(failure.code).toBe('CFG_ENV_MISSING');
    expect(failure.problems).toEqual([
      { key: 'DATABASE_URL', code: 'CFG_ENV_MISSING', message: 'is missing', fix: 'Set it.' },
    ]);
  });

  it('AI-02 anything else is BK_UNEXPECTED, with the message and never the stack', () => {
    const failure = failureOf(new TypeError('boom'));
    expect(failure).toMatchObject({ code: 'BK_UNEXPECTED', message: 'boom', exit: 1 });
    expect(JSON.stringify(failure)).not.toContain('at ');
    expect(failureOf('text').message).toBe('text');
  });
});
