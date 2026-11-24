/**
 * BieberKit
 *
 * @file        packages/testing/src/logger.ts
 * @description A logger that keeps the lines, so a test app is quiet and a test can read what it logged.
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

import type { LogFields, Logger } from '@bieberkit/core';

export interface LoggedLine {
  readonly level: string;
  readonly message: string;
  readonly fields: LogFields;
}

export interface MemoryLogger extends Logger {
  readonly lines: readonly LoggedLine[];
}

/** A logger that keeps what it is given. A child shares the lines of its parent, with its bindings added. */
export function createMemoryLogger(bindings: LogFields = {}, lines: LoggedLine[] = []): MemoryLogger {
  const write =
    (level: string) =>
    (message: string, fields: LogFields = {}): void => {
      lines.push({ level, message, fields: { ...bindings, ...fields } });
    };
  return {
    lines,
    level: 'trace',
    fatal: write('fatal'),
    error: write('error'),
    warn: write('warn'),
    info: write('info'),
    debug: write('debug'),
    trace: write('trace'),
    child: (extra) => createMemoryLogger({ ...bindings, ...extra }, lines),
  };
}
