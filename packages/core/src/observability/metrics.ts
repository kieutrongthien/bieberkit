/**
 * BieberKit
 *
 * @file        packages/core/src/observability/metrics.ts
 * @description The metrics registry: counters, gauges, histograms and collectors, rendered in the Prometheus text format (OBS-03, ADR 0023).
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

import { ConfigError } from '../errors/errors.ts';

export type MetricLabels = Readonly<Record<string, string>>;

export interface Counter {
  /** Adds `by` (1 by default, never negative) to the series of `labels`. */
  inc(labels?: MetricLabels, by?: number): void;
}

export interface Gauge {
  set(value: number, labels?: MetricLabels): void;
}

export interface Histogram {
  observe(value: number, labels?: MetricLabels): void;
}

export interface MetricOptions {
  /** The names of the labels. A value is given for each of them on every call. */
  readonly labels?: readonly string[];
}

export interface HistogramOptions extends MetricOptions {
  /** Upper bounds, ascending, without `+Inf`. Defaults to 5 ms to 10 s. */
  readonly buckets?: readonly number[];
}

/** A value read when the metrics are scraped. */
export interface MetricSample {
  readonly value: number;
  readonly labels?: MetricLabels;
}

export interface CollectorOptions extends MetricOptions {
  /** `counter` for a value that only grows. Defaults to `gauge`. */
  readonly type?: 'gauge' | 'counter';
}

export interface Metrics {
  /** The counter named `name`. Asking again for the same name gives the same counter, so every package may ask. */
  counter(name: string, help: string, options?: MetricOptions): Counter;
  gauge(name: string, help: string, options?: MetricOptions): Gauge;
  histogram(name: string, help: string, options?: HistogramOptions): Histogram;
  /**
   * A metric whose samples are read at scrape time, for a value that another module owns (the depth of a queue, a pool). Asking again for
   * the same name replaces the reader, so a module that is made twice in one process reports the one that was made last.
   */
  collect(
    name: string,
    help: string,
    options: CollectorOptions,
    read: () => readonly MetricSample[] | Promise<readonly MetricSample[]>,
  ): void;
  /** The Prometheus text format (version 0.0.4). A collector that throws or takes over 2 seconds is left out. */
  render(): Promise<string>;
}

const NAME = /^[a-zA-Z_:][a-zA-Z0-9_:]*$/;
const LABEL = /^[a-zA-Z_][a-zA-Z0-9_]*$/;
const MAX_SERIES = 1_000;
const COLLECT_TIMEOUT_MS = 2_000;
export const DEFAULT_BUCKETS: readonly number[] = [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10];

function invalid(message: string): ConfigError {
  return new ConfigError(message, {
    code: 'OBS_METRIC_INVALID',
    fix: 'Use letters, digits and underscores in names, and give each label a value at every call.',
  });
}

const escapeHelp = (text: string): string => text.replaceAll('\\', '\\\\').replaceAll('\n', '\\n');
const escapeValue = (text: string): string =>
  text.replaceAll('\\', '\\\\').replaceAll('"', '\\"').replaceAll('\n', '\\n');

function formatNumber(value: number): string {
  if (Number.isNaN(value)) return 'NaN';
  if (value === Infinity) return '+Inf';
  if (value === -Infinity) return '-Inf';
  return String(value);
}

/** `{a="1",b="2"}` in the order that the metric declared its labels, with `extra` (the `le` of a bucket) last. */
function labelText(names: readonly string[], values: MetricLabels | undefined, extra?: string): string {
  const parts = names.map((label) => `${label}="${escapeValue(values?.[label] ?? '')}"`);
  if (extra !== undefined) parts.push(extra);
  return parts.length === 0 ? '' : `{${parts.join(',')}}`;
}

function withTimeout<T>(work: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const limit = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => reject(new Error('A collector took too long.')), ms);
  });
  return Promise.race([work, limit]).finally(() => clearTimeout(timer));
}

type Kind = 'counter' | 'gauge' | 'histogram';

/** What a second request for the same name gets back. A collector has no handle. */
type Handle =
  | { readonly is: 'counter'; readonly counter: Counter }
  | { readonly is: 'gauge'; readonly gauge: Gauge }
  | { readonly is: 'histogram'; readonly histogram: Histogram }
  | { readonly is: 'collector' };

interface Family {
  readonly kind: Kind;
  readonly help: string;
  readonly labels: readonly string[];
  readonly handle: Handle;
  lines(): Promise<string[]> | string[];
}

interface Series<T> {
  readonly values: MetricLabels | undefined;
  readonly state: T;
}

/** The series of `values`, made when it is new, and `undefined` once a metric has too many (the labels are not bounded). */
const seriesOf = <T>(
  all: Map<string, Series<T>>,
  labels: readonly string[],
  values: MetricLabels | undefined,
  make: () => T,
) => {
  const id = labelText(labels, values);
  let found = all.get(id);
  if (found === undefined) {
    if (all.size >= MAX_SERIES) return undefined;
    found = { values, state: make() };
    all.set(id, found);
  }
  return found;
};

/** A registry that keeps its series in memory. A project has one, and gives it to every package that measures. */
export function createMetrics(): Metrics {
  const families = new Map<string, Family>();

  /** The family that already has this name, when it is the same metric. A different one is a mistake of the code. */
  const known = (name: string, kind: Kind, labels: readonly string[]): Family | undefined => {
    if (!NAME.test(name)) throw invalid(`"${name}" is not a metric name.`);
    for (const label of labels) {
      if (!LABEL.test(label) || label === 'le' || label.startsWith('__'))
        throw invalid(`"${label}" is not a label name.`);
    }
    const found = families.get(name);
    if (found === undefined) return undefined;
    if (found.kind !== kind || found.labels.join(',') !== labels.join(','))
      throw invalid(`"${name}" exists as a ${found.kind} with the labels ${found.labels.join(', ') || 'none'}.`);
    return found;
  };

  return {
    counter(name, help, options = {}) {
      const labels = options.labels ?? [];
      const existing = known(name, 'counter', labels)?.handle;
      if (existing?.is === 'counter') return existing.counter;
      const all = new Map<string, Series<{ value: number }>>();
      const handle: Counter = {
        inc(values, by = 1) {
          if (!(by >= 0)) return;
          const series = seriesOf(all, labels, values, () => ({ value: 0 }));
          if (series !== undefined) series.state.value += by;
        },
      };
      families.set(name, {
        kind: 'counter',
        help,
        labels,
        handle: { is: 'counter', counter: handle },
        lines: () => [...all].map(([id, { state }]) => `${name}${id} ${formatNumber(state.value)}`),
      });
      return handle;
    },
    gauge(name, help, options = {}) {
      const labels = options.labels ?? [];
      const existing = known(name, 'gauge', labels)?.handle;
      if (existing?.is === 'gauge') return existing.gauge;
      const all = new Map<string, Series<{ value: number }>>();
      const handle: Gauge = {
        set(value, values) {
          const series = seriesOf(all, labels, values, () => ({ value: 0 }));
          if (series !== undefined) series.state.value = value;
        },
      };
      families.set(name, {
        kind: 'gauge',
        help,
        labels,
        handle: { is: 'gauge', gauge: handle },
        lines: () => [...all].map(([id, { state }]) => `${name}${id} ${formatNumber(state.value)}`),
      });
      return handle;
    },
    histogram(name, help, options = {}) {
      const labels = options.labels ?? [];
      const buckets = [...(options.buckets ?? DEFAULT_BUCKETS)];
      if (buckets.some((bound, i) => !Number.isFinite(bound) || (i > 0 && bound <= (buckets[i - 1] ?? 0))))
        throw invalid(`The buckets of "${name}" must be finite and ascending.`);
      const existing = known(name, 'histogram', labels)?.handle;
      if (existing?.is === 'histogram') return existing.histogram;
      interface State {
        counts: number[];
        sum: number;
        count: number;
      }
      const all = new Map<string, Series<State>>();
      const handle: Histogram = {
        observe(value, values) {
          if (!Number.isFinite(value)) return;
          const series = seriesOf(all, labels, values, () => ({ counts: buckets.map(() => 0), sum: 0, count: 0 }));
          if (series === undefined) return;
          series.state.sum += value;
          series.state.count += 1;
          buckets.forEach((bound, i) => {
            if (value <= bound) series.state.counts[i] = (series.state.counts[i] ?? 0) + 1;
          });
        },
      };
      families.set(name, {
        kind: 'histogram',
        help,
        labels,
        handle: { is: 'histogram', histogram: handle },
        lines: () =>
          [...all].flatMap(([id, { values, state }]) => [
            ...buckets.map(
              (bound, i) =>
                `${name}_bucket${labelText(labels, values, `le="${formatNumber(bound)}"`)} ${state.counts[i] ?? 0}`,
            ),
            `${name}_bucket${labelText(labels, values, 'le="+Inf"')} ${state.count}`,
            `${name}_sum${id} ${formatNumber(state.sum)}`,
            `${name}_count${id} ${state.count}`,
          ]),
      });
      return handle;
    },
    collect(name, help, options, read) {
      const labels = options.labels ?? [];
      const kind = options.type ?? 'gauge';
      const existing = known(name, kind, labels);
      if (existing !== undefined && existing.handle.is !== 'collector')
        throw invalid(`"${name}" has a counter, a gauge or a histogram already.`);
      families.set(name, {
        kind,
        help,
        labels,
        handle: { is: 'collector' },
        lines: async () => {
          const samples = await withTimeout(Promise.resolve().then(read), COLLECT_TIMEOUT_MS);
          return samples.map((sample) => `${name}${labelText(labels, sample.labels)} ${formatNumber(sample.value)}`);
        },
      });
    },
    async render() {
      const out: string[] = [];
      for (const [name, family] of families) {
        let lines: string[];
        try {
          lines = await family.lines();
        } catch {
          // A collector that fails is left out of this scrape. The others, and the next scrape, are not affected.
          continue;
        }
        if (lines.length === 0) continue;
        out.push(`# HELP ${name} ${escapeHelp(family.help)}`, `# TYPE ${name} ${family.kind}`, ...lines);
      }
      return out.length === 0 ? '' : `${out.join('\n')}\n`;
    },
  };
}

const NOOP_HANDLE = { inc: () => undefined, set: () => undefined, observe: () => undefined };

/** A registry that keeps nothing, for code that measures and a test that does not look. */
export function createNoopMetrics(): Metrics {
  return {
    counter: () => NOOP_HANDLE,
    gauge: () => NOOP_HANDLE,
    histogram: () => NOOP_HANDLE,
    collect: () => undefined,
    render: async () => '',
  };
}
