/**
 * BieberKit
 *
 * @file        packages/core/src/observability/traceparent.ts
 * @description Reads and writes the W3C traceparent header that carries a trace between processes (OBS-02).
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

const TRACEPARENT = /^([0-9a-f]{2})-([0-9a-f]{32})-([0-9a-f]{16})-([0-9a-f]{2})(?:-.*)?$/;
const ZEROS = /^0+$/;

/** The caller's trace: the id of the trace and the span that made the call. */
export interface TraceParent {
  readonly traceId: string;
  readonly spanId: string;
}

const first = (value: string | readonly string[] | undefined): string | undefined =>
  typeof value === 'string' || value === undefined ? value : value[0];

/** The trace of a valid `traceparent` (W3C Trace Context level 1), and `undefined` for anything else, so a bad header starts a new trace. */
export function parseTraceparent(header: string | readonly string[] | undefined): TraceParent | undefined {
  const match = TRACEPARENT.exec(first(header) ?? '');
  const [, version, traceId, spanId] = match ?? [];
  if (version === undefined || version === 'ff' || traceId === undefined || spanId === undefined) return undefined;
  if (ZEROS.test(traceId) || ZEROS.test(spanId)) return undefined;
  return { traceId, spanId };
}

/** The header to send to the next process. The trace is always sampled: a process that traces decides, and the exporter is bounded. */
export function formatTraceparent(trace: TraceParent): string {
  return `00-${trace.traceId}-${trace.spanId}-01`;
}
