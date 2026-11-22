/**
 * BieberKit
 *
 * @file        packages/core/src/roles/roles.ts
 * @description The process roles and how the entry point chooses one from argv (CORE-16, spec 7.1).
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

import { ConfigError } from '../errors/errors.ts';

/** One image, four ways to start it (spec 7.1). */
export const ROLES: readonly ['web', 'worker', 'scheduler', 'migrate'] = ['web', 'worker', 'scheduler', 'migrate'];

export type Role = (typeof ROLES)[number];

const FLAG = '--role=';

function isRole(value: string): value is Role {
  return ROLES.some((role) => role === value);
}

/**
 * Reads the role from the arguments after the program name, as `worker` or `--role=worker`.
 * The first positional argument counts. Other flags are ignored. A positional and a flag must agree.
 */
export function parseRole(argv: readonly string[]): Role {
  const positional = argv.find((arg) => !arg.startsWith('-'));
  const flag = argv.find((arg) => arg.startsWith(FLAG))?.slice(FLAG.length);
  const given = [positional, flag].filter((value): value is string => value !== undefined);
  const first = given[0];
  const fix = `Start with one of ${ROLES.join(', ')}, for example: bieberkit start web`;
  if (first === undefined) {
    throw new ConfigError('No process role was given.', { code: 'CFG_ROLE_INVALID', fix });
  }
  if (given.some((value) => value !== first)) {
    throw new ConfigError(`Two different roles were given: ${given.join(' and ')}.`, { code: 'CFG_ROLE_INVALID', fix });
  }
  if (!isRole(first)) {
    throw new ConfigError(`"${first}" is not a process role.`, { code: 'CFG_ROLE_INVALID', fix });
  }
  return first;
}
