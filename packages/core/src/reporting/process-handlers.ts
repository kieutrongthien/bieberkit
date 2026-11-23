/**
 * BieberKit
 *
 * @file        packages/core/src/reporting/process-handlers.ts
 * @description Reports the errors that nothing caught, flushes the reporter and ends the process, as Node does without a handler (OBS-06).
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

import type { Logger } from '../logging/logger.ts';
import type { ErrorReporter } from './reporter.ts';
import { reportError } from './reporter.ts';

/** The part of `process` that is used, so that a test can give another one. */
export interface ProcessLike {
  on(event: 'uncaughtException' | 'unhandledRejection', listener: (reason: unknown) => void): unknown;
  off(event: 'uncaughtException' | 'unhandledRejection', listener: (reason: unknown) => void): unknown;
  exit(code: number): void;
}

export interface ProcessHandlerOptions {
  readonly reporter: ErrorReporter;
  readonly logger: Logger;
  /** How long to wait for the reporter before the process ends. Defaults to 2 seconds. */
  readonly flushMs?: number;
  readonly process?: ProcessLike;
}

/**
 * Makes an error that nothing caught a report. Node ends the process for such an error, and a listener would stop that, so after the
 * report is out (or `flushMs` has passed) the process ends with code 1, the same as without the listener. Answers the function that
 * removes the listeners.
 */
export function installProcessHandlers(options: ProcessHandlerOptions): () => void {
  const target: ProcessLike = options.process ?? process;
  const flushMs = options.flushMs ?? 2_000;
  let ending = false;
  const handle = (kind: string) => (reason: unknown) => {
    options.logger.fatal(`${kind}: the process ends`, {
      reason: reason instanceof Error ? reason.message : String(reason),
    });
    reportError(options.reporter, reason, { source: 'process', level: 'fatal', tags: { kind } });
    if (ending) return;
    ending = true;
    void options.reporter
      .flush(flushMs)
      .catch(() => false)
      .finally(() => target.exit(1));
  };
  const onException = handle('uncaughtException');
  const onRejection = handle('unhandledRejection');
  target.on('uncaughtException', onException);
  target.on('unhandledRejection', onRejection);
  return () => {
    target.off('uncaughtException', onException);
    target.off('unhandledRejection', onRejection);
  };
}
