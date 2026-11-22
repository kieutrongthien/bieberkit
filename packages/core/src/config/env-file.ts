/**
 * BieberKit
 *
 * @file        packages/core/src/config/env-file.ts
 * @description Reads a .env file without touching process.env and merges it under the real environment (CFG-03, CFG-04).
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

import { readFileSync } from 'node:fs';
import { parseEnv } from 'node:util';
import { ConfigError } from '../errors/errors.ts';
import type { EnvSource } from './env.ts';

/** Parses `.env` text. It changes nothing global, unlike `process.loadEnvFile`. */
export function parseEnvFile(text: string): EnvSource {
  return { ...parseEnv(text) };
}

/** Real variables win over the file (CFG-03). A variable that is set, even to an empty string, counts as real. */
export function withEnvFile(real: EnvSource, file: EnvSource): EnvSource {
  return { ...file, ...real };
}

/** Reads and parses a `.env` file. A missing file gives no values (CFG-04). Any other failure is an error. */
export function readEnvFile(path: string): EnvSource {
  let text: string;
  try {
    text = readFileSync(path, 'utf8');
  } catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 'ENOENT') return {};
    throw new ConfigError(`The environment file ${path} cannot be read.`, {
      code: 'CFG_ENV_FILE',
      fix: 'Check that the path is a readable file, or remove it.',
      cause: error,
    });
  }
  return parseEnvFile(text);
}
