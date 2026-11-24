/**
 * BieberKit
 *
 * @file        packages/core/src/observability/process-metrics.ts
 * @description The metrics of the process itself: the lag of the event loop, the heap and the uptime (OBS-03).
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

import { monitorEventLoopDelay } from 'node:perf_hooks';
import type { Metrics } from './metrics.ts';

/** The histogram is in nanoseconds, and it holds NaN until the first sample. */
const seconds = (nanoseconds: number): number => (Number.isFinite(nanoseconds) ? nanoseconds / 1e9 : 0);

/**
 * Registers the process metrics and starts measuring the event loop. It answers a function that stops the measure, so that a test or a
 * shutdown leaves no timer.
 */
export function registerProcessMetrics(metrics: Metrics): () => void {
  const delay = monitorEventLoopDelay({ resolution: 20 });
  delay.enable();
  metrics.collect('bk_event_loop_lag_seconds', 'Delay of the event loop, by statistic.', { labels: ['stat'] }, () => {
    const samples = [
      { labels: { stat: 'mean' }, value: seconds(delay.mean) },
      { labels: { stat: 'p99' }, value: seconds(delay.percentile(99)) },
      { labels: { stat: 'max' }, value: seconds(delay.max) },
    ];
    delay.reset();
    return samples;
  });
  metrics.collect('bk_heap_used_bytes', 'Bytes of the V8 heap that are in use.', {}, () => [
    { value: process.memoryUsage().heapUsed },
  ]);
  metrics.collect('bk_heap_total_bytes', 'Bytes of the V8 heap that are reserved.', {}, () => [
    { value: process.memoryUsage().heapTotal },
  ]);
  metrics.collect('bk_process_resident_bytes', 'Resident set size of the process.', {}, () => [
    { value: process.memoryUsage().rss },
  ]);
  metrics.collect('bk_process_uptime_seconds', 'Seconds since the process started.', {}, () => [
    { value: process.uptime() },
  ]);
  return () => delay.disable();
}
