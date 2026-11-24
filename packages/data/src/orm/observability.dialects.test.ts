/**
 * BieberKit
 *
 * @file        packages/data/src/orm/observability.dialects.test.ts
 * @description Tests of what the database reports: a span for each query that says its kind and never its text, and the connections of the pool (OBS-02, OBS-03, SEC-09, ADR 0023).
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

import { createMemorySpanExporter, createMetrics, createTracer, requestContext } from '@bieberkit/core';
import { expect, it } from 'vitest';
import { describeDialects } from '../testing/dialects.ts';
import { runInUnitOfWork } from './connect.ts';
import { emitEvent } from './outbox.ts';

const TRACE = '0af7651916cd43dd8448eb211c80319c';
const SPAN = 'b7ad6b7169203331';

describeDialects('OBS-02 the queries of the database', ({ openFramework }) => {
  it('OBS-02 each query is a client span in the trace of the request, with its kind and the system', async () => {
    const exporter = createMemorySpanExporter();
    const tracer = createTracer({ exporter });
    const db = await openFramework([], { tracer });
    await requestContext.run({ requestId: 'r1', traceId: TRACE, spanId: SPAN }, () =>
      runInUnitOfWork(db, async (em) => {
        emitEvent(em, { name: 'obs.event', payload: { secret: 'card-4242' } });
        await em.flush();
      }),
    );
    const queries = exporter.spans.filter(
      (span) => span.attributes['db.operation'] === 'insert' && span.parentSpanId === SPAN,
    );
    expect(queries.length).toBeGreaterThan(0);
    for (const span of queries) {
      expect(span).toMatchObject({ kind: 'client', traceId: TRACE, parentSpanId: SPAN, failed: false });
      expect(span.attributes['db.system']).toBe(db.dialect);
      expect(span.name).toBe('db insert');
    }
  });

  it('OBS-02 a span never holds the text of the statement or a value of it', async () => {
    const exporter = createMemorySpanExporter();
    const db = await openFramework([], { tracer: createTracer({ exporter }) });
    await runInUnitOfWork(db, async (em) => {
      emitEvent(em, { name: 'obs.event', payload: { secret: 'card-4242' } });
      await em.flush();
    });
    const text = JSON.stringify(exporter.spans, (_key, value: unknown) =>
      typeof value === 'bigint' ? String(value) : value,
    );
    for (const leak of ['card-4242', 'bk_outbox', 'values', 'from ']) expect(text).not.toContain(leak);
    for (const span of exporter.spans)
      expect([
        'select',
        'insert',
        'update',
        'delete',
        'begin',
        'commit',
        'rollback',
        'savepoint',
        'release',
        'with',
        'other',
      ]).toContain(span.attributes['db.operation']);
  });

  it('OBS-02 without a tracer no query is logged by the ORM', async () => {
    const db = await openFramework();
    await runInUnitOfWork(db, async (em) => {
      emitEvent(em, { name: 'obs.event', payload: {} });
      await em.flush();
    });
    expect(db.orm.config.get('debug')).toBeFalsy();
  });
});

describeDialects('OBS-03 the pool of the database', ({ dialect, openFramework }) => {
  it('OBS-03 reports the connections in use, idle and waiting on a server database, and nothing on SQLite', async () => {
    const metrics = createMetrics();
    const db = await openFramework([], { metrics });
    await runInUnitOfWork(db, async (em) => {
      emitEvent(em, { name: 'obs.event', payload: {} });
      await em.flush();
    });
    const states = (await metrics.render())
      .split('\n')
      .filter((line) => line.startsWith('bk_db_pool_connections{'))
      .map((line) => /state="(\w+)"/.exec(line)?.[1]);
    expect(states).toEqual(dialect === 'sqlite' ? [] : ['in_use', 'idle', 'waiting']);
  });
});
