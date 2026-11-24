/**
 * BieberKit
 *
 * @file        packages/storage/src/testing/disk-suite.test.ts
 * @description Proves skipped disk contract suites never open a storage client or make network requests (TST-03).
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

import { describe, expect, it } from 'vitest';
import { createMemoryDisk } from '../memory-disk.ts';
import { diskContractSuite } from './disk-suite.ts';

let opens = 0;
describe.skip('TST-03 a skipped storage integration suite', () => {
  diskContractSuite('unused disk', {
    make: async () => {
      opens += 1;
      return createMemoryDisk();
    },
  });
});

it('TST-03 collecting a skipped disk suite does not open its client', () => {
  expect(opens).toBe(0);
});
