/**
 * BieberKit
 *
 * @file        tools/vitest-setup.ts
 * @description Runs before every test file: makes a test that opens a connection outside the machine fail (TST-03).
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

import { inject } from 'vitest';
import { installNetworkGuard } from '../packages/testing/src/network-guard.ts';

// The values that vitest.config.ts provides. Each package that reads one declares it too, and this program (the config and the
// tools) sees only this file, so the config is checked against the whole list.
declare module 'vitest' {
  export interface ProvidedContext {
    dialectUrls: { postgres: string; mysql: string; require: string };
    cacheRedisUrl: string;
    queueRedisUrl: string;
    storageS3Endpoint: string;
    networkAllow: string[];
  }
}

// The test containers publish their ports on this machine. A host of a CI network that is not this machine is named in
// `TEST_NETWORK_ALLOW` (read in vitest.config.ts), and nothing else may be called.
installNetworkGuard({ allow: inject('networkAllow') });
