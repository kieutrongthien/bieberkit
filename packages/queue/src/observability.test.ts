/**
 * BieberKit
 *
 * @file        packages/queue/src/observability.test.ts
 * @description Tests of what the queue records: a span for a dispatch and one for each delivery in the trace of the caller, the duration of a job and the depth of the queues (OBS-02, OBS-03, ADR 0023).
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
import { createMemorySpanExporter, createMetrics, createTracer, requestContext } from '@bieberkit/core';
import { describe, expect, it } from 'vitest';
import { defineJob } from './contract.ts';
import { createQueue } from './queue.ts';

const empty = z.object({});
const TRACE = '0af7651916cd43dd8448eb211c80319c';
const SPAN = 'b7ad6b7169203331';

function observed() {
  const exporter = createMemorySpanExporter();
  const tracer = createTracer({ exporter });
  const metrics = createMetrics();
  return { tracer, metrics, spans: exporter.spans };
}

describe('OBS-02 spans of the queue', () => {
  it('OBS-02 a dispatch is a producer span and the delivery is its consumer child, in the trace of the caller', async () => {
    const { tracer, metrics, spans } = observed();
    const job = defineJob({ name: 'obs.notify', input: empty, handler: () => undefined });
    const queue = await createQueue({ driver: 'sync', jobs: [job], tracer, metrics });
    await requestContext.run({ requestId: 'r1', traceId: TRACE, spanId: SPAN }, () => queue.dispatch(job, {}));
    const dispatch = spans.find((span) => span.name === 'dispatch obs.notify');
    const delivery = spans.find((span) => span.name === 'job obs.notify');
    expect(dispatch).toMatchObject({ kind: 'producer', traceId: TRACE, parentSpanId: SPAN });
    expect(dispatch?.attributes).toMatchObject({ 'bk.job.name': 'obs.notify', 'bk.queue': 'default' });
    expect(delivery).toMatchObject({ kind: 'consumer', traceId: TRACE, parentSpanId: dispatch?.spanId, failed: false });
    expect(delivery?.attributes).toMatchObject({
      'bk.job.name': 'obs.notify',
      'bk.queue': 'default',
      'bk.job.attempt': 1,
    });
  });

  it('OBS-02 the handler runs in the trace, so its log lines and its own spans carry the ids of the delivery', async () => {
    const { tracer, spans } = observed();
    let inside: { traceId: string | undefined; spanId: string | undefined; requestId: string | undefined } | undefined;
    const job = defineJob({
      name: 'obs.inside',
      input: empty,
      handler: async () => {
        const context = requestContext.get();
        inside = { traceId: context?.traceId, spanId: context?.spanId, requestId: context?.requestId };
        await tracer.span('inner', {}, () => undefined);
      },
    });
    const queue = await createQueue({ driver: 'sync', jobs: [job], tracer });
    await requestContext.run({ requestId: 'r1', traceId: TRACE, spanId: SPAN }, () => queue.dispatch(job, {}));
    const delivery = spans.find((span) => span.name === 'job obs.inside');
    expect(inside).toEqual({ traceId: TRACE, spanId: delivery?.spanId, requestId: 'r1' });
    expect(spans.find((span) => span.name === 'inner')?.parentSpanId).toBe(delivery?.spanId);
  });

  it('OBS-02 a job dispatched with no trace starts one', async () => {
    const { tracer, spans } = observed();
    const job = defineJob({ name: 'obs.root', input: empty, handler: () => undefined });
    const queue = await createQueue({ driver: 'sync', jobs: [job], tracer });
    await queue.dispatch(job, {});
    const delivery = spans.find((span) => span.name === 'job obs.root');
    const dispatch = spans.find((span) => span.name === 'dispatch obs.root');
    expect(dispatch).not.toHaveProperty('parentSpanId');
    expect(delivery?.traceId).toBe(dispatch?.traceId);
  });

  it('OBS-02 a handler that fails fails its span with the class of the error and no message, and each retry is a span', async () => {
    const { tracer, spans } = observed();
    const job = defineJob({
      name: 'obs.fail',
      input: empty,
      attempts: 2,
      backoffMs: () => 1,
      handler: () => {
        throw new TypeError('card 4242 4242 4242 4242');
      },
    });
    const queue = await createQueue({ driver: 'sync', jobs: [job], tracer });
    await queue.dispatch(job, {});
    const deliveries = spans.filter((span) => span.name === 'job obs.fail');
    expect(deliveries.map((span) => [span.failed, span.attributes['bk.job.attempt']])).toEqual([
      [true, 1],
      [true, 2],
    ]);
    expect(deliveries[0]?.attributes['exception.type']).toBe('TypeError');
    expect(
      JSON.stringify(spans, (_key, value: unknown) => (typeof value === 'bigint' ? String(value) : value)),
    ).not.toContain('4242');
  });

  it('OBS-02 without a tracer the log lines of a job still carry the trace of the caller', async () => {
    let inside: { traceId: string | undefined; spanId: string | undefined } | undefined;
    const job = defineJob({
      name: 'obs.plain',
      input: empty,
      handler: () => {
        inside = { traceId: requestContext.get()?.traceId, spanId: requestContext.get()?.spanId };
      },
    });
    const queue = await createQueue({ driver: 'sync', jobs: [job] });
    await requestContext.run({ requestId: 'r1', traceId: TRACE, spanId: SPAN }, () => queue.dispatch(job, {}));
    expect(inside).toEqual({ traceId: TRACE, spanId: SPAN });
  });
});

describe('OBS-03 metrics of the queue', () => {
  it('OBS-03 times each delivery by queue, job and outcome', async () => {
    const { metrics } = observed();
    const good = defineJob({ name: 'obs.good', queue: 'reports', input: empty, handler: () => undefined });
    const bad = defineJob({
      name: 'obs.bad',
      input: empty,
      attempts: 1,
      handler: () => {
        throw new Error('no');
      },
    });
    const queue = await createQueue({ driver: 'sync', jobs: [good, bad], metrics });
    await queue.dispatch(good, {});
    await queue.dispatch(bad, {});
    const text = await metrics.render();
    expect(text).toContain('bk_job_duration_seconds_count{queue="reports",job="obs.good",outcome="ok"} 1');
    expect(text).toContain('bk_job_duration_seconds_count{queue="default",job="obs.bad",outcome="failed"} 1');
  });

  it('OBS-03 counts the jobs of each queue by status when the metrics are read', async () => {
    const { metrics } = observed();
    const job = defineJob({ name: 'obs.depth', input: empty, handler: () => undefined });
    const queue = await createQueue({ driver: 'sync', jobs: [job], metrics });
    await queue.dispatch(job, {});
    await queue.dispatch(job, {});
    const text = await metrics.render();
    expect(text).toContain('# TYPE bk_queue_jobs gauge');
    expect(text).toContain('bk_queue_jobs{queue="default",status="done"} 2');
    expect(text).toContain('bk_queue_jobs{queue="critical",status="waiting"} 0');
  });
});

describe('OBS-03 a queue made twice', () => {
  it('OBS-03 reports the one that was made last, and does not fail', async () => {
    const { metrics } = observed();
    const job = defineJob({ name: 'obs.twice', input: empty, handler: () => undefined });
    await createQueue({ driver: 'sync', jobs: [job], metrics });
    const second = await createQueue({ driver: 'sync', jobs: [job], metrics });
    await second.dispatch(job, {});
    expect(await metrics.render()).toContain('bk_queue_jobs{queue="default",status="done"} 1');
  });
});
