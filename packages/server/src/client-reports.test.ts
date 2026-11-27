/**
 * BieberKit
 *
 * @file        packages/server/src/client-reports.test.ts
 * @description Tests of the route that takes the errors and the Core Web Vitals of the admin from the browser and hands them to the error reporter and the metrics (UI-21, OBS-06).
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

import { createMemoryReporter, createMetrics } from '@bieberkit/core';
import { createHttpServer } from '@bieberkit/http';
import { describe, expect, it } from 'vitest';
import { registerClientReports, CLIENT_REPORTS_PATH } from './client-reports.ts';

function app() {
  const reporter = createMemoryReporter();
  const metrics = createMetrics();
  const server = createHttpServer({ APP_ENV: 'test', APP_PORT: 0, TRUST_PROXY: false, API_DOCS_PUBLIC: false });
  registerClientReports(server, { reporter, metrics });
  return { server, reporter, metrics };
}

const send = (server: ReturnType<typeof app>['server'], body: unknown) =>
  server.inject({
    method: 'POST',
    url: CLIENT_REPORTS_PATH,
    headers: { 'content-type': 'application/json' },
    payload: JSON.stringify(body),
  });

const ERROR = {
  kind: 'error',
  error: {
    kind: 'TypeError',
    message: 'x is not a function',
    frames: ['index-abc.js:10:5', 'chunk-def.js:2:9'],
    route: '/crm/accounts/:id',
  },
};

describe('UI-21 an error of the browser reaches the error reporter', () => {
  it('UI-21 is handed over as a warning of the source client, with the route and the place, and no body', async () => {
    const { server, reporter } = app();
    const response = await send(server, ERROR);
    expect(response.statusCode).toBe(204);
    expect(reporter.reports).toHaveLength(1);
    const [report] = reporter.reports;
    expect(report?.context).toMatchObject({
      source: 'client',
      level: 'warning',
      http: { method: 'GET', path: '/crm/accounts/:id' },
      tags: { route: '/crm/accounts/:id' },
    });
    const error = report?.error;
    if (!(error instanceof Error)) throw new Error('The reporter did not get an Error.');
    expect([error.name, error.message]).toEqual(['TypeError', 'x is not a function']);
    expect(error.stack).toContain('index-abc.js:10:5');
  });

  it('UI-21 the release of the build is a tag when it is sent', async () => {
    const { server, reporter } = app();
    await send(server, { ...ERROR, error: { ...ERROR.error, release: 'abc123' } });
    expect(reporter.reports[0]?.context.tags).toMatchObject({ release: 'abc123' });
  });

  it('UI-21 refuses what is not a report, and a text longer than a report needs, and hands nothing over', async () => {
    const { server, reporter } = app();
    for (const body of [
      {},
      { kind: 'error' },
      { kind: 'other', error: ERROR.error },
      { kind: 'error', error: { ...ERROR.error, message: 'x'.repeat(2000) } },
      { kind: 'error', error: { ...ERROR.error, frames: Array.from({ length: 50 }, () => 'a.js:1:1') } },
      { kind: 'error', error: ERROR.error, extra: 'field' },
    ]) {
      const response = await send(server, body);
      expect(`${JSON.stringify(body).slice(0, 60)} ${String(response.statusCode)}`).toMatch(/ 400$/);
    }
    expect(reporter.reports).toHaveLength(0);
  });
});

describe('UI-21 a Core Web Vital of the browser reaches the metrics', () => {
  it('UI-21 a timing is counted by name and rating and observed in seconds, and a score is observed as it is', async () => {
    const { server, metrics } = app();
    expect(
      (await send(server, { kind: 'vital', vital: { name: 'LCP', value: 2400, rating: 'good', route: '/' } }))
        .statusCode,
    ).toBe(204);
    expect(
      (
        await send(server, {
          kind: 'vital',
          vital: { name: 'CLS', value: 0.123, rating: 'needs-improvement', route: '/' },
        })
      ).statusCode,
    ).toBe(204);
    const text = await metrics.render();
    expect(text).toContain('bk_admin_web_vitals_total{name="LCP",rating="good"} 1');
    expect(text).toContain('bk_admin_web_vitals_total{name="CLS",rating="needs-improvement"} 1');
    expect(text).toMatch(/bk_admin_web_vital_seconds_sum\{name="LCP"\} 2\.4/);
    expect(text).toMatch(/bk_admin_layout_shift_sum 0\.123/);
  });

  it('UI-21 a name or a rating that is not one of the known ones is refused, so that a client cannot make series', async () => {
    const { server, metrics } = app();
    expect(
      (await send(server, { kind: 'vital', vital: { name: 'X'.repeat(8), value: 1, rating: 'good', route: '/' } }))
        .statusCode,
    ).toBe(400);
    expect(
      (await send(server, { kind: 'vital', vital: { name: 'LCP', value: 1, rating: 'great', route: '/' } })).statusCode,
    ).toBe(400);
    expect(await metrics.render()).not.toContain('bk_admin_web_vitals_total{');
  });
});

describe('UI-21 the route is for the browser of the admin', () => {
  it('UI-21 answers no session the same as a session: a report of the login page is as useful as any other', async () => {
    const { server } = app();
    expect((await send(server, ERROR)).statusCode).toBe(204);
  });
});
