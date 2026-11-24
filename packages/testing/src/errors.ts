/**
 * BieberKit
 *
 * @file        packages/testing/src/errors.ts
 * @description The errors of the testing package: a mistake in the way a test is set up, with a code and the fix.
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

import { BkError } from '@bieberkit/core';

/** A test that is set up wrongly. Its code starts with `TEST_`. */
export class TestingError extends BkError {}

export function testingError(code: string, message: string, fix: string): TestingError {
  return new TestingError(message, { code, status: 500, fix });
}
