#!/usr/bin/env node
/**
 * BieberKit
 *
 * @file        packages/cli/src/bin.ts
 * @description Executable entry point of the bieberkit command.
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

import { packageName } from './index.ts';

// Placeholder until the bieberkit commands in spec section 5 are implemented.
process.stdout.write(`${packageName} 0.0.0: not implemented yet. See docs/spec/SPEC.md section 5.\n`);
process.exitCode = 1;
