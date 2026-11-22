/**
 * BieberKit
 *
 * @file        packages/core/src/config/load-env.ts
 * @description loadEnv: the only function in the repository that reads process.env, combining it with a .env file (P8, CFG-02).
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

import { resolve } from 'node:path';
import { assertProductionSafe, readCoreEnv } from './core-env.ts';
import type { CoreEnvResult, ReadCoreEnvOptions } from './core-env.ts';
import type { EnvSource } from './env.ts';
import { readEnvFile, withEnvFile } from './env-file.ts';

export interface LoadEnvOptions extends ReadCoreEnvOptions {
  /** The real environment. Defaults to `process.env`. */
  readonly source?: EnvSource;
  /** Path of the `.env` file, relative to the working directory. `false` skips the file. Defaults to `.env`. */
  readonly envFile?: string | false;
}

/**
 * Loads and validates the environment for the whole process (P8, CFG-02). Real variables win over the file (CFG-03),
 * a missing file is fine (CFG-04), and unsafe production settings stop the boot (CFG-07).
 */
export function loadEnv(options: LoadEnvOptions = {}): CoreEnvResult {
  const real = options.source ?? process.env;
  const file = options.envFile === false ? {} : readEnvFile(resolve(options.envFile ?? '.env'));
  const result = readCoreEnv(withEnvFile(real, file), options);
  assertProductionSafe(result.env);
  return result;
}
