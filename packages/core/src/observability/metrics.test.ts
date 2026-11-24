/**
 * BieberKit
 *
 * @file        packages/core/src/observability/metrics.test.ts
 * @description Tests of the metrics registry and its Prometheus text: counters, gauges, histograms, collectors, labels and the limits on them (OBS-03, ADR 0023).
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
import { createMetrics, createNoopMetrics } from './metrics.ts';

describe('OBS-03 metrics text', () => {
  it('OBS-03 a counter is a line with its help and type, and grows by the amount given', async () => {
    const metrics = createMetrics();
    const requests = metrics.counter('bk_requests_total', 'Requests.');
    requests.inc();
    requests.inc(undefined, 2);
    expect(await metrics.render()).toBe(
      '# HELP bk_requests_total Requests.\n# TYPE bk_requests_total counter\nbk_requests_total 3\n',
    );
  });

  it('OBS-03 a counter never goes down, and ignores what is not a number', async () => {
    const metrics = createMetrics();
    const counter = metrics.counter('bk_c_total', 'c');
    counter.inc(undefined, -5);
    counter.inc(undefined, Number.NaN);
    counter.inc();
    expect(await metrics.render()).toContain('bk_c_total 1\n');
  });

  it('OBS-03 labels keep the order that the metric declared, one series for each set of values', async () => {
    const metrics = createMetrics();
    const counter = metrics.counter('bk_hits_total', 'Hits.', { labels: ['route', 'status'] });
    counter.inc({ status: '200', route: '/a' });
    counter.inc({ route: '/a', status: '200' });
    counter.inc({ route: '/a', status: '500' });
    const text = await metrics.render();
    expect(text).toContain('bk_hits_total{route="/a",status="200"} 2\n');
    expect(text).toContain('bk_hits_total{route="/a",status="500"} 1\n');
  });

  it('OBS-03 a label value is escaped, so that it cannot start a line of its own', async () => {
    const metrics = createMetrics();
    metrics.counter('bk_x_total', 'x', { labels: ['route'] }).inc({ route: 'a"b\\c\nd 1' });
    expect(await metrics.render()).toContain('bk_x_total{route="a\\"b\\\\c\\nd 1"} 1\n');
  });

  it('OBS-03 help text is escaped on one line', async () => {
    const metrics = createMetrics();
    metrics.gauge('bk_g', 'one\ntwo \\ three').set(1);
    expect(await metrics.render()).toContain('# HELP bk_g one\\ntwo \\\\ three\n');
  });

  it('OBS-03 a gauge holds the last value, and writes infinity and not a number as Prometheus does', async () => {
    const metrics = createMetrics();
    const gauge = metrics.gauge('bk_g', 'g', { labels: ['k'] });
    gauge.set(5, { k: 'a' });
    gauge.set(7, { k: 'a' });
    gauge.set(Infinity, { k: 'b' });
    gauge.set(Number.NaN, { k: 'c' });
    const text = await metrics.render();
    expect(text).toContain('bk_g{k="a"} 7\n');
    expect(text).toContain('bk_g{k="b"} +Inf\n');
    expect(text).toContain('bk_g{k="c"} NaN\n');
  });

  it('OBS-03 a histogram has cumulative buckets, a +Inf bucket, a sum and a count', async () => {
    const metrics = createMetrics();
    const duration = metrics.histogram('bk_d_seconds', 'Duration.', { buckets: [0.1, 1], labels: ['route'] });
    for (const value of [0.05, 0.5, 5]) duration.observe(value, { route: '/a' });
    expect(await metrics.render()).toBe(
      [
        '# HELP bk_d_seconds Duration.',
        '# TYPE bk_d_seconds histogram',
        'bk_d_seconds_bucket{route="/a",le="0.1"} 1',
        'bk_d_seconds_bucket{route="/a",le="1"} 2',
        'bk_d_seconds_bucket{route="/a",le="+Inf"} 3',
        'bk_d_seconds_sum{route="/a"} 5.55',
        'bk_d_seconds_count{route="/a"} 3',
        '',
      ].join('\n'),
    );
  });

  it('OBS-03 a histogram ignores a value that is not finite', async () => {
    const metrics = createMetrics();
    const histogram = metrics.histogram('bk_h', 'h', { buckets: [1] });
    histogram.observe(Number.NaN);
    histogram.observe(Infinity);
    expect(await metrics.render()).toBe('');
  });

  it('OBS-03 asking for a metric twice gives the same one, so every package may ask', async () => {
    const metrics = createMetrics();
    metrics.counter('bk_n_total', 'n').inc();
    metrics.counter('bk_n_total', 'n').inc();
    expect(await metrics.render()).toContain('bk_n_total 2\n');
  });

  it('OBS-03 a name or a label that Prometheus would refuse, and a metric asked for as another kind, are errors of the code', () => {
    const metrics = createMetrics();
    expect(() => metrics.counter('1bad', 'x')).toThrow(/not a metric name/);
    expect(() => metrics.counter('bk_ok', 'x', { labels: ['bad-label'] })).toThrow(/not a label name/);
    expect(() => metrics.histogram('bk_hh', 'x', { labels: ['le'] })).toThrow(/not a label name/);
    expect(() => metrics.histogram('bk_hh', 'x', { buckets: [1, 1] })).toThrow(/ascending/);
    metrics.counter('bk_k_total', 'x');
    expect(() => metrics.gauge('bk_k_total', 'x')).toThrow(/exists as a counter/);
    expect(() => metrics.counter('bk_k_total', 'x', { labels: ['a'] })).toThrow(/labels/);
    expect(() => metrics.collect('bk_k_total', 'x', {}, () => [])).toThrow(/exists as a counter/);
    metrics.collect('bk_col', 'x', {}, () => []);
    expect(() => metrics.collect('bk_k_total', 'x', {}, () => [])).toThrow(/exists as a counter/);
  });

  it('OBS-03 a metric that has too many series keeps the ones it has and drops the new ones', async () => {
    const metrics = createMetrics();
    const counter = metrics.counter('bk_many_total', 'many', { labels: ['id'] });
    for (let i = 0; i < 1_200; i += 1) counter.inc({ id: String(i) });
    counter.inc({ id: '0' });
    const lines = (await metrics.render()).split('\n').filter((line) => line.startsWith('bk_many_total'));
    expect(lines).toHaveLength(1_000);
    expect(lines).toContain('bk_many_total{id="0"} 2');
  });

  it('OBS-03 a collector is read when the metrics are, sync or async, with its labels', async () => {
    const metrics = createMetrics();
    let depth = 3;
    metrics.collect('bk_queue_jobs', 'Jobs.', { labels: ['queue'] }, () => [
      { labels: { queue: 'default' }, value: depth },
    ]);
    metrics.collect('bk_async', 'Async.', { type: 'counter' }, async () => [{ value: 9 }]);
    expect(await metrics.render()).toContain('bk_queue_jobs{queue="default"} 3\n');
    depth = 4;
    const text = await metrics.render();
    expect(text).toContain('bk_queue_jobs{queue="default"} 4\n');
    expect(text).toContain('# TYPE bk_async counter\nbk_async 9\n');
  });

  it('OBS-03 a collector that is declared again replaces the reader, so the last module made is the one reported', async () => {
    const metrics = createMetrics();
    metrics.collect('bk_depth', 'Depth.', {}, () => [{ value: 1 }]);
    metrics.collect('bk_depth', 'Depth.', {}, () => [{ value: 2 }]);
    const text = await metrics.render();
    expect(text).toContain('bk_depth 2\n');
    expect(text).not.toContain('bk_depth 1\n');
  });

  it('OBS-03 a collector that throws or is too slow is left out, and the others are still served', async () => {
    const metrics = createMetrics();
    metrics.counter('bk_ok_total', 'ok').inc();
    metrics.collect('bk_broken', 'broken', {}, () => {
      throw new Error('down');
    });
    metrics.collect('bk_empty', 'empty', {}, () => []);
    const text = await metrics.render();
    expect(text).toContain('bk_ok_total 1');
    expect(text).not.toContain('bk_broken');
    expect(text).not.toContain('bk_empty');
  });

  it('OBS-03 the no-op registry accepts every call and renders nothing', async () => {
    const metrics = createNoopMetrics();
    metrics.counter('a', 'a').inc();
    metrics.gauge('b', 'b').set(1);
    metrics.histogram('c', 'c').observe(1);
    metrics.collect('d', 'd', {}, () => []);
    expect(await metrics.render()).toBe('');
  });
});
