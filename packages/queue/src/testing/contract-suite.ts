/**
 * BieberKit
 *
 * @file        packages/queue/src/testing/contract-suite.ts
 * @description The shared contract suite that every queue driver passes: nine cases for delivery, retries, dead letters, delay, isolation, redelivery, exactly one run and throughput (Q-11, ADR 0010).
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

import * as z from 'zod/mini';
import { describe, expect, it } from 'vitest';
import { requestContext } from '@bieberkit/core';
import { defineJob } from '../contract.ts';
import type { JobDef, Queue } from '../contract.ts';

/** A queue for one test, made with the jobs that the test declares. `close` ends it and everything that it started. */
export interface ContractSubject {
  readonly queue: Queue;
  readonly close: () => Promise<void>;
}

export interface ContractOptions {
  /** The cases (1 to 9) that the driver does not offer, with the reason in the name of the driver. The `sync` driver has no crash and no second worker. */
  readonly skip?: readonly number[];
}

const TENANT = '0190f6b2-7c4e-7000-8000-0000000000a1';
const USER = '0190f6b2-7c4e-7000-8000-0000000000b1';

async function waitFor(done: () => boolean | Promise<boolean>, timeoutMs = 20_000, stepMs = 15): Promise<void> {
  const until = Date.now() + timeoutMs;
  while (!(await done())) {
    if (Date.now() > until) throw new Error(`Not done in ${timeoutMs} ms.`);
    await new Promise((resolve) => setTimeout(resolve, stepMs));
  }
}

const empty = z.object({});

/**
 * Registers the nine cases of ADR 0010 for a driver (Q-11), and a tenth for the result of a job. `make` gives a queue for the jobs of one test. The cases are numbered as
 * in the ADR, so a failure names the guarantee that the driver breaks.
 */
export function queueContractSuite(
  name: string,
  make: (jobs: readonly JobDef[]) => Promise<ContractSubject>,
  options: ContractOptions = {},
): void {
  const skipped = new Set(options.skip ?? []);
  const run = (number: number, title: string, body: () => Promise<void>, timeout = 30_000): void => {
    const test = skipped.has(number) ? it.skip : it;
    test(`Q-11 case ${number}: ${title}`, body, timeout);
  };

  describe(`Q-11 the contract of the queue on ${name}`, () => {
    run(
      1,
      'a job runs as the code that dispatched it, with its tenant, its user and its Unicode input (Q-10)',
      async () => {
        const seen: Record<string, unknown>[] = [];
        const job = defineJob<{ text: string }>({
          name: 'contract.context',
          input: z.object({ text: z.string() }),
          handler: async (input, context) => {
            const now = requestContext.get();
            seen.push({
              text: input.text,
              tenant: now?.tenantId,
              user: now?.userId,
              request: now?.requestId,
              contextTenant: context.tenantId,
            });
          },
        });
        const { queue, close } = await make([job]);
        const worker = queue.createWorker({ pollMs: 20 });
        worker.start();
        await requestContext.run({ requestId: 'req-contract', tenantId: TENANT, userId: USER }, () =>
          queue.dispatch(job, { text: 'Nguyễn Văn Ạ 🙂 日本語' }),
        );
        await waitFor(() => seen.length === 1);
        expect(seen[0]).toEqual({
          text: 'Nguyễn Văn Ạ 🙂 日本語',
          tenant: TENANT,
          user: USER,
          request: 'req-contract',
          contextTenant: TENANT,
        });
        await worker.stop();
        await close();
      },
    );

    run(2, 'one run for several dispatches of the same job id, one after another and at once (Q-01)', async () => {
      let runs = 0;
      const job = defineJob({ name: 'contract.once', input: empty, handler: async () => void (runs += 1) });
      const { queue, close } = await make([job]);
      const worker = queue.createWorker({ pollMs: 20 });
      worker.start();
      const first = await queue.dispatch(job, {}, { jobId: 'same-1' });
      const second = await queue.dispatch(job, {}, { jobId: 'same-1' });
      const third = await queue.dispatch(job, {}, { jobId: 'same-1' });
      const together = await Promise.all(Array.from({ length: 5 }, () => queue.dispatch(job, {}, { jobId: 'same-2' })));
      expect([first.duplicate, second.duplicate, third.duplicate]).toEqual([false, true, true]);
      expect(together.filter((item) => !item.duplicate)).toHaveLength(1);
      await waitFor(() => runs >= 2);
      await new Promise((resolve) => setTimeout(resolve, 150));
      expect(runs).toBe(2);
      await worker.stop();
      await close();
    });

    run(3, 'three deliveries with the backoff of the job between them (Q-01)', async () => {
      const at: number[] = [];
      const job = defineJob({
        name: 'contract.retry',
        input: empty,
        attempts: 3,
        backoffMs: (attempt) => 200 * 2 ** (attempt - 1),
        handler: async () => {
          at.push(Date.now());
          if (at.length < 3) throw new Error('not yet');
        },
      });
      const { queue, close } = await make([job]);
      const worker = queue.createWorker({ pollMs: 20 });
      worker.start();
      await queue.dispatch(job, {});
      await waitFor(() => at.length === 3);
      expect(at[1]! - at[0]!).toBeGreaterThanOrEqual(190);
      expect(at[2]! - at[1]!).toBeGreaterThanOrEqual(390);
      await worker.stop();
      await close();
    });

    run(4, 'a job that fails every delivery is dead with its error, and a retry clears it (Q-04)', async () => {
      let fail = true;
      let runs = 0;
      const job = defineJob({
        name: 'contract.dead',
        input: empty,
        attempts: 2,
        backoffMs: () => 20,
        handler: async () => {
          runs += 1;
          if (fail) throw new Error('boom');
        },
      });
      const { queue, close } = await make([job]);
      const worker = queue.createWorker({ pollMs: 20 });
      worker.start();
      await queue.dispatch(job, {}, { jobId: 'dead-1' });
      await waitFor(async () => (await queue.deadLetters()).jobs.length === 1);
      const [dead] = (await queue.deadLetters()).jobs;
      expect(dead).toMatchObject({ id: 'dead-1', name: 'contract.dead', queue: 'default', attempts: 2 });
      expect(dead?.error).toContain('boom');
      expect(runs).toBe(2);
      fail = false;
      await queue.retry('dead-1');
      await waitFor(async () => (await queue.deadLetters()).jobs.length === 0 && runs === 3);
      expect((await queue.stats()).default.dead).toBe(0);
      await worker.stop();
      await close();
    });

    run(5, 'a delayed job runs after its delay', async () => {
      let ranAt = 0;
      const job = defineJob({ name: 'contract.delay', input: empty, handler: async () => void (ranAt = Date.now()) });
      const { queue, close } = await make([job]);
      const worker = queue.createWorker({ pollMs: 20 });
      worker.start();
      const sent = Date.now();
      void queue.dispatch(job, {}, { delayMs: 600 });
      await waitFor(() => ranAt > 0);
      expect(ranAt - sent).toBeGreaterThanOrEqual(580);
      await worker.stop();
      await close();
    });

    run(6, 'a busy reports queue does not keep a critical job waiting (Q-03)', async () => {
      const started: string[] = [];
      let criticalAt = 0;
      const slow = defineJob({
        name: 'contract.slow',
        queue: 'reports',
        input: empty,
        handler: async () => {
          started.push('reports');
          await new Promise((resolve) => setTimeout(resolve, 700));
        },
      });
      const urgent = defineJob({
        name: 'contract.urgent',
        queue: 'critical',
        input: empty,
        handler: async () => void (criticalAt = Date.now()),
      });
      const { queue, close } = await make([slow, urgent]);
      const worker = queue.createWorker({ pollMs: 20, concurrency: { reports: 1, critical: 2, default: 1 } });
      worker.start();
      await queue.dispatch(slow, {});
      await queue.dispatch(slow, {});
      await waitFor(() => started.length === 1);
      const sent = Date.now();
      await queue.dispatch(urgent, {});
      await waitFor(() => criticalAt > 0);
      expect(criticalAt - sent).toBeLessThan(450);
      expect(started).toHaveLength(1);
      await worker.stop();
      await close();
    });

    run(7, 'the job of a worker that was killed is delivered again to another', async () => {
      let deliveries = 0;
      let finished = false;
      const job = defineJob({
        name: 'contract.crash',
        input: empty,
        attempts: 3,
        handler: async () => {
          deliveries += 1;
          if (deliveries === 1) await new Promise(() => undefined);
          finished = true;
        },
      });
      const { queue, close } = await make([job]);
      const lost = queue.createWorker({ pollMs: 20, leaseMs: 400, heartbeatMs: 100 });
      lost.start();
      await queue.dispatch(job, {});
      await waitFor(() => deliveries === 1);
      lost.crash();
      const saved = queue.createWorker({ pollMs: 20, leaseMs: 400, heartbeatMs: 100 });
      saved.start();
      const killedAt = Date.now();
      await waitFor(() => finished, 10_000);
      expect(Date.now() - killedAt).toBeLessThan(5000);
      expect(deliveries).toBe(2);
      await saved.stop();
      await close();
    });

    run(8, 'two workers and 200 jobs: each job runs exactly once', async () => {
      const runs = new Map<string, number>();
      let active = 0;
      let peak = 0;
      const job = defineJob<{ n: number }>({
        name: 'contract.many',
        input: z.object({ n: z.number() }),
        handler: async (input) => {
          active += 1;
          peak = Math.max(peak, active);
          runs.set(String(input.n), (runs.get(String(input.n)) ?? 0) + 1);
          await new Promise((resolve) => setTimeout(resolve, 5));
          active -= 1;
        },
      });
      const { queue, close } = await make([job]);
      const workers = [
        queue.createWorker({ pollMs: 10, concurrency: 8 }),
        queue.createWorker({ pollMs: 10, concurrency: 8 }),
      ];
      for (const worker of workers) worker.start();
      for (let n = 0; n < 200; n += 1) await queue.dispatch(job, { n });
      await waitFor(() => runs.size === 200 && active === 0);
      await new Promise((resolve) => setTimeout(resolve, 100));
      expect([...runs.values()].every((count) => count === 1)).toBe(true);
      expect(peak).toBeLessThanOrEqual(16);
      expect(peak).toBeGreaterThan(1);
      for (const worker of workers) await worker.stop();
      await close();
    });

    run(10, 'what a job returns is kept, and status says where the job is, also for a job that is dead', async () => {
      const answering = defineJob({
        name: 'contract.answer',
        input: empty,
        handler: async () => ({ ok: true, list: [1, 2, 3], text: 'Nguyễn 🙂', nothing: null }),
      });
      const silent = defineJob({ name: 'contract.silent', input: empty, handler: async () => undefined });
      const failing = defineJob({
        name: 'contract.nope',
        input: empty,
        attempts: 1,
        handler: async () => {
          throw new Error('no answer today');
        },
      });
      const { queue, close } = await make([answering, silent, failing]);
      expect(await queue.status('missing')).toBeUndefined();
      const worker = queue.createWorker({ pollMs: 20 });
      worker.start();
      await requestContext.run({ requestId: 'req-status', tenantId: TENANT, userId: USER }, async () => {
        await queue.dispatch(answering, {}, { jobId: 'answer-1' });
        await queue.dispatch(silent, {}, { jobId: 'silent-1' });
        await queue.dispatch(failing, {}, { jobId: 'nope-1' });
      });
      await waitFor(async () => (await queue.status('answer-1'))?.status === 'done');
      await waitFor(async () => (await queue.status('silent-1'))?.status === 'done');
      await waitFor(async () => (await queue.status('nope-1'))?.status === 'dead');
      const done = await queue.status('answer-1');
      expect(done).toMatchObject({
        id: 'answer-1',
        name: 'contract.answer',
        queue: 'default',
        status: 'done',
        attempts: 1,
        result: { ok: true, list: [1, 2, 3], text: 'Nguyễn 🙂', nothing: null },
        tenantId: TENANT,
        userId: USER,
      });
      expect(done?.finishedAt).toBeGreaterThanOrEqual(done?.createdAt ?? Number.POSITIVE_INFINITY);
      expect(done).not.toHaveProperty('error');
      expect(await queue.status('silent-1')).not.toHaveProperty('result');
      const dead = await queue.status('nope-1');
      expect(dead?.error).toContain('no answer today');
      expect(dead).not.toHaveProperty('result');
      await worker.stop();
      await close();
    });

    run(
      9,
      '2,000 jobs that do nothing all run, once each',
      async () => {
        const runs = new Map<number, number>();
        const job = defineJob<{ n: number }>({
          name: 'contract.noop',
          input: z.object({ n: z.number() }),
          handler: async (input) => void runs.set(input.n, (runs.get(input.n) ?? 0) + 1),
        });
        const { queue, close } = await make([job]);
        const workers = [
          queue.createWorker({ pollMs: 10, concurrency: 10 }),
          queue.createWorker({ pollMs: 10, concurrency: 10 }),
        ];
        for (const worker of workers) worker.start();
        const began = Date.now();
        for (let n = 0; n < 2000; n += 1) await queue.dispatch(job, { n });
        await waitFor(() => runs.size === 2000, 55_000);
        const seconds = (Date.now() - began) / 1000;
        expect([...runs.values()].every((count) => count === 1)).toBe(true);
        // A measurement, not a limit that depends on the machine: a driver that does 20 jobs a second or fewer is broken.
        expect(2000 / seconds).toBeGreaterThan(20);
        for (const worker of workers) await worker.stop();
        await close();
      },
      60_000,
    );
  });
}
