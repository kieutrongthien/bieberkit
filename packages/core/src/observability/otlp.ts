/**
 * BieberKit
 *
 * @file        packages/core/src/observability/otlp.ts
 * @description Sends finished spans to an OpenTelemetry endpoint as OTLP over HTTP in JSON: batched, bounded, and never blocking or throwing the code that traces (OBS-02, ADR 0023).
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

import type { Logger } from '../logging/logger.ts';
import { createNoopTracer, createTracer } from './tracing.ts';
import type { AttributeValue, FinishedSpan, SpanExporter, SpanKind, Tracer } from './tracing.ts';

export interface OtlpExporterOptions {
  /** The endpoint of the collector. `/v1/traces` is added unless the URL ends with it. */
  readonly endpoint: string;
  /** What produced the spans: `service.name`, `service.version`, `deployment.environment` and `bk.role`. */
  readonly resource: Readonly<Record<string, string>>;
  readonly logger?: Logger;
  /** Spans in a request to the collector. Defaults to 512. */
  readonly batchSize?: number;
  /** Spans held while the collector is slow or down; past it the oldest are dropped and counted. Defaults to 2048. */
  readonly maxQueue?: number;
  /** Milliseconds between sends of a batch that is not full. Defaults to 5000. */
  readonly intervalMs?: number;
  /** How long one request may take. Defaults to 5 seconds. */
  readonly timeoutMs?: number;
  /** For tests. Defaults to the global `fetch`. */
  readonly fetch?: typeof fetch;
}

const KINDS: Readonly<Record<SpanKind, number>> = { internal: 1, server: 2, client: 3, producer: 4, consumer: 5 };
const WARN_EVERY_MS = 60_000;

interface OtlpValue {
  stringValue?: string;
  intValue?: string;
  doubleValue?: number;
  boolValue?: boolean;
}

function otlpValue(value: AttributeValue): OtlpValue {
  if (typeof value === 'string') return { stringValue: value };
  if (typeof value === 'boolean') return { boolValue: value };
  return Number.isInteger(value) ? { intValue: String(value) } : { doubleValue: value };
}

const otlpAttributes = (attributes: Readonly<Record<string, AttributeValue>>): { key: string; value: OtlpValue }[] =>
  Object.entries(attributes).map(([key, value]) => ({ key, value: otlpValue(value) }));

/** The body of one request: the shape of `ExportTraceServiceRequest` in JSON, with ids in hex and times as strings (OTLP/JSON). */
export function otlpTraceBody(spans: readonly FinishedSpan[], resource: Readonly<Record<string, string>>): unknown {
  return {
    resourceSpans: [
      {
        resource: { attributes: otlpAttributes(resource) },
        scopeSpans: [
          {
            scope: { name: '@bieberkit/core' },
            spans: spans.map((span) => ({
              traceId: span.traceId,
              spanId: span.spanId,
              ...(span.parentSpanId === undefined ? {} : { parentSpanId: span.parentSpanId }),
              name: span.name,
              kind: KINDS[span.kind],
              startTimeUnixNano: String(span.startNs),
              endTimeUnixNano: String(span.endNs),
              attributes: otlpAttributes(span.attributes),
              status: { code: span.failed ? 2 : 0 },
            })),
          },
        ],
      },
    ],
  };
}

const tracesUrl = (endpoint: string): string => {
  const url = new URL(endpoint);
  if (!url.pathname.endsWith('/v1/traces')) url.pathname = `${url.pathname.replace(/\/$/, '')}/v1/traces`;
  return url.toString();
};

/** An exporter to an OTLP/HTTP collector. It keeps a bounded queue and sends in the background. */
export function createOtlpExporter(options: OtlpExporterOptions): SpanExporter & { readonly dropped: () => number } {
  const send = options.fetch ?? fetch;
  const url = tracesUrl(options.endpoint);
  const batchSize = options.batchSize ?? 512;
  const maxQueue = options.maxQueue ?? 2048;
  const timeoutMs = options.timeoutMs ?? 5_000;
  const queue: FinishedSpan[] = [];
  const inFlight = new Set<Promise<void>>();
  let dropped = 0;
  let lastWarning = 0;

  const warn = (reason: string): void => {
    const at = Date.now();
    if (at - lastWarning < WARN_EVERY_MS) return;
    lastWarning = at;
    options.logger?.warn('traces were not sent', { reason, dropped });
  };

  const post = async (spans: FinishedSpan[]): Promise<boolean> => {
    try {
      const response = await send(url, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(otlpTraceBody(spans, options.resource)),
        signal: AbortSignal.timeout(timeoutMs),
      });
      // The body is read so that the connection is reused, and never kept.
      await response.arrayBuffer().catch(() => undefined);
      if (response.ok) return true;
      warn(`the collector answered ${response.status}`);
    } catch (error) {
      warn(error instanceof Error ? error.name : 'the collector could not be reached');
    }
    return false;
  };

  const drain = (): Promise<boolean> => {
    const batch = queue.splice(0, batchSize);
    if (batch.length === 0) return Promise.resolve(true);
    const sending = post(batch).then((ok) => {
      if (!ok) dropped += batch.length;
      return ok;
    });
    const tracked = sending.then(() => undefined);
    inFlight.add(tracked);
    void tracked.finally(() => inFlight.delete(tracked));
    return sending;
  };

  const timer = setInterval(() => void drain(), options.intervalMs ?? 5_000);
  timer.unref();

  return {
    dropped: () => dropped,
    export(span) {
      queue.push(span);
      if (queue.length > maxQueue) {
        dropped += queue.length - maxQueue;
        queue.splice(0, queue.length - maxQueue);
      }
      if (queue.length >= batchSize) void drain();
    },
    async flush(flushTimeoutMs = 2_000) {
      let timeout: ReturnType<typeof setTimeout> | undefined;
      const limit = new Promise<false>((resolve) => {
        timeout = setTimeout(() => resolve(false), flushTimeoutMs);
      });
      const all = (async (): Promise<boolean> => {
        let ok = true;
        while (queue.length > 0) ok = (await drain()) && ok;
        await Promise.allSettled(inFlight);
        return ok;
      })();
      try {
        return await Promise.race([all, limit]);
      } finally {
        clearTimeout(timeout);
      }
    },
  };
}

/** The part of the validated config (`CoreEnv`) that decides the tracer. */
export interface TracingConfig {
  readonly APP_ENV: string;
  readonly OTEL_EXPORTER_OTLP_ENDPOINT: string | undefined;
}

export interface TracerFromConfigOptions {
  readonly logger: Logger;
  /** The process role: web, worker, scheduler or migrate. */
  readonly role: string;
  readonly serviceName?: string;
  /** The version that is running, for example the git sha. */
  readonly release?: string;
  readonly fetch?: typeof fetch;
}

/** A tracer that exports to `OTEL_EXPORTER_OTLP_ENDPOINT`, and one that records nothing when it is empty (OBS-02). */
export function createTracerFromConfig(config: TracingConfig, options: TracerFromConfigOptions): Tracer {
  if (config.OTEL_EXPORTER_OTLP_ENDPOINT === undefined) return createNoopTracer();
  return createTracer({
    exporter: createOtlpExporter({
      endpoint: config.OTEL_EXPORTER_OTLP_ENDPOINT,
      resource: {
        'service.name': options.serviceName ?? 'bieberkit',
        'deployment.environment': config.APP_ENV,
        'bk.role': options.role,
        ...(options.release === undefined ? {} : { 'service.version': options.release }),
      },
      logger: options.logger,
      ...(options.fetch === undefined ? {} : { fetch: options.fetch }),
    }),
  });
}
