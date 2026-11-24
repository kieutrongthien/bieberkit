/**
 * BieberKit
 *
 * @file        packages/queue/src/observability.dialects.test.ts
 * @description Tests of the trace that a job keeps in its row and continues in the worker, on every dialect (OBS-02, ADR 0023).
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
import { createMemorySpanExporter, createTracer, requestContext } from '@bieberkit/core';
import { rawKysely } from '@bieberkit/data/orm';
import { expect, it } from 'vitest';
import { defineJob } from './contract.ts';
import { createQueue } from './queue.ts';
import { JOBS_TABLE } from './tables.ts';
import { describeDialects } from './testing/dialects.ts';

const empty = z.object({});
const TRACE = '0af7651916cd43dd8448eb211c80319c';
const SPAN = 'b7ad6b7169203331';

const waitFor = async (done: () => boolean, timeoutMs = 15_000): Promise<void> => {
  const until = Date.now() + timeoutMs;
  while (!done()) {
    if (Date.now() > until) throw new Error('Not done in time.');
    await new Promise((resolve) => setTimeout(resolve, 15));
  }
};

describeDialects('OBS-02 the trace of a job', ({ open }) => {
  it('OBS-02 is kept in the row, and the worker continues it, as a child of the dispatch', async () => {
    const db = await open([]);
    const exporter = createMemorySpanExporter();
    const tracer = createTracer({ exporter });
    let ran = false;
    const job = defineJob({ name: 'obs.stored', input: empty, handler: () => void (ran = true) });
    const queue = await createQueue({ driver: 'database', jobs: [job], db, tracer });
    const { id } = await requestContext.run({ requestId: 'r1', traceId: TRACE, spanId: SPAN }, () =>
      queue.dispatch(job, {}),
    );
    const row = await (
      await rawKysely(db)
    )
      .selectFrom(JOBS_TABLE)
      .select('traceparent')
      .where('job_id', '=', id)
      .executeTakeFirst();
    const dispatch = exporter.spans.find((span) => span.name === 'dispatch obs.stored');
    expect(row?.['traceparent']).toBe(`00-${TRACE}-${dispatch?.spanId}-01`);
    const worker = queue.createWorker({ pollMs: 10 });
    worker.start();
    await waitFor(() => ran);
    await worker.stop();
    const delivery = exporter.spans.find((span) => span.name === 'job obs.stored');
    expect(delivery).toMatchObject({ kind: 'consumer', traceId: TRACE, parentSpanId: dispatch?.spanId });
  });

  it('OBS-02 a job stored before the trace column, or by code with no trace, starts a trace of its own', async () => {
    const db = await open([]);
    const exporter = createMemorySpanExporter();
    const tracer = createTracer({ exporter });
    let ran = false;
    const job = defineJob({ name: 'obs.bare', input: empty, handler: () => void (ran = true) });
    // The dispatch has no tracer, so the row has no trace, as a row from before the column.
    const writer = await createQueue({ driver: 'database', jobs: [job], db });
    await writer.dispatch(job, {});
    const queue = await createQueue({ driver: 'database', jobs: [job], db, tracer });
    const worker = queue.createWorker({ pollMs: 10 });
    worker.start();
    await waitFor(() => ran);
    await worker.stop();
    const delivery = exporter.spans.find((span) => span.name === 'job obs.bare');
    expect(delivery?.traceId).toMatch(/^[0-9a-f]{32}$/);
    expect(delivery).not.toHaveProperty('parentSpanId');
  });
});
