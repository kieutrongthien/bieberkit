/**
 * BieberKit
 *
 * @file        packages/queue/src/cron.ts
 * @description A small parser of cron expressions of five fields, in UTC, for the schedules of the scheduler (Q-07).
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

import { queueError } from './contract.ts';

export interface Cron {
  /** Whether the minute of `date` (UTC) is one that the expression names. */
  matches(date: Date): boolean;
}

interface Field {
  readonly any: boolean;
  readonly values: ReadonlySet<number>;
}

const RANGES = [
  { name: 'minute', min: 0, max: 59 },
  { name: 'hour', min: 0, max: 23 },
  { name: 'day of the month', min: 1, max: 31 },
  { name: 'month', min: 1, max: 12 },
  { name: 'day of the week', min: 0, max: 7 },
] as const;

function invalid(expression: string, why: string): never {
  throw queueError(
    'QUEUE_CRON_INVALID',
    500,
    `The cron expression "${expression}" is not valid: ${why}.`,
    'Write five fields: minute hour day month weekday, for example 0 3 * * 1.',
  );
}

function parseField(expression: string, text: string, range: (typeof RANGES)[number]): Field {
  const values = new Set<number>();
  for (const part of text.split(',')) {
    const [span = '', stepText] = part.split('/');
    const step = stepText === undefined ? 1 : Number(stepText);
    if (!Number.isInteger(step) || step < 1) invalid(expression, `the step "${stepText}" of the ${range.name}`);
    let from: number;
    let to: number;
    if (span === '*') {
      from = range.min;
      to = range.max;
    } else if (/^\d+$/.test(span)) {
      from = Number(span);
      to = stepText === undefined ? from : range.max;
    } else if (/^\d+-\d+$/.test(span)) {
      [from = 0, to = 0] = span.split('-').map(Number);
    } else return invalid(expression, `"${part}" in the ${range.name}`);
    if (from < range.min || to > range.max || from > to) invalid(expression, `${range.name} ${span} is out of range`);
    for (let value = from; value <= to; value += step)
      values.add(range.name === 'day of the week' && value === 7 ? 0 : value);
  }
  return { any: text === '*', values };
}

/** Parses minute, hour, day of the month, month and day of the week, with `*`, lists, ranges and steps. A day that is named by both the month and the week matches either, as cron does. */
export function parseCron(expression: string): Cron {
  const parts = expression.trim().split(/\s+/);
  if (parts.length !== 5) invalid(expression, `it has ${parts.length} fields and needs 5`);
  const [minute, hour, day, month, week] = parts.map((text, index) =>
    parseField(expression, text, RANGES[index] ?? RANGES[0]),
  );
  if (minute === undefined || hour === undefined || day === undefined || month === undefined || week === undefined)
    return invalid(expression, 'a field is missing');
  return {
    matches(date) {
      if (
        !minute.values.has(date.getUTCMinutes()) ||
        !hour.values.has(date.getUTCHours()) ||
        !month.values.has(date.getUTCMonth() + 1)
      )
        return false;
      const dayOk = day.values.has(date.getUTCDate());
      const weekOk = week.values.has(date.getUTCDay());
      if (day.any && week.any) return true;
      if (day.any) return weekOk;
      if (week.any) return dayOk;
      return dayOk || weekOk;
    },
  };
}
