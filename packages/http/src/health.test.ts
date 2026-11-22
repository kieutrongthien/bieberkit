/**
 * BieberKit
 *
 * @file        packages/http/src/health.test.ts
 * @description Tests of the health endpoints, the graceful shutdown, the timeouts and the lifecycle hooks of the server (spec 19.3, 19.4, API-03, API-05).
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

import { createLifecycle, exitCode } from '@bieberkit/core';
import { describe, expect, it } from 'vitest';
import { registerHttp } from './lifecycle.ts';
import { okRoute, testServer, TEST_ENV } from './testing.ts';

const wait = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

describe('19.3 health endpoints', () => {
  it('19.3 live answers 200 with no dependency', async () => {
    const { server } = testServer();
    const response = await server.inject({ method: 'GET', url: '/health/live' });
    expect(response.statusCode).toBe(200);
    expect(JSON.parse(response.body)).toEqual({ status: 'ok' });
    expect(response.headers['x-request-id']).toBeDefined();
  });

  it('19.3 ready answers 200 while the server runs', async () => {
    const { server } = testServer();
    expect((await server.inject({ method: 'GET', url: '/health/ready' })).statusCode).toBe(200);
  });

  it('19.3 startup is 503 until markReady, then 200', async () => {
    const { server } = testServer();
    const before = await server.inject({ method: 'GET', url: '/health/startup' });
    expect(before.statusCode).toBe(503);
    expect(JSON.parse(before.body)).toMatchObject({ code: 'HTTP_NOT_READY' });
    server.markReady();
    expect((await server.inject({ method: 'GET', url: '/health/startup' })).statusCode).toBe(200);
  });

  it('19.3 the probes do not authenticate, limit or resolve a tenant', async () => {
    const calls: string[] = [];
    const { server } = testServer({
      authenticator: { authenticate: async () => (calls.push('authenticate'), undefined) },
      ipLimiter: { hit: async () => (calls.push('ip'), { allowed: false }) },
      tenantResolver: { resolve: async () => (calls.push('tenant'), undefined) },
    });
    for (const path of ['live', 'ready', 'startup']) await server.inject({ method: 'GET', url: `/health/${path}` });
    expect(calls).toEqual([]);
  });
});

describe('19.4 graceful shutdown', () => {
  it('19.4 ready turns 503 as soon as the shutdown begins, before the drain delay is over', async () => {
    const { server } = testServer();
    const stopping = server.stop({ drainMs: 150, timeoutMs: 1000 });
    await wait(20);
    const response = await server.inject({ method: 'GET', url: '/health/ready' });
    expect(response.statusCode).toBe(503);
    expect(JSON.parse(response.body)).toMatchObject({ code: 'HTTP_NOT_READY' });
    expect(await stopping).toEqual({ timedOut: false });
  });

  it('19.4 live stays 200 while the server drains', async () => {
    const { server } = testServer();
    const stopping = server.stop({ drainMs: 100, timeoutMs: 1000 });
    await wait(10);
    expect((await server.inject({ method: 'GET', url: '/health/live' })).statusCode).toBe(200);
    await stopping;
  });

  it('19.4 waits for a request in progress, and then the answer is complete', async () => {
    const { server } = testServer();
    server.route(
      okRoute('/api/v1/t/slow', {
        handler: async () => {
          await wait(300);
          return { ok: true };
        },
      }),
    );
    const { port } = await server.listen({ port: 0, host: '127.0.0.1' });
    const request = fetch(`http://127.0.0.1:${port}/api/v1/t/slow`);
    await wait(50);
    const stopping = server.stop({ drainMs: 10, timeoutMs: 3000 });
    const response = await request;
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true });
    expect(await stopping).toEqual({ timedOut: false });
  });

  it('19.4 gives up after the timeout and says so', async () => {
    const { server } = testServer();
    server.route(
      okRoute('/api/v1/t/stuck', {
        handler: async () => {
          await wait(1500);
          return { ok: true };
        },
      }),
    );
    const { port } = await server.listen({ port: 0, host: '127.0.0.1' });
    const request = fetch(`http://127.0.0.1:${port}/api/v1/t/stuck`).catch(() => undefined);
    await wait(50);
    expect(await server.stop({ drainMs: 10, timeoutMs: 100 })).toEqual({ timedOut: true });
    await request;
  });

  it('19.4 after the stop no new connection is accepted', async () => {
    const { server } = testServer();
    const { port } = await server.listen({ port: 0, host: '127.0.0.1' });
    await server.stop({ drainMs: 0, timeoutMs: 1000 });
    await expect(fetch(`http://127.0.0.1:${port}/health/live`)).rejects.toBeDefined();
  });

  it('19.4 stop is safe to call twice', async () => {
    const { server } = testServer();
    await server.stop({ drainMs: 0, timeoutMs: 1000 });
    expect(await server.stop({ drainMs: 0, timeoutMs: 1000 })).toEqual({ timedOut: false });
  });

  it('19.4 closes the idle connections of a client that keeps them alive', async () => {
    const { server } = testServer();
    const { port } = await server.listen({ port: 0, host: '127.0.0.1' });
    await fetch(`http://127.0.0.1:${port}/health/live`, { headers: { connection: 'keep-alive' } });
    const started = Date.now();
    expect(await server.stop({ drainMs: 0, timeoutMs: 5000 })).toEqual({ timedOut: false });
    expect(Date.now() - started).toBeLessThan(2000);
  });
});

describe('API-03 and API-05 the limits', () => {
  it('API-03 and API-05 have the defaults of the spec', () => {
    expect(testServer().server.settings).toEqual({
      bodyLimit: 1_048_576,
      requestTimeoutMs: 30_000,
      keepAliveTimeoutMs: 65_000,
    });
  });

  it('API-03 and API-05 take other values from the options', () => {
    const { server } = testServer({ bodyLimit: 10, requestTimeoutMs: 5, keepAliveTimeoutMs: 7 });
    expect(server.settings).toEqual({ bodyLimit: 10, requestTimeoutMs: 5, keepAliveTimeoutMs: 7 });
  });

  it('API-05 keeps connections alive for longer than a load balancer of 60 seconds waits', () => {
    expect(testServer().server.settings.keepAliveTimeoutMs).toBeGreaterThan(60_000);
  });

  it.each([
    ['a body limit of zero', { bodyLimit: 0 }],
    ['a negative timeout', { requestTimeoutMs: -1 }],
    ['a keep alive that is not a number', { keepAliveTimeoutMs: Number.NaN }],
  ])('API-05 refuses %s', (_name, options) => {
    expect(() => testServer(options)).toThrow(expect.objectContaining({ code: 'HTTP_CONFIG_INVALID' }));
  });
});

describe('7.2 the lifecycle', () => {
  it('7.2 listens at boot and stops at shutdown, with the exit code of core', async () => {
    const { server } = testServer();
    const lifecycle = createLifecycle();
    registerHttp(lifecycle, server, { host: '127.0.0.1', port: 0, drainMs: 0, timeoutMs: 1000 });
    await lifecycle.boot();
    expect((await server.inject({ method: 'GET', url: '/health/startup' })).statusCode).toBe(200);
    const result = await lifecycle.stop();
    expect(exitCode(result)).toBe(0);
    expect(result.failures).toEqual([]);
  });

  it('7.2 the port comes from APP_PORT when the options leave it out', async () => {
    const { server } = testServer({}, { ...TEST_ENV, APP_PORT: 0 });
    const { port } = await server.listen({ host: '127.0.0.1' });
    expect(port).toBeGreaterThan(0);
    await server.stop({ drainMs: 0, timeoutMs: 1000 });
  });
});
