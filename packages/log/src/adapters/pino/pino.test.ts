/**
 * BieberKit
 *
 * @file        packages/log/src/adapters/pino/pino.test.ts
 * @description Tests of what is particular to the pino adapter: a message is text and never a format, and a line is the same whichever stream receives it (OBS-01, ADR 0003).
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

import { describe, expect, it } from 'vitest';
import { createPinoLogger } from './index.ts';

const NOW = new Date('2026-11-22T10:00:00.000Z');

function make(): { lines: string[]; log: ReturnType<typeof createPinoLogger> } {
  const lines: string[] = [];
  const log = createPinoLogger({ level: 'info', role: 'worker', write: (line) => lines.push(line), now: () => NOW });
  return { lines, log };
}

describe('OBS-01 pino adapter', () => {
  it('OBS-01 a message is text: a percent sign in it is not a format', () => {
    const { lines, log } = make();
    log.info('100% done, %s %d', { count: 1 });
    expect(JSON.parse(lines[0] ?? '')).toMatchObject({ msg: '100% done, %s %d', count: 1 });
  });

  it('OBS-01 hands the sink a line without the newline of pino', () => {
    const { lines, log } = make();
    log.info('a');
    log.info('b');
    expect(lines).toHaveLength(2);
    for (const line of lines) expect(line.endsWith('\n')).toBe(false);
  });

  it('OBS-01 a field named err is data, and keeps the shape of the contract and not the shape of pino', () => {
    const { lines, log } = make();
    log.error('failed', { err: new Error('boom') });
    const line: Record<string, unknown> = JSON.parse(lines[0] ?? '');
    expect(line['err']).toMatchObject({ name: 'Error', message: 'boom' });
    expect(line['err']).not.toHaveProperty('type');
  });

  it('OBS-01 reads the time of the clock it was given for every line', () => {
    let current = new Date('2026-01-01T00:00:00.000Z');
    const lines: string[] = [];
    const log = createPinoLogger({ level: 'info', role: 'web', write: (line) => lines.push(line), now: () => current });
    log.info('a');
    current = new Date('2026-01-01T00:00:01.000Z');
    log.info('b');
    const times = lines.map((line) => {
      const parsed: { time?: string } = JSON.parse(line);
      return parsed.time;
    });
    expect(times).toEqual(['2026-01-01T00:00:00.000Z', '2026-01-01T00:00:01.000Z']);
  });
});
