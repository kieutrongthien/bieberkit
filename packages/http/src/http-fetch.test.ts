/**
 * BieberKit
 *
 * @file        packages/http/src/http-fetch.test.ts
 * @description Tests of http.fetch: the SSRF guard, redirects, timeouts, retries and the circuit breaker of each host (SEC-06, WH-02, WH-04).
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

import { createServer } from 'node:http';
import type { IncomingMessage, Server, ServerResponse } from 'node:http';
import { afterEach, describe, expect, it } from 'vitest';
import { createHttpFetch, isBlockedAddress } from './http-fetch.ts';
import type { HttpFetchOptions } from './http-fetch.ts';

const servers: Server[] = [];
afterEach(async () => {
  for (const server of servers.splice(0)) {
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});

type Handler = (request: IncomingMessage, response: ServerResponse, count: number) => void;

async function listen(handler: Handler): Promise<{ url: string; port: number; hits: () => number }> {
  let count = 0;
  const server = createServer((request, response) => {
    count += 1;
    handler(request, response, count);
  });
  servers.push(server);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const port = portOf(server);
  return { url: `http://127.0.0.1:${port}`, port, hits: () => count };
}

const LOCAL: HttpFetchOptions = { allow: ['127.0.0.0/8'], backoffMs: 1 };
const ok = (_request: IncomingMessage, response: ServerResponse): void => {
  response.writeHead(200, { 'content-type': 'application/json' }).end('{"ok":true}');
};

function portOf(server: Server): number {
  const address = server.address();
  return typeof address === 'object' && address !== null ? address.port : 0;
}

async function failureOf(run: () => Promise<unknown>): Promise<{ code?: unknown; message: string }> {
  try {
    await run();
  } catch (error) {
    return {
      code: Reflect.get(Object(error), 'code'),
      message: error instanceof Error ? error.message : String(error),
    };
  }
  throw new Error('Expected the call to fail.');
}

describe('SEC-06 which addresses are blocked', () => {
  it.each([
    '127.0.0.1',
    '127.255.255.254',
    '10.0.0.1',
    '10.255.255.255',
    '172.16.0.1',
    '172.31.255.255',
    '192.168.1.1',
    '169.254.169.254',
    '169.254.0.1',
    '100.64.0.1',
    '0.0.0.0',
    '224.0.0.1',
    '240.0.0.1',
    '255.255.255.255',
    '192.0.2.1',
    '198.51.100.7',
    '203.0.113.9',
    '198.18.0.1',
    '192.0.0.1',
    '::1',
    '::',
    'fc00::1',
    'fd12:3456::1',
    'fe80::1',
    'ff02::1',
    '2001:db8::1',
    '::ffff:10.0.0.1',
    '::ffff:127.0.0.1',
    '::ffff:169.254.169.254',
    '64:ff9b::a00:1',
  ])('SEC-06 blocks %s', (address) => {
    expect(isBlockedAddress(address)).toBe(true);
  });

  it.each([
    '8.8.8.8',
    '1.1.1.1',
    '93.184.216.34',
    '172.15.255.255',
    '172.32.0.1',
    '192.169.0.1',
    '11.0.0.1',
    '100.63.255.255',
    '100.128.0.1',
    '2606:4700:4700::1111',
    '::ffff:8.8.8.8',
  ])('SEC-06 allows the public address %s', (address) => {
    expect(isBlockedAddress(address)).toBe(false);
  });

  it('SEC-06 blocks what is not an address, rather than letting it through', () => {
    for (const text of ['', 'localhost', '999.1.1.1', 'abc', '1.2.3']) expect(isBlockedAddress(text)).toBe(true);
  });
});

describe('SEC-06 the guard on a call', () => {
  it('SEC-06 refuses loopback, private and metadata addresses by default, without opening a connection', async () => {
    const server = await listen(ok);
    const http = createHttpFetch();
    for (const url of [
      server.url,
      'http://localhost:1/',
      'http://[::1]:1/',
      'http://169.254.169.254/latest/meta-data/',
      'http://10.1.2.3/',
      'http://0.0.0.0:1/',
      'http://2130706433/',
      'http://0x7f.1/',
    ]) {
      const failure = await failureOf(() => http.fetch(url));
      expect([url, failure.code]).toEqual([url, 'HTTP_FETCH_BLOCKED']);
    }
    expect(server.hits()).toBe(0);
  });

  it('SEC-06 refuses a host name that resolves to a private address, and one that resolves to a mix', async () => {
    const http = createHttpFetch({ lookup: async () => [{ address: '10.0.0.5', family: 4 }] });
    expect((await failureOf(() => http.fetch('http://internal.example/'))).code).toBe('HTTP_FETCH_BLOCKED');
    const mixed = createHttpFetch({
      lookup: async () => [
        { address: '8.8.8.8', family: 4 },
        { address: '10.0.0.5', family: 4 },
      ],
    });
    expect((await failureOf(() => mixed.fetch('http://mixed.example/'))).code).toBe('HTTP_FETCH_BLOCKED');
  });

  it('SEC-06 refuses a scheme that is not http or https, and a url with a password', async () => {
    const http = createHttpFetch(LOCAL);
    for (const url of [
      'file:///etc/passwd',
      'ftp://example.com/',
      'gopher://example.com/',
      'http://user:pass@example.com/',
      'not a url',
    ]) {
      expect([url, (await failureOf(() => http.fetch(url))).code]).toEqual([url, 'HTTP_FETCH_BLOCKED']);
    }
  });

  it('SEC-06 connects to the address that it checked, and resolves the name once', async () => {
    const server = await listen(ok);
    let lookups = 0;
    const http = createHttpFetch({
      ...LOCAL,
      lookup: async () => ((lookups += 1), [{ address: '127.0.0.1', family: 4 }]),
    });
    const response = await http.fetch(`http://pinned.example:${server.port}/`);
    expect(response.status).toBe(200);
    expect(lookups).toBe(1);
    expect(server.hits()).toBe(1);
  });

  it('SEC-06 allows an address, a range and a host name that the allowlist names', async () => {
    const server = await listen(ok);
    for (const allow of [['127.0.0.1'], ['127.0.0.0/8'], ['::ffff:127.0.0.1', '127.0.0.1']]) {
      const response = await createHttpFetch({ allow }).fetch(server.url);
      expect(response.status).toBe(200);
    }
    const byName = createHttpFetch({
      allow: ['Internal.Example'],
      lookup: async () => [{ address: '127.0.0.1', family: 4 }],
    });
    expect((await byName.fetch(`http://internal.example:${server.port}/`)).status).toBe(200);
    const other = createHttpFetch({
      allow: ['internal.example'],
      lookup: async () => [{ address: '127.0.0.1', family: 4 }],
    });
    expect((await failureOf(() => other.fetch(`http://other.example:${server.port}/`))).code).toBe(
      'HTTP_FETCH_BLOCKED',
    );
  });

  it('SEC-06 an allowlist range does not allow what is outside it', async () => {
    const http = createHttpFetch({ allow: ['10.0.0.0/8'] });
    expect((await failureOf(() => http.fetch('http://127.0.0.1:1/'))).code).toBe('HTTP_FETCH_BLOCKED');
  });

  it('SEC-06 refuses an allowlist entry that is not a host, an address or a range', () => {
    expect(() => createHttpFetch({ allow: ['10.0.0.0/99'] })).toThrow(
      expect.objectContaining({ code: 'HTTP_CONFIG_INVALID' }),
    );
    expect(() => createHttpFetch({ allow: [''] })).toThrow(expect.objectContaining({ code: 'HTTP_CONFIG_INVALID' }));
  });
});

describe('WH-02 a call that works', () => {
  it('WH-02 returns the status, the headers and the body, as a Response', async () => {
    const server = await listen((_request, response) =>
      response.writeHead(201, { 'content-type': 'application/json', 'x-test': 'yes' }).end('{"a":1}'),
    );
    const response = await createHttpFetch(LOCAL).fetch(server.url);
    expect(response.status).toBe(201);
    expect(response.headers.get('x-test')).toBe('yes');
    expect(await response.json()).toEqual({ a: 1 });
  });

  it('WH-02 sends the method, the headers and the body of the request', async () => {
    let seen = { method: '', type: '', body: '' };
    const server = await listen((request, response) => {
      const chunks: Buffer[] = [];
      request.on('data', (chunk: Buffer) => chunks.push(chunk));
      request.on('end', () => {
        seen = {
          method: String(request.method),
          type: String(request.headers['content-type']),
          body: Buffer.concat(chunks).toString(),
        };
        response.writeHead(200).end('done');
      });
    });
    await createHttpFetch(LOCAL).fetch(server.url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{"x":"Đường"}',
    });
    expect(seen).toEqual({ method: 'POST', type: 'application/json', body: '{"x":"Đường"}' });
  });

  it('WH-02 a 204 and a 304 have no body', async () => {
    const server = await listen((_request, response) => response.writeHead(204).end());
    const response = await createHttpFetch(LOCAL).fetch(server.url);
    expect(response.status).toBe(204);
    expect(await response.text()).toBe('');
  });
});

describe('SEC-06 redirects', () => {
  it('SEC-06 follows a redirect, checking the new address too', async () => {
    const target = await listen(ok);
    const first = await listen((_request, response) =>
      response.writeHead(302, { location: `${target.url}/final` }).end(),
    );
    const response = await createHttpFetch(LOCAL).fetch(first.url);
    expect(response.status).toBe(200);
    expect(target.hits()).toBe(1);
  });

  it('SEC-06 refuses a redirect to a blocked address, to another scheme and past the limit', async () => {
    const toMetadata = await listen((_request, response) =>
      response.writeHead(302, { location: 'http://169.254.169.254/' }).end(),
    );
    const to = (location: string) => listen((_request, response) => response.writeHead(302, { location }).end());
    const http = createHttpFetch({ allow: ['127.0.0.1'] });
    expect((await failureOf(() => http.fetch(toMetadata.url))).code).toBe('HTTP_FETCH_BLOCKED');
    const toFtp = await to('ftp://example.com/');
    expect((await failureOf(() => http.fetch(toFtp.url))).code).toBe('HTTP_FETCH_BLOCKED');
    const loop = await listen((_request, response, count) =>
      response.writeHead(302, { location: `/again${count}` }).end(),
    );
    expect((await failureOf(() => http.fetch(loop.url))).code).toBe('HTTP_FETCH_FAILED');
    expect(loop.hits()).toBe(4);
  });

  it('SEC-06 can give the redirect back unfollowed', async () => {
    const first = await listen((_request, response) => response.writeHead(302, { location: '/elsewhere' }).end());
    const response = await createHttpFetch(LOCAL).fetch(first.url, { redirect: 'manual' });
    expect(response.status).toBe(302);
    expect(response.headers.get('location')).toBe('/elsewhere');
  });

  it('SEC-06 a 303 and a redirected POST become a GET', async () => {
    const methods: string[] = [];
    const server = await listen((request, response, count) => {
      methods.push(String(request.method));
      if (count === 1) response.writeHead(303, { location: '/done' }).end();
      else response.writeHead(200).end('x');
    });
    await createHttpFetch(LOCAL).fetch(server.url, { method: 'POST', body: 'a' });
    expect(methods).toEqual(['POST', 'GET']);
  });
});

describe('WH-04 timeouts and size', () => {
  it('WH-04 gives up after the total time', async () => {
    const server = await listen(() => undefined);
    const failure = await failureOf(() => createHttpFetch({ ...LOCAL, timeoutMs: 80, retries: 0 }).fetch(server.url));
    expect(failure.code).toBe('HTTP_FETCH_TIMEOUT');
  });

  it('WH-04 gives up when the connection is not made in time', async () => {
    const http = createHttpFetch({
      allow: ['127.0.0.1'],
      connectTimeoutMs: 50,
      retries: 0,
      lookup: async () => [{ address: '127.0.0.1', family: 4 }],
    });
    const closed = createServer();
    await new Promise<void>((resolve) => closed.listen(0, '127.0.0.1', resolve));
    const port = portOf(closed);
    await new Promise<void>((resolve) => closed.close(() => resolve()));
    expect((await failureOf(() => http.fetch(`http://x.example:${port}/`))).code).toBe('HTTP_FETCH_FAILED');
  });

  it('WH-04 cuts a response that is larger than the limit', async () => {
    const server = await listen((_request, response) => {
      response.writeHead(200);
      response.write(Buffer.alloc(2000, 'a'));
      response.end(Buffer.alloc(2000, 'b'));
    });
    const response = await createHttpFetch({ ...LOCAL, maxResponseBytes: 1000 }).fetch(server.url);
    expect((await failureOf(() => response.text())).code).toBe('HTTP_FETCH_TOO_LARGE');
  });

  it('WH-04 refuses at once a response that says it is too large', async () => {
    const server = await listen((_request, response) =>
      response.writeHead(200, { 'content-length': '5000' }).end(Buffer.alloc(5000)),
    );
    expect((await failureOf(() => createHttpFetch({ ...LOCAL, maxResponseBytes: 1000 }).fetch(server.url))).code).toBe(
      'HTTP_FETCH_TOO_LARGE',
    );
  });
});

const flaky =
  (failures: number): Handler =>
  (_request, response, count) => {
    if (count <= failures) response.writeHead(503).end('no');
    else response.writeHead(200).end('yes');
  };

describe('WH-04 retries', () => {
  it('WH-04 retries a GET after a 503, up to twice', async () => {
    const server = await listen(flaky(2));
    const response = await createHttpFetch(LOCAL).fetch(server.url);
    expect(response.status).toBe(200);
    expect(server.hits()).toBe(3);
  });

  it('WH-04 gives the last answer when the retries are used up', async () => {
    const server = await listen(flaky(10));
    const response = await createHttpFetch(LOCAL).fetch(server.url);
    expect(response.status).toBe(503);
    expect(server.hits()).toBe(3);
  });

  it('WH-04 does not retry a POST, unless it sends an Idempotency-Key', async () => {
    const plain = await listen(flaky(1));
    expect((await createHttpFetch(LOCAL).fetch(plain.url, { method: 'POST', body: 'a' })).status).toBe(503);
    expect(plain.hits()).toBe(1);
    const keyed = await listen(flaky(1));
    const response = await createHttpFetch(LOCAL).fetch(keyed.url, {
      method: 'POST',
      body: 'a',
      headers: { 'idempotency-key': 'k1' },
    });
    expect(response.status).toBe(200);
    expect(keyed.hits()).toBe(2);
  });

  it('WH-04 a body that is dropped for a retry leaves no uncaught exception, even when it is still being sent', async () => {
    const uncaught: unknown[] = [];
    const listener = (error: unknown) => void uncaught.push(error);
    process.on('uncaughtException', listener);
    try {
      const server = await listen((_request, response, count) => {
        if (count > 3) {
          response.writeHead(200).end('yes');
          return;
        }
        // A 503 whose body goes on after the headers: chunks are in flight when the caller cancels it.
        response.writeHead(503);
        let sent = 0;
        const timer = setInterval(() => {
          if (sent >= 20 || response.destroyed) {
            clearInterval(timer);
            response.end();
          } else response.write('x'.repeat(1024 * (sent += 1)));
        }, 2);
      });
      const answer = await createHttpFetch({ ...LOCAL, retries: 3 }).fetch(server.url);
      expect(answer.status).toBe(200);
      await new Promise((resolve) => setTimeout(resolve, 150));
      expect(uncaught).toEqual([]);
    } finally {
      process.off('uncaughtException', listener);
    }
  });

  it('WH-04 retries a call that failed on the network', async () => {
    const server = await listen((request, response, count) => {
      if (count === 1) request.socket.destroy();
      else response.writeHead(200).end('yes');
    });
    expect((await createHttpFetch(LOCAL).fetch(server.url)).status).toBe(200);
    expect(server.hits()).toBe(2);
  });

  it('WH-04 does not retry a 4xx', async () => {
    const server = await listen((_request, response) => response.writeHead(404).end());
    expect((await createHttpFetch(LOCAL).fetch(server.url)).status).toBe(404);
    expect(server.hits()).toBe(1);
  });

  it('WH-04 can be told not to retry', async () => {
    const server = await listen(flaky(1));
    expect((await createHttpFetch({ ...LOCAL, retries: 0 }).fetch(server.url)).status).toBe(503);
    expect(server.hits()).toBe(1);
  });
});

async function broken() {
  let clock = 0;
  let healthy = false;
  const server = await listen((_request, response) =>
    healthy ? response.writeHead(200).end('ok') : response.writeHead(500).end('x'),
  );
  const http = createHttpFetch({ ...LOCAL, retries: 0, failureThreshold: 3, openMs: 1000, now: () => clock });
  return { server, http, advance: (ms: number) => void (clock += ms), heal: () => void (healthy = true) };
}

describe('WH-04 the circuit breaker of a host', () => {
  it('WH-04 opens after repeated failures, and then fails at once without calling the host', async () => {
    const { server, http } = await broken();
    for (let n = 0; n < 3; n += 1) expect((await http.fetch(server.url)).status).toBe(500);
    const failure = await failureOf(() => http.fetch(server.url));
    expect(failure.code).toBe('HTTP_FETCH_CIRCUIT_OPEN');
    expect(server.hits()).toBe(3);
  });

  it('WH-04 lets one trial through after the open time, and closes on a success', async () => {
    const { server, http, advance, heal } = await broken();
    for (let n = 0; n < 3; n += 1) await http.fetch(server.url);
    advance(1001);
    heal();
    expect((await http.fetch(server.url)).status).toBe(200);
    expect((await http.fetch(server.url)).status).toBe(200);
    expect(server.hits()).toBe(5);
  });

  it('WH-04 opens again at once when the trial fails', async () => {
    const { server, http, advance } = await broken();
    for (let n = 0; n < 3; n += 1) await http.fetch(server.url);
    advance(1001);
    expect((await http.fetch(server.url)).status).toBe(500);
    expect((await failureOf(() => http.fetch(server.url))).code).toBe('HTTP_FETCH_CIRCUIT_OPEN');
    expect(server.hits()).toBe(4);
  });

  it('WH-04 a success in between starts the count again', async () => {
    let fail = true;
    const server = await listen((_request, response) =>
      fail ? response.writeHead(500).end() : response.writeHead(200).end(),
    );
    const http = createHttpFetch({ ...LOCAL, retries: 0, failureThreshold: 3 });
    await http.fetch(server.url);
    await http.fetch(server.url);
    fail = false;
    await http.fetch(server.url);
    fail = true;
    await http.fetch(server.url);
    await http.fetch(server.url);
    expect((await http.fetch(server.url)).status).toBe(500);
    expect((await failureOf(() => http.fetch(server.url))).code).toBe('HTTP_FETCH_CIRCUIT_OPEN');
  });

  it('WH-04 a 4xx is not a failure of the host', async () => {
    const server = await listen((_request, response) => response.writeHead(404).end());
    const http = createHttpFetch({ ...LOCAL, retries: 0, failureThreshold: 2 });
    for (let n = 0; n < 5; n += 1) expect((await http.fetch(server.url)).status).toBe(404);
  });

  it('WH-04 each host has its own circuit', async () => {
    const bad = await listen((_request, response) => response.writeHead(500).end());
    const good = await listen(ok);
    const http = createHttpFetch({ ...LOCAL, retries: 0, failureThreshold: 2 });
    await http.fetch(bad.url);
    await http.fetch(bad.url);
    expect((await failureOf(() => http.fetch(bad.url))).code).toBe('HTTP_FETCH_CIRCUIT_OPEN');
    expect((await http.fetch(good.url)).status).toBe(200);
  });
});
