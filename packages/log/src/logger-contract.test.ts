/**
 * BieberKit
 *
 * @file        packages/log/src/logger-contract.test.ts
 * @description Runs the logger contract suite against the default logger of core and the pino adapter, so that both write the same line (OBS-01, SEC-09, ADR 0003).
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

import { createLogger } from '@bieberkit/core';
import { createPinoLogger } from './adapters/pino/index.ts';
import { loggerContractSuite } from './testing/index.ts';

loggerContractSuite('core default', { make: createLogger });
loggerContractSuite('pino', { make: createPinoLogger });
