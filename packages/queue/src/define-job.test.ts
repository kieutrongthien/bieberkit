/**
 * BieberKit
 *
 * @file        packages/queue/src/define-job.test.ts
 * @description Tests of the declaration of a job and of the check of its input (Q-02, Q-03).
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

// These tests give inputs that the types forbid, on purpose.
/* oxlint-disable typescript/no-unsafe-type-assertion */
import * as z from 'zod/mini';
import { describe, expect, it } from 'vitest';
import { checkInput } from './context.ts';
import { defaultBackoffMs, defineJob, QueueError } from './contract.ts';

const schema = z.object({ id: z.string().check(z.minLength(2)), n: z.optional(z.number()) });
const codeOf = (run: () => unknown): string | undefined => {
  try {
    run();
  } catch (error) {
    return error instanceof QueueError ? error.code : 'NOT_A_QUEUE_ERROR';
  }
  return undefined;
};

describe('Q-02 a job', () => {
  it('Q-03 has the default queue, three deliveries and a timeout, and holds its handler', () => {
    const job = defineJob({ name: 'crm.deal.notify', input: schema, handler: async () => undefined });
    expect(job).toMatchObject({
      kind: 'job',
      name: 'crm.deal.notify',
      queue: 'default',
      attempts: 3,
      timeoutMs: 300_000,
    });
    expect(typeof job.handler).toBe('function');
  });

  it('Q-03 may be in any of the three queues, and no other', () => {
    for (const queue of ['critical', 'default', 'reports'] as const)
      expect(defineJob({ name: 'a.b', queue, input: schema, handler: () => undefined }).queue).toBe(queue);
    expect(
      codeOf(() => defineJob({ name: 'a.b', queue: 'slow' as never, input: schema, handler: () => undefined })),
    ).toBe('QUEUE_JOB_INVALID');
  });

  it('Q-02 is named like a module and a job: lower case, with a dot', () => {
    for (const name of ['a.b', 'crm.deal.notify', 'my-mod.send-mail'])
      expect(codeOf(() => defineJob({ name, input: schema, handler: () => undefined }))).toBeUndefined();
    for (const name of ['', 'notify', 'Crm.Deal', 'crm..deal', 'crm.deal ', '1a.b'])
      expect([name, codeOf(() => defineJob({ name, input: schema, handler: () => undefined }))]).toEqual([
        name,
        'QUEUE_JOB_INVALID',
      ]);
  });

  it('Q-01 has 1 to 20 deliveries, and a timeout that is a positive number', () => {
    for (const attempts of [0, 21, 1.5, -1])
      expect([
        attempts,
        codeOf(() => defineJob({ name: 'a.b', input: schema, attempts, handler: () => undefined })),
      ]).toEqual([attempts, 'QUEUE_JOB_INVALID']);
    expect(codeOf(() => defineJob({ name: 'a.b', input: schema, timeoutMs: 0, handler: () => undefined }))).toBe(
      'QUEUE_JOB_INVALID',
    );
    expect(defineJob({ name: 'a.b', input: schema, attempts: 20, handler: () => undefined }).attempts).toBe(20);
  });

  it('Q-01 waits 200 ms, 400 ms, 800 ms after the failures, at most an hour, unless the job says otherwise', () => {
    expect([1, 2, 3, 4].map(defaultBackoffMs)).toEqual([200, 400, 800, 1600]);
    expect(defaultBackoffMs(60)).toBe(3_600_000);
    expect(defineJob({ name: 'a.b', input: schema, backoffMs: () => 5, handler: () => undefined }).backoffMs(9)).toBe(
      5,
    );
  });
});

describe('Q-02 the check of the input', () => {
  it('Q-02 gives what the schema made of the input', async () => {
    expect(await checkInput('a.b', schema, { id: 'ab', n: 1 })).toEqual({ id: 'ab', n: 1 });
  });

  it('Q-02 refuses an input that does not fit, with the reasons, as QUEUE_INPUT_INVALID', async () => {
    const failure = await checkInput('a.b', schema, { id: 'a' }).catch((error: unknown) => error);
    expect(failure).toBeInstanceOf(QueueError);
    expect(failure).toMatchObject({ code: 'QUEUE_INPUT_INVALID', status: 400 });
  });

  it('Q-02 refuses a schema that cannot be run', async () => {
    const failure = await checkInput('a.b', {} as never, {}).catch((error: unknown) => error);
    expect(failure).toMatchObject({ code: 'QUEUE_INPUT_INVALID', status: 500 });
  });
});
