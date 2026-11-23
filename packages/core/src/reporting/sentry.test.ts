/**
 * BieberKit
 *
 * @file        packages/core/src/reporting/sentry.test.ts
 * @description Tests of the Sentry compatible reporter: the DSN, the event and the envelope, what is left out, sampling, the budget, a server that is slow or down, and flush (OBS-06).
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
import { BkError } from '../errors/errors.ts';
import { createLogger } from '../logging/logger.ts';
import { createSentryReporter, framesOf, parseDsn } from './sentry.ts';
import type { SentryReporterOptions } from './sentry.ts';

const DSN = 'https://abc123@errors.example.com/42';

interface Sent {
  readonly url: string;
  readonly headers: Record<string, string>;
  readonly lines: string[];
}

interface EventShape {
  level: string;
  tags: Record<string, string>;
  exception: { values: { type: string; value: string }[] };
  [key: string]: unknown;
}

function harness(
  options: Partial<SentryReporterOptions> = {},
  answer: () => Response | Promise<Response> = () => new Response('{}'),
) {
  const sent: Sent[] = [];
  const warnings: string[] = [];
  let clock = 1_700_000_000_000;
  const reporter = createSentryReporter({
    dsn: DSN,
    now: () => clock,
    logger: createLogger({ level: 'warn', role: 'web', write: (line) => void warnings.push(line) }),
    fetch: async (input, init) => {
      sent.push({
        url: input instanceof Request ? input.url : input.toString(),
        headers: Object.fromEntries(new Headers(init?.headers).entries()),
        lines: (typeof init?.body === 'string' ? init.body : '').split('\n'),
      });
      return answer();
    },
    ...options,
  });
  return { reporter, sent, warnings, tick: (ms: number) => (clock += ms) };
}

const eventOf = (sent: Sent | undefined): EventShape => JSON.parse(sent?.lines[2] ?? '{}');

describe('OBS-06 the DSN', () => {
  it('OBS-06 turns a DSN into the key and the envelope endpoint', () => {
    expect(parseDsn(DSN)).toEqual({ publicKey: 'abc123', endpoint: 'https://errors.example.com/api/42/envelope/' });
    expect(parseDsn('http://k@localhost:9000/sentry/7')).toEqual({
      publicKey: 'k',
      endpoint: 'http://localhost:9000/sentry/api/7/envelope/',
    });
    expect(parseDsn('https://k:oldsecret@host/3').endpoint).toBe('https://host/api/3/envelope/');
  });

  it('OBS-06 refuses a DSN that is not one, without printing it', () => {
    for (const dsn of [
      '',
      'not a url',
      'ftp://k@host/1',
      'https://host/1',
      'https://k@host/',
      'https://k@host/abc-def',
    ]) {
      expect(() => parseDsn(dsn)).toThrow(/not valid/);
    }
    let caught: unknown;
    try {
      parseDsn('https://secretkey@host/');
    } catch (error) {
      caught = error;
    }
    expect(String(caught)).not.toContain('secretkey');
    expect(caught).toMatchObject({ code: 'CFG_ERROR_REPORTER_DSN_INVALID' });
  });
});

describe('OBS-06 frames', () => {
  it('OBS-06 reads the frames of a V8 stack, oldest first, and marks what is not ours', () => {
    const stack = [
      'Error: x',
      '    at handler (/app/src/route.ts:10:5)',
      '    at async run (file:///app/src/run.ts:3:9)',
      '    at /app/node_modules/fastify/lib/x.js:1:2',
      '    at node:internal/process/task_queues:105:5',
      '    not a frame',
    ].join('\n');
    const frames = framesOf(stack);
    expect(frames.map((frame) => frame.filename)).toEqual([
      'node:internal/process/task_queues',
      '/app/node_modules/fastify/lib/x.js',
      '/app/src/run.ts',
      '/app/src/route.ts',
    ]);
    expect(frames.map((frame) => frame.in_app)).toEqual([false, false, true, true]);
    expect(frames[3]).toMatchObject({ function: 'handler', lineno: 10, colno: 5 });
    expect(framesOf(undefined)).toEqual([]);
  });
});

describe('OBS-06 what is sent', () => {
  it('OBS-06 sends an envelope of three lines to the endpoint with the key', async () => {
    const { reporter, sent } = harness({ environment: 'production', release: 'abc1234' });
    reporter.report(new TypeError('cannot read'), {
      source: 'http',
      requestId: 'req-1',
      traceId: 'a'.repeat(32),
      tenantId: 'tenant-1',
      userId: 'user-1',
      http: { method: 'POST', path: '/api/v1/deals', status: 500 },
    });
    await reporter.flush();
    expect(sent).toHaveLength(1);
    expect(sent[0]?.url).toBe('https://errors.example.com/api/42/envelope/');
    expect(sent[0]?.headers['x-sentry-auth']).toContain('sentry_key=abc123');
    expect(sent[0]?.headers['content-type']).toBe('application/x-sentry-envelope');
    const [header, item, payload] = sent[0]?.lines ?? [];
    expect(JSON.parse(header ?? '{}')).toMatchObject({ event_id: expect.stringMatching(/^[0-9a-f]{32}$/) });
    expect(JSON.parse(item ?? '{}')).toEqual({ type: 'event', length: Buffer.byteLength(payload ?? '') });
    expect(eventOf(sent[0])).toMatchObject({
      platform: 'node',
      level: 'error',
      environment: 'production',
      release: 'abc1234',
      user: { id: 'user-1' },
      request: { method: 'POST', url: '/api/v1/deals' },
      tags: { source: 'http', tenant_id: 'tenant-1' },
      extra: { requestId: 'req-1', status: 500 },
      contexts: { trace: { trace_id: 'a'.repeat(32) } },
      exception: { values: [{ type: 'TypeError', value: 'cannot read' }] },
    });
  });

  it('OBS-06 the code of a BkError and the job of a failed job are tags', async () => {
    const { reporter, sent } = harness();
    reporter.report(new BkError('x', { code: 'CRM_BUG' }), {
      source: 'job',
      job: { name: 'crm.sync', id: 'j-1', queue: 'default', attempt: 3 },
    });
    await reporter.flush();
    expect(eventOf(sent[0])).toMatchObject({
      tags: { code: 'CRM_BUG', job: 'crm.sync', queue: 'default', source: 'job' },
      extra: { jobId: 'j-1', attempt: 3 },
    });
  });

  it('OBS-06 a cause chain is sent with the cause first, and a thrown string or object is still a report', async () => {
    const { reporter, sent } = harness();
    reporter.report(new Error('outer', { cause: new Error('inner') }), { source: 'http' });
    reporter.report('just a string', { source: 'process' });
    reporter.report({ not: 'an error' }, { source: 'process' });
    await reporter.flush();
    expect(eventOf(sent[0]).exception.values.map((value) => value.value)).toEqual(['inner', 'outer']);
    expect(eventOf(sent[1]).exception.values[0]).toMatchObject({ type: 'NonError', value: 'just a string' });
    expect(eventOf(sent[2]).exception.values[0]?.value).toBe('A value that is not an Error was thrown.');
  });

  it('OBS-06 a cause chain that goes round is cut', async () => {
    const { reporter, sent } = harness();
    const a = new Error('a');
    const b = new Error('b', { cause: a });
    a.cause = b;
    reporter.report(a, { source: 'http' });
    await reporter.flush();
    expect(eventOf(sent[0]).exception.values.length).toBeLessThanOrEqual(5);
  });

  it('SEC-09 keeps the secrets out of the message, the stack and the tags', async () => {
    const { reporter, sent } = harness({ secrets: ['hunter2-secret'] });
    const error = new Error('connect failed with hunter2-secret');
    error.stack = `Error: connect failed with hunter2-secret\n    at f (/app/hunter2-secret/x.ts:1:1)`;
    reporter.report(error, { source: 'http', tags: { password: 'hunter2-secret' } });
    await reporter.flush();
    expect(sent[0]?.lines.join('\n')).not.toContain('hunter2-secret');
    expect(sent[0]?.lines.join('\n')).toContain('[redacted]');
  });

  it('SEC-09 leaves out a body, a header, a query string and an e-mail: only ids and the place', async () => {
    const { reporter, sent } = harness();
    reporter.report(new Error('x'), {
      source: 'http',
      userId: 'user-1',
      http: { method: 'GET', path: '/api/v1/contacts' },
    });
    await reporter.flush();
    const event = eventOf(sent[0]);
    expect(event['request']).toEqual({ method: 'GET', url: '/api/v1/contacts' });
    expect(event['user']).toEqual({ id: 'user-1' });
    expect(JSON.stringify(event)).not.toMatch(/"(email|cookie|authorization|body|headers|query)"/i);
  });

  it('OBS-06 a trace id that is not 32 hex digits is left out', async () => {
    const { reporter, sent } = harness();
    reporter.report(new Error('x'), { source: 'http', traceId: 'not-a-trace' });
    await reporter.flush();
    expect(eventOf(sent[0])).not.toHaveProperty('contexts');
  });

  it('OBS-06 a tag is cut at 200 characters', async () => {
    const { reporter, sent } = harness();
    reporter.report(new Error('x'), { source: 'client', tags: { page: 'p'.repeat(500) } });
    await reporter.flush();
    expect(eventOf(sent[0]).tags['page']).toHaveLength(200);
  });
});

describe('OBS-06 sampling and the budget', () => {
  it('OBS-06 sends the share that the rate says, and always a fatal report', async () => {
    const { reporter, sent } = harness({ sampleRate: 0.5, random: () => 0.7 });
    reporter.report(new Error('dropped'), { source: 'http' });
    reporter.report(new Error('kept'), { source: 'process', level: 'fatal' });
    await reporter.flush();
    expect(sent).toHaveLength(1);
    expect(eventOf(sent[0]).level).toBe('fatal');
    const all = harness({ sampleRate: 0.5, random: () => 0.2 });
    all.reporter.report(new Error('kept'), { source: 'http' });
    await all.reporter.flush();
    expect(all.sent).toHaveLength(1);
  });

  it('OBS-06 sends at most the budget of a minute, says so once, and starts again in the next minute', async () => {
    const { reporter, sent, warnings, tick } = harness({ maxPerMinute: 3 });
    for (let i = 0; i < 10; i += 1) reporter.report(new Error(`e${String(i)}`), { source: 'http' });
    await reporter.flush();
    expect(sent).toHaveLength(3);
    tick(61_000);
    reporter.report(new Error('next minute'), { source: 'http' });
    await reporter.flush();
    expect(sent).toHaveLength(4);
    expect(warnings.some((line) => line.includes('reports were dropped'))).toBe(true);
  });

  it('OBS-06 a slow server holds at most 20 reports in the air, and the rest are dropped', async () => {
    const release: (() => void)[] = [];
    const { reporter, sent } = harness(
      { maxPerMinute: 1000 },
      () => new Promise<Response>((resolve) => release.push(() => resolve(new Response('{}')))),
    );
    for (let i = 0; i < 50; i += 1) reporter.report(new Error('x'), { source: 'http' });
    expect(sent).toHaveLength(20);
    for (const done of release) done();
    expect(await reporter.flush()).toBe(true);
  });
});

describe('OBS-06 a server that is slow, down or throttling', () => {
  it('OBS-06 report never waits, and never throws, when the network fails', async () => {
    const warnings: string[] = [];
    const reporter = createSentryReporter({
      dsn: DSN,
      logger: createLogger({ level: 'warn', role: 'web', write: (line) => void warnings.push(line) }),
      fetch: async () => {
        throw new Error('ECONNREFUSED');
      },
    });
    expect(() => reporter.report(new Error('x'), { source: 'http' })).not.toThrow();
    expect(await reporter.flush()).toBe(true);
    expect(warnings.join('\n')).toContain('ECONNREFUSED');
  });

  it('OBS-06 warns once a minute about a server that refuses, not once for each report', async () => {
    const { reporter, warnings, tick } = harness({}, () => new Response('no', { status: 500 }));
    for (let i = 0; i < 5; i += 1) reporter.report(new Error('x'), { source: 'http' });
    await reporter.flush();
    expect(warnings).toHaveLength(1);
    tick(61_000);
    reporter.report(new Error('x'), { source: 'http' });
    await reporter.flush();
    expect(warnings).toHaveLength(2);
  });

  it('OBS-06 stops sending for the time that a 429 asks for', async () => {
    let status = 429;
    const { reporter, sent, tick } = harness(
      {},
      () => new Response('slow down', { status, headers: { 'retry-after': '30' } }),
    );
    reporter.report(new Error('first'), { source: 'http' });
    await reporter.flush();
    reporter.report(new Error('paused'), { source: 'http' });
    await reporter.flush();
    expect(sent).toHaveLength(1);
    tick(31_000);
    status = 200;
    reporter.report(new Error('again'), { source: 'http' });
    await reporter.flush();
    expect(sent).toHaveLength(2);
  });

  it('OBS-06 a 429 with no Retry-After pauses for a minute', async () => {
    const { reporter, sent, tick } = harness({}, () => new Response('slow down', { status: 429 }));
    reporter.report(new Error('first'), { source: 'http' });
    await reporter.flush();
    tick(59_000);
    reporter.report(new Error('paused'), { source: 'http' });
    await reporter.flush();
    expect(sent).toHaveLength(1);
  });

  it('OBS-06 flush gives up after its time and says that something is still out', async () => {
    const { reporter } = harness({}, () => new Promise<Response>(() => undefined));
    reporter.report(new Error('x'), { source: 'http' });
    expect(await reporter.flush(50)).toBe(false);
  });

  it('OBS-06 flush with nothing out answers at once', async () => {
    const { reporter } = harness();
    expect(await reporter.flush()).toBe(true);
  });

  it('OBS-06 a send that runs over its time is cut', async () => {
    const reporter = createSentryReporter({
      dsn: DSN,
      timeoutMs: 30,
      fetch: (_input, init) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () => reject(new Error('aborted')));
        }),
    });
    reporter.report(new Error('x'), { source: 'http' });
    expect(await reporter.flush(2_000)).toBe(true);
  });

  it('OBS-06 a report that cannot be made is a warning, not an exception', () => {
    const { reporter } = harness();
    const hostile = new Error('x');
    Object.defineProperty(hostile, 'message', {
      get() {
        throw new Error('getter');
      },
    });
    expect(() => reporter.report(hostile, { source: 'http' })).not.toThrow();
  });
});
