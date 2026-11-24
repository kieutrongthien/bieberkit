/**
 * BieberKit
 *
 * @file        packages/core/src/observability/tracing.ts
 * @description The tracer of the framework: spans with ids and a few attributes, the current span carried through async code, and a port that an exporter implements (OBS-02, ADR 0023).
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

import { AsyncLocalStorage } from 'node:async_hooks';
import { randomBytes } from 'node:crypto';
import { requestContext } from '../logging/request-context.ts';
import type { TraceParent } from './traceparent.ts';

export type AttributeValue = string | number | boolean;
export type SpanAttributes = Readonly<Record<string, AttributeValue | undefined>>;
export type SpanKind = 'internal' | 'server' | 'client' | 'producer' | 'consumer';

export interface SpanOptions {
  readonly kind?: SpanKind;
  /** Ids and counts only. Never a statement, a URL with its query, a header or a body (SEC-09). */
  readonly attributes?: SpanAttributes;
  /**
   * The parent when it comes from another process: the trace of a request header, or of the job that was stored. Without it the parent
   * is the current span, and without that the span starts a trace.
   */
  readonly parent?: { readonly traceId: string; readonly spanId?: string };
}

/** A span that is open. Calls on it after it ended do nothing. */
export interface Span {
  readonly traceId: string;
  readonly spanId: string;
  setAttribute(key: string, value: AttributeValue): void;
  /** Marks the span as failed. Only the class and the code of the error are kept, never its message (SEC-09). */
  fail(error: unknown): void;
}

/** A span that the caller ends: for work that starts in one place and finishes in another, like a request of the server. */
export interface OpenSpan extends Span {
  /** Ends the span and gives it to the exporter. Ending twice does nothing. */
  end(): void;
}

/** A span that has ended, as an exporter receives it. Times are nanoseconds since the Unix epoch. */
export interface FinishedSpan {
  readonly traceId: string;
  readonly spanId: string;
  readonly parentSpanId?: string;
  readonly name: string;
  readonly kind: SpanKind;
  readonly startNs: bigint;
  readonly endNs: bigint;
  readonly attributes: Readonly<Record<string, AttributeValue>>;
  readonly failed: boolean;
}

/** Where finished spans go. `export` never throws and never waits. */
export interface SpanExporter {
  export(span: FinishedSpan): void;
  /** Sends what is held, waiting at most `timeoutMs`, and says whether it all went out. */
  flush(timeoutMs?: number): Promise<boolean>;
}

export interface Tracer {
  /** False for the tracer that records nothing, so that a caller may skip the work of building attributes. */
  readonly enabled: boolean;
  /**
   * Runs `fn` in a new span and ends the span when `fn` settles. A throw or a rejection marks the span as failed and is rethrown as it
   * is. The log lines and error reports of the code inside carry the id of the span.
   */
  span<T>(name: string, options: SpanOptions, fn: (span: Span) => T | Promise<T>): Promise<T>;
  /** Starts a span that stays open until `end`. The parent is chosen as for `span`. It is not current until `within` runs code in it. */
  startSpan(name: string, options: SpanOptions): OpenSpan;
  /** Runs `fn` with `span` as the current span, and the context of the request, if any, naming it. */
  within<T>(span: Span, fn: () => T): T;
  /** The trace of the current span, to store in a job or send in a header. */
  current(): TraceParent | undefined;
  flush(timeoutMs?: number): Promise<boolean>;
}

const NOOP_SPAN: OpenSpan = {
  traceId: '',
  spanId: '',
  setAttribute: () => undefined,
  fail: () => undefined,
  end: () => undefined,
};

/** The tracer of a project that has no endpoint. It records nothing and costs a call. */
export function createNoopTracer(): Tracer {
  return {
    enabled: false,
    span: async (_name, _options, fn) => fn(NOOP_SPAN),
    startSpan: () => NOOP_SPAN,
    within: (_span, fn) => fn(),
    current: () => requestTrace(),
    flush: async () => true,
  };
}

const active = new AsyncLocalStorage<TraceParent>();

/** The trace that the request context knows, which is that of the caller until a span of ours is open. */
function requestTrace(): TraceParent | undefined {
  const context = requestContext.get();
  if (context?.traceId === undefined || context.spanId === undefined) return undefined;
  return { traceId: context.traceId, spanId: context.spanId };
}

export interface TracerOptions {
  readonly exporter: SpanExporter;
  /** Nanoseconds since the Unix epoch. Defaults to the clock, kept exact by the monotonic timer. */
  readonly nowNs?: () => bigint;
}

function clockNs(): () => bigint {
  const wall = BigInt(Date.now()) * 1_000_000n;
  const mono = process.hrtime.bigint();
  return () => wall + (process.hrtime.bigint() - mono);
}

const hex = (bytes: number): string => randomBytes(bytes).toString('hex');

function within<T>(span: Span, fn: () => T): T {
  const trace = { traceId: span.traceId, spanId: span.spanId };
  const call = (): T => active.run(trace, fn);
  // Inside a request the log lines and the reports carry the id of this span, so the context is a copy that names it.
  const context = requestContext.get();
  return context === undefined ? call() : requestContext.run({ ...context, ...trace }, call);
}

/** A tracer that gives every finished span to `exporter`. */
export function createTracer(options: TracerOptions): Tracer {
  const nowNs = options.nowNs ?? clockNs();

  const start = (name: string, spanOptions: SpanOptions): OpenSpan => {
    const parent = spanOptions.parent ?? active.getStore() ?? requestTrace();
    const traceId = parent?.traceId ?? hex(16);
    const spanId = hex(8);
    const attributes: Record<string, AttributeValue> = {};
    for (const [key, value] of Object.entries(spanOptions.attributes ?? {})) {
      if (value !== undefined) attributes[key] = value;
    }
    const startNs = nowNs();
    let failed = false;
    let ended = false;
    const end = (): void => {
      if (ended) return;
      ended = true;
      try {
        options.exporter.export({
          traceId,
          spanId,
          ...(parent?.spanId === undefined ? {} : { parentSpanId: parent.spanId }),
          name,
          kind: spanOptions.kind ?? 'internal',
          startNs,
          endNs: nowNs(),
          attributes,
          failed,
        });
      } catch {
        // An exporter must not throw, and a request is never the victim of one that does.
      }
    };
    return {
      traceId,
      spanId,
      setAttribute(key, value) {
        if (!ended) attributes[key] = value;
      },
      fail(error) {
        if (ended) return;
        failed = true;
        if (error instanceof Error) {
          attributes['exception.type'] = error.name;
          const code: unknown = Reflect.get(error, 'code');
          if (typeof code === 'string') attributes['bk.error.code'] = code;
        }
      },
      end,
    };
  };

  return {
    enabled: true,
    async span(name, spanOptions, fn) {
      const span = start(name, spanOptions);
      try {
        return await within(span, async () => fn(span));
      } catch (error) {
        span.fail(error);
        throw error;
      } finally {
        span.end();
      }
    },
    startSpan: start,
    within,
    current: () => active.getStore() ?? requestTrace(),
    flush: (timeoutMs) => options.exporter.flush(timeoutMs),
  };
}

export interface MemorySpanExporter extends SpanExporter {
  readonly spans: readonly FinishedSpan[];
}

/** Keeps the spans in a list, for tests of the code that traces. */
export function createMemorySpanExporter(): MemorySpanExporter {
  const spans: FinishedSpan[] = [];
  return {
    spans,
    export: (span) => void spans.push(span),
    flush: async () => true,
  };
}
