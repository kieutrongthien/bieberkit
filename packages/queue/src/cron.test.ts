/**
 * BieberKit
 *
 * @file        packages/queue/src/cron.test.ts
 * @description Tests of the cron expressions of the scheduler: five fields, in UTC (Q-07).
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
import { parseCron } from './cron.ts';
import { QueueError } from './contract.ts';

const at = (text: string): Date => new Date(`${text}Z`);

describe('Q-07 cron', () => {
  it('Q-07 every minute is *, and a minute and an hour are numbers', () => {
    expect(parseCron('* * * * *').matches(at('2026-11-23T10:17:00'))).toBe(true);
    const daily = parseCron('30 3 * * *');
    expect(daily.matches(at('2026-11-23T03:30:00'))).toBe(true);
    expect(daily.matches(at('2026-11-23T03:31:00'))).toBe(false);
    expect(daily.matches(at('2026-11-23T04:30:00'))).toBe(false);
  });

  it('Q-07 knows lists, ranges and steps', () => {
    const cron = parseCron('0,15,30-32 */6 * * *');
    for (const text of ['00:00', '06:15', '12:30', '18:31', '12:32'])
      expect([text, cron.matches(at(`2026-11-23T${text}:00`))]).toEqual([text, true]);
    for (const text of ['00:01', '05:00', '12:33', '12:45'])
      expect([text, cron.matches(at(`2026-11-23T${text}:00`))]).toEqual([text, false]);
    expect(parseCron('10-20/5 * * * *').matches(at('2026-11-23T01:15:00'))).toBe(true);
    expect(parseCron('10-20/5 * * * *').matches(at('2026-11-23T01:16:00'))).toBe(false);
    expect(parseCron('5/20 * * * *').matches(at('2026-11-23T01:45:00'))).toBe(true);
  });

  it('Q-07 a day of the week is 0 to 7, with 0 and 7 as Sunday', () => {
    const monday = parseCron('0 9 * * 1');
    expect(monday.matches(at('2026-11-23T09:00:00'))).toBe(true);
    expect(monday.matches(at('2026-11-24T09:00:00'))).toBe(false);
    expect(parseCron('0 0 * * 7').matches(at('2026-11-22T00:00:00'))).toBe(true);
    expect(parseCron('0 0 * * 0').matches(at('2026-11-22T00:00:00'))).toBe(true);
  });

  it('Q-07 a day of the month and a day of the week that are both named match either, as cron does', () => {
    const cron = parseCron('0 0 13 * 5');
    expect(cron.matches(at('2026-11-13T00:00:00'))).toBe(true);
    expect(cron.matches(at('2026-11-20T00:00:00'))).toBe(true);
    expect(cron.matches(at('2026-11-21T00:00:00'))).toBe(false);
  });

  it('Q-07 reads the clock in UTC', () => {
    expect(parseCron('0 0 1 1 *').matches(new Date(Date.UTC(2027, 0, 1, 0, 0)))).toBe(true);
    expect(parseCron('0 0 1 1 *').matches(new Date(Date.UTC(2026, 11, 31, 23, 59)))).toBe(false);
  });

  it('Q-07 refuses an expression that is not five valid fields', () => {
    for (const bad of [
      '',
      '* * * *',
      '* * * * * *',
      '60 * * * *',
      '* 24 * * *',
      '* * 0 * *',
      '* * * 13 *',
      '* * * * 8',
      'a * * * *',
      '*/0 * * * *',
      '5-1 * * * *',
      '1,,2 * * * *',
    ]) {
      let code: string | undefined;
      try {
        parseCron(bad);
      } catch (error) {
        code = error instanceof QueueError ? error.code : 'OTHER';
      }
      expect([bad, code]).toEqual([bad, 'QUEUE_CRON_INVALID']);
    }
  });
});
