/**
 * BieberKit
 *
 * @file        packages/storage/src/memory-disk.test.ts
 * @description Tests of the memory disk: the disk suite, and the fake signed URLs that the tests of the storage rely on.
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

import { createMemoryDisk } from './memory-disk.ts';
import { diskContractSuite } from './testing/disk-suite.ts';

diskContractSuite('memory', { make: async () => createMemoryDisk(), keepsContentType: true });
