/**
 * BieberKit
 *
 * @file        packages/core/src/reporting/process-handlers.test.ts
 * @description Tests of the process handlers: an error that nothing caught is reported, the reporter is flushed, and the process ends with 1 (OBS-06).
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

import { EventEmitter } from 'node:events';
import { describe, expect, it } from 'vitest';
import { createLogger } from '../logging/logger.ts';
import { installProcessHandlers } from './process-handlers.ts';
import type { ProcessLike } from './process-handlers.ts';
import { createMemoryReporter } from './reporter.ts';
import type { ErrorReporter } from './reporter.ts';

function fakeProcess() {
  const emitter = new EventEmitter();
  const exits: number[] = [];
  const target: ProcessLike = {
    on: (event, listener) => emitter.on(event, listener),
    off: (event, listener) => emitter.off(event, listener),
    exit: (code) => void exits.push(code),
  };
  return { emitter, exits, target };
}

const quiet = () => {
  const lines: string[] = [];
  return { lines, logger: createLogger({ level: 'fatal', role: 'web', write: (line) => void lines.push(line) }) };
};

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

describe('OBS-06 process handlers', () => {
  it('OBS-06 an uncaught exception is logged, reported as fatal, flushed, and the process ends with 1', async () => {
    const { emitter, exits, target } = fakeProcess();
    const reporter = createMemoryReporter();
    const { lines, logger } = quiet();
    installProcessHandlers({ reporter, logger, process: target });
    const error = new Error('nobody caught this');
    emitter.emit('uncaughtException', error);
    await wait(10);
    expect(reporter.reports).toHaveLength(1);
    expect(reporter.reports[0]?.error).toBe(error);
    expect(reporter.reports[0]?.context).toMatchObject({
      source: 'process',
      level: 'fatal',
      tags: { kind: 'uncaughtException' },
    });
    expect(lines[0]).toContain('nobody caught this');
    expect(exits).toEqual([1]);
  });

  it('OBS-06 an unhandled rejection is treated the same way, as Node does', async () => {
    const { emitter, exits, target } = fakeProcess();
    const reporter = createMemoryReporter();
    installProcessHandlers({ reporter, logger: quiet().logger, process: target });
    emitter.emit('unhandledRejection', 'a string reason');
    await wait(10);
    expect(reporter.reports[0]?.context.tags).toEqual({ kind: 'unhandledRejection' });
    expect(exits).toEqual([1]);
  });

  it('OBS-06 waits for the reporter before it ends, and ends anyway when the reporter fails', async () => {
    const { emitter, exits, target } = fakeProcess();
    let flushed = false;
    let asked: number | undefined;
    const slow: ErrorReporter = {
      report: () => undefined,
      flush: async (timeout) => {
        asked = timeout;
        await wait(40);
        flushed = true;
        return true;
      },
    };
    installProcessHandlers({ reporter: slow, logger: quiet().logger, process: target, flushMs: 1234 });
    emitter.emit('uncaughtException', new Error('x'));
    expect(exits).toEqual([]);
    await wait(80);
    expect(asked).toBe(1234);
    expect(flushed).toBe(true);
    expect(exits).toEqual([1]);
    const second = fakeProcess();
    installProcessHandlers({
      reporter: { report: () => undefined, flush: () => Promise.reject(new Error('down')) },
      logger: quiet().logger,
      process: second.target,
    });
    second.emitter.emit('uncaughtException', new Error('x'));
    await wait(10);
    expect(second.exits).toEqual([1]);
  });

  it('OBS-06 a second error while the process ends is reported, and the process ends once', async () => {
    const { emitter, exits, target } = fakeProcess();
    const reporter = createMemoryReporter();
    installProcessHandlers({ reporter, logger: quiet().logger, process: target });
    emitter.emit('uncaughtException', new Error('one'));
    emitter.emit('unhandledRejection', new Error('two'));
    await wait(10);
    expect(reporter.reports).toHaveLength(2);
    expect(exits).toEqual([1]);
  });

  it('OBS-06 the function that is answered removes the listeners', () => {
    const { emitter, target } = fakeProcess();
    const dispose = installProcessHandlers({
      reporter: createMemoryReporter(),
      logger: quiet().logger,
      process: target,
    });
    expect(emitter.listenerCount('uncaughtException')).toBe(1);
    dispose();
    expect(emitter.listenerCount('uncaughtException')).toBe(0);
    expect(emitter.listenerCount('unhandledRejection')).toBe(0);
  });
});
