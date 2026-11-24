/**
 * BieberKit
 *
 * @file        packages/core/src/observability/tracing.test.ts
 * @description Tests of the tracer: parents, the current span in async code, failures that keep no message, and the no-op tracer (OBS-02, SEC-09, ADR 0023).
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
import { requestContext } from '../logging/request-context.ts';
import { createMemorySpanExporter, createNoopTracer, createTracer } from './tracing.ts';
import type { FinishedSpan, SpanExporter } from './tracing.ts';

function make(): { tracer: ReturnType<typeof createTracer>; spans: readonly FinishedSpan[] } {
  const exporter = createMemorySpanExporter();
  let tick = 1_000n;
  const tracer = createTracer({ exporter, nowNs: () => (tick += 10n) });
  return { tracer, spans: exporter.spans };
}

describe('OBS-02 tracer', () => {
  it('OBS-02 a span with no parent starts a trace, with ids of the right size and times in order', async () => {
    const { tracer, spans } = make();
    const answer = await tracer.span(
      'work',
      { kind: 'server', attributes: { 'http.route': '/a', skipped: undefined } },
      () => 42,
    );
    expect(answer).toBe(42);
    const [span] = spans;
    expect(span).toMatchObject({ name: 'work', kind: 'server', failed: false, attributes: { 'http.route': '/a' } });
    expect(span?.traceId).toMatch(/^[0-9a-f]{32}$/);
    expect(span?.spanId).toMatch(/^[0-9a-f]{16}$/);
    expect(span).not.toHaveProperty('parentSpanId');
    expect(span?.attributes).not.toHaveProperty('skipped');
    expect((span?.endNs ?? 0n) > (span?.startNs ?? 1n)).toBe(true);
  });

  it('OBS-02 a span inside a span is its child, in the same trace, also after an await', async () => {
    const { tracer, spans } = make();
    await tracer.span('outer', {}, async () => {
      await new Promise((resolve) => setTimeout(resolve, 1));
      await tracer.span('inner', {}, () => undefined);
    });
    const [inner, outer] = spans;
    expect(inner?.parentSpanId).toBe(outer?.spanId);
    expect(inner?.traceId).toBe(outer?.traceId);
  });

  it('OBS-02 two spans that run at once are not each other parents', async () => {
    const { tracer, spans } = make();
    await tracer.span('root', {}, () =>
      Promise.all([
        tracer.span('a', {}, () => new Promise((resolve) => setTimeout(resolve, 2))),
        tracer.span('b', {}, () => new Promise((resolve) => setTimeout(resolve, 1))),
      ]),
    );
    const root = spans.find((span) => span.name === 'root');
    for (const name of ['a', 'b']) expect(spans.find((span) => span.name === name)?.parentSpanId).toBe(root?.spanId);
  });

  it('OBS-02 a parent from another process is the parent, and one with no span gives a trace only', async () => {
    const { tracer, spans } = make();
    await tracer.span('from header', { parent: { traceId: 'a'.repeat(32), spanId: 'b'.repeat(16) } }, () => undefined);
    await tracer.span('trace only', { parent: { traceId: 'c'.repeat(32) } }, () => undefined);
    expect(spans[0]).toMatchObject({ traceId: 'a'.repeat(32), parentSpanId: 'b'.repeat(16) });
    expect(spans[1]).toMatchObject({ traceId: 'c'.repeat(32) });
    expect(spans[1]).not.toHaveProperty('parentSpanId');
  });

  it('OBS-02 the log lines inside a span carry its id, and the context outside is unchanged', async () => {
    const { tracer } = make();
    let inside: { spanId: string | undefined; span: string; userId: string | undefined } | undefined;
    await requestContext.run(
      { requestId: 'r1', traceId: 't'.repeat(32), spanId: 's'.repeat(16), userId: 'u1' },
      async () => {
        await tracer.span('work', {}, (span) => {
          const context = requestContext.get();
          inside = { spanId: context?.spanId, span: span.spanId, userId: context?.userId };
        });
        expect(requestContext.get()?.spanId).toBe('s'.repeat(16));
      },
    );
    expect(inside?.userId).toBe('u1');
    expect(inside?.spanId).toBe(inside?.span);
    expect(inside?.span).not.toBe('s'.repeat(16));
  });

  it('OBS-02 a throw marks the span as failed with its class and code and no message, and is rethrown as it was', async () => {
    const { tracer, spans } = make();
    const error = Object.assign(new TypeError('secret value 12345'), { code: 'E_BOOM' });
    await expect(
      tracer.span('bad', {}, () => {
        throw error;
      }),
    ).rejects.toBe(error);
    await expect(tracer.span('bad async', {}, () => Promise.reject(error))).rejects.toBe(error);
    for (const span of spans) {
      expect(span).toMatchObject({
        failed: true,
        attributes: { 'exception.type': 'TypeError', 'bk.error.code': 'E_BOOM' },
      });
      expect(
        JSON.stringify(span, (_key, value: unknown) => (typeof value === 'bigint' ? String(value) : value)),
      ).not.toContain('12345');
    }
  });

  it('OBS-02 attributes set after the span ended are ignored, and an exporter that throws never breaks the code', async () => {
    const { tracer, spans } = make();
    let kept: { setAttribute(key: string, value: string): void } | undefined;
    await tracer.span('x', {}, (span) => {
      kept = span;
      span.setAttribute('a', 'one');
    });
    kept?.setAttribute('late', 'two');
    expect(spans[0]?.attributes).toEqual({ a: 'one' });
    const throwing: SpanExporter = {
      export: () => {
        throw new Error('exporter down');
      },
      flush: async () => false,
    };
    await expect(createTracer({ exporter: throwing }).span('x', {}, () => 'fine')).resolves.toBe('fine');
  });

  it('OBS-02 current is the span that runs, then the trace of the request, then nothing', async () => {
    const { tracer } = make();
    expect(tracer.current()).toBeUndefined();
    requestContext.run({ requestId: 'r', traceId: 'a'.repeat(32), spanId: 'b'.repeat(16) }, () => {
      expect(tracer.current()).toEqual({ traceId: 'a'.repeat(32), spanId: 'b'.repeat(16) });
    });
    await tracer.span('x', {}, (span) => {
      expect(tracer.current()).toEqual({ traceId: span.traceId, spanId: span.spanId });
    });
  });

  it('OBS-02 a span started by hand ends when it is told to, and is the parent of what runs within it', async () => {
    const { tracer, spans } = make();
    const open = tracer.startSpan('request', { kind: 'server' });
    expect(spans).toHaveLength(0);
    await tracer.within(open, () => tracer.span('child', {}, () => undefined));
    open.setAttribute('http.status_code', 200);
    open.end();
    open.end();
    expect(spans.map((span) => span.name)).toEqual(['child', 'request']);
    expect(spans[0]?.parentSpanId).toBe(open.spanId);
    expect(spans[1]?.attributes).toEqual({ 'http.status_code': 200 });
  });

  it('OBS-02 a span started by hand has no effect on the current span until code runs within it', async () => {
    const { tracer } = make();
    const open = tracer.startSpan('request', {});
    expect(tracer.current()).toBeUndefined();
    tracer.within(open, () => expect(tracer.current()).toEqual({ traceId: open.traceId, spanId: open.spanId }));
    open.end();
  });

  it('OBS-02 a span that is recorded after the work ran is drawn with the time it took, as a child of the current span', async () => {
    const exporter = createMemorySpanExporter();
    const tracer = createTracer({ exporter, nowNs: () => 5_000_000_000n });
    await tracer.span('request', {}, () => {
      tracer.record('db select', { kind: 'client', durationMs: 2.5, attributes: { 'db.operation': 'select' } });
      tracer.record('db insert', { durationMs: 1, failed: true });
    });
    const [select, insert, request] = exporter.spans;
    expect(select).toMatchObject({ name: 'db select', kind: 'client', parentSpanId: request?.spanId, failed: false });
    expect(select?.endNs).toBe(5_000_000_000n);
    expect(select?.startNs).toBe(5_000_000_000n - 2_500_000n);
    expect(insert).toMatchObject({ failed: true });
    createNoopTracer().record('x', { durationMs: 1 });
  });

  it('OBS-02 the no-op tracer runs the code and records nothing', async () => {
    const tracer = createNoopTracer();
    expect(tracer.enabled).toBe(false);
    await expect(tracer.span('x', {}, (span) => span.setAttribute('a', 'b'))).resolves.toBeUndefined();
    await expect(tracer.span('x', {}, () => 7)).resolves.toBe(7);
    expect(tracer.within(tracer.startSpan('x', {}), () => 5)).toBe(5);
    await expect(tracer.flush()).resolves.toBe(true);
  });

  it('OBS-02 the default clock gives times that increase and are near now', async () => {
    const exporter = createMemorySpanExporter();
    const tracer = createTracer({ exporter });
    const before = BigInt(Date.now()) * 1_000_000n;
    await tracer.span('x', {}, () => undefined);
    const span = exporter.spans[0];
    expect(span !== undefined && span.startNs >= before - 1_000_000_000n && span.endNs >= span.startNs).toBe(true);
  });
});
