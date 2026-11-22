/**
 * BieberKit
 *
 * @file        packages/http/src/http-fetch.ts
 * @description http.fetch: an outbound fetch that refuses private addresses, redirects safely, times out, retries what is safe and opens a circuit for a host that fails (SEC-06, WH-02, WH-04).
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

import dns from 'node:dns';
import http from 'node:http';
import https from 'node:https';
import { BlockList, isIP } from 'node:net';
import { Readable, Transform } from 'node:stream';
import { BkError } from '@bieberkit/core';

/** An error of an outbound call. `status` is the status that a route that passes it on would answer with. */
export class HttpFetchError extends BkError {}

function fetchError(code: string, status: number, message: string, fix: string, cause?: unknown): HttpFetchError {
  return new HttpFetchError(message, { code, status, fix, ...(cause === undefined ? {} : { cause }) });
}

const blocked = (message: string): HttpFetchError =>
  fetchError(
    'HTTP_FETCH_BLOCKED',
    400,
    message,
    'Use a public address, or add the host to the allowlist of http.fetch if it is meant.',
  );

const RESERVED = new BlockList();
for (const [address, prefix] of [
  ['0.0.0.0', 8],
  ['10.0.0.0', 8],
  ['100.64.0.0', 10],
  ['127.0.0.0', 8],
  ['169.254.0.0', 16],
  ['172.16.0.0', 12],
  ['192.0.0.0', 24],
  ['192.0.2.0', 24],
  ['192.88.99.0', 24],
  ['192.168.0.0', 16],
  ['198.18.0.0', 15],
  ['198.51.100.0', 24],
  ['203.0.113.0', 24],
  ['224.0.0.0', 4],
  ['240.0.0.0', 4],
] as const) {
  RESERVED.addSubnet(address, prefix, 'ipv4');
}
for (const [address, prefix] of [
  ['::', 96],
  ['64:ff9b::', 96],
  ['100::', 64],
  ['2001::', 32],
  ['2001:db8::', 32],
  ['2002::', 16],
  ['fc00::', 7],
  ['fe80::', 10],
  ['ff00::', 8],
] as const) {
  RESERVED.addSubnet(address, prefix, 'ipv6');
}

/** The IPv4 address inside `::ffff:a.b.c.d` or `::ffff:hhhh:hhhh`, or `undefined`. */
function mappedV4(address: string): string | undefined {
  const lower = address.toLowerCase();
  const dotted = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/.exec(lower);
  if (dotted !== null) return dotted[1];
  const hex = /^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/.exec(lower);
  if (hex === null) return undefined;
  const high = Number.parseInt(hex[1] ?? '0', 16);
  const low = Number.parseInt(hex[2] ?? '0', 16);
  return `${high >> 8}.${high & 255}.${low >> 8}.${low & 255}`;
}

function normalize(address: string): { address: string; family: 'ipv4' | 'ipv6' } | undefined {
  const bare = address.replace(/^\[|\]$/g, '').split('%')[0] ?? '';
  const inner = mappedV4(bare) ?? bare;
  const family = isIP(inner);
  return family === 0 ? undefined : { address: inner, family: family === 4 ? 'ipv4' : 'ipv6' };
}

/** Whether a connection to `address` is refused by default: loopback, private, link-local, metadata, reserved and anything that is not an address. */
export function isBlockedAddress(address: string): boolean {
  const parsed = normalize(address);
  return parsed === undefined || RESERVED.check(parsed.address, parsed.family);
}

export interface ResolvedAddress {
  readonly address: string;
  readonly family: 4 | 6;
}

export interface HttpFetchOptions {
  /** Host names, addresses and ranges (`10.0.0.0/8`) that may be called although they are private. */
  readonly allow?: readonly string[];
  /** Milliseconds to open the connection. Defaults to 5000 (WH-04). */
  readonly connectTimeoutMs?: number;
  /** Milliseconds for one attempt, with its redirects. Defaults to 30 000 (WH-04). */
  readonly timeoutMs?: number;
  /** Retries of a request that is idempotent. Defaults to 2. */
  readonly retries?: number;
  /** The wait before the first retry, doubled each time. Defaults to 200. */
  readonly backoffMs?: number;
  readonly maxRedirects?: number;
  readonly maxResponseBytes?: number;
  /** Failures in a row that open the circuit of a host. Defaults to 5. */
  readonly failureThreshold?: number;
  /** Milliseconds that a circuit stays open. Defaults to 30 000. */
  readonly openMs?: number;
  /** For tests: the resolver of host names. Defaults to the system resolver. */
  readonly lookup?: (host: string) => Promise<readonly ResolvedAddress[]>;
  readonly now?: () => number;
}

export interface HttpFetchInit {
  readonly method?: string;
  readonly headers?: Record<string, string> | Headers | [string, string][];
  readonly body?: string | Uint8Array;
  readonly redirect?: 'follow' | 'manual' | 'error';
}

export interface HttpFetch {
  fetch(input: string | URL, init?: HttpFetchInit): Promise<Response>;
}

interface Allowance {
  readonly names: ReadonlySet<string>;
  readonly ranges: BlockList;
}

function configError(message: string): never {
  throw fetchError(
    'HTTP_CONFIG_INVALID',
    500,
    message,
    'Write a host name, an address, or a range such as 10.0.0.0/8.',
  );
}

function allowanceOf(entries: readonly string[]): Allowance {
  const names = new Set<string>();
  const ranges = new BlockList();
  for (const raw of entries) {
    const entry = raw.trim().toLowerCase();
    const [base = '', prefix, ...extra] = entry.split('/');
    const parsed = normalize(base);
    if (entry === '' || extra.length > 0) configError(`"${raw}" is not an entry of the allowlist.`);
    if (prefix !== undefined) {
      const bits = Number(prefix);
      const max = parsed?.family === 'ipv6' ? 128 : 32;
      if (parsed === undefined || !/^\d+$/.test(prefix) || bits > max) configError(`"${raw}" is not a range.`);
      ranges.addSubnet(parsed.address, bits, parsed.family);
    } else if (parsed !== undefined) {
      ranges.addAddress(parsed.address, parsed.family);
    } else if (/^[a-z0-9]([a-z0-9.-]*[a-z0-9])?$/.test(entry)) {
      names.add(entry);
    } else {
      configError(`"${raw}" is not a host name, an address or a range.`);
    }
  }
  return { names, ranges };
}

interface Circuit {
  failures: number;
  openedAt: number | undefined;
  trial: boolean;
}

const IDEMPOTENT = new Set(['GET', 'HEAD', 'PUT', 'DELETE', 'OPTIONS']);
const REDIRECTS = new Set([301, 302, 303, 307, 308]);
const NO_BODY = new Set([204, 205, 304]);
const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

const systemLookup = async (host: string): Promise<readonly ResolvedAddress[]> =>
  (await dns.promises.lookup(host, { all: true, verbatim: true })).flatMap((entry) =>
    entry.family === 4 || entry.family === 6 ? [{ address: entry.address, family: entry.family }] : [],
  );

/** The `fetch` that webhooks and integrations call (SEC-06, WH-02, WH-04). It speaks http and https only. */
export function createHttpFetch(options: HttpFetchOptions = {}): HttpFetch {
  const allowance = allowanceOf(options.allow ?? []);
  const connectTimeout = options.connectTimeoutMs ?? 5000;
  const timeout = options.timeoutMs ?? 30_000;
  const retries = options.retries ?? 2;
  const backoff = options.backoffMs ?? 200;
  const maxRedirects = options.maxRedirects ?? 3;
  const maxBytes = options.maxResponseBytes ?? 10 * 1024 * 1024;
  const threshold = options.failureThreshold ?? 5;
  const openMs = options.openMs ?? 30_000;
  const now = options.now ?? Date.now;
  const lookup = options.lookup ?? systemLookup;
  const circuits = new Map<string, Circuit>();

  /** Resolves the host, and refuses it unless every address is public or allowed. The checked addresses are the ones the socket uses. */
  async function resolve(host: string): Promise<readonly ResolvedAddress[]> {
    const name = host.replace(/^\[|\]$/g, '').toLowerCase();
    const literal = normalize(name);
    const addresses: readonly ResolvedAddress[] =
      literal === undefined
        ? await lookup(name)
        : [{ address: literal.address, family: literal.family === 'ipv4' ? 4 : 6 }];
    if (addresses.length === 0)
      throw fetchError('HTTP_FETCH_FAILED', 502, `${name} did not resolve.`, 'Check the host name.');
    const allowedName = allowance.names.has(name);
    for (const entry of addresses) {
      const parsed = normalize(entry.address);
      const allowed = allowedName || (parsed !== undefined && allowance.ranges.check(parsed.address, parsed.family));
      if (isBlockedAddress(entry.address) && !allowed)
        throw blocked(`${name} is, or resolves to, an address that is not public.`);
    }
    return addresses;
  }

  function open(host: string): void {
    const circuit = circuits.get(host);
    if (circuit?.openedAt === undefined) return;
    if (now() - circuit.openedAt < openMs || circuit.trial) {
      throw fetchError('HTTP_FETCH_CIRCUIT_OPEN', 503, `${host} failed too often.`, `Try again after ${openMs} ms.`);
    }
    circuit.trial = true;
  }

  function record(host: string, failed: boolean): void {
    const circuit = circuits.get(host) ?? { failures: 0, openedAt: undefined, trial: false };
    circuits.set(host, circuit);
    if (!failed) {
      circuit.failures = 0;
      circuit.openedAt = undefined;
      circuit.trial = false;
      return;
    }
    circuit.failures += 1;
    if (circuit.trial || circuit.failures >= threshold) {
      circuit.openedAt = now();
      circuit.trial = false;
    }
  }

  /** One request to one url, with no redirect and no retry. */
  async function once(
    url: URL,
    method: string,
    headers: Headers,
    body: string | Uint8Array | undefined,
    signal: AbortSignal,
  ): Promise<Response> {
    if (url.protocol !== 'http:' && url.protocol !== 'https:') throw blocked(`${url.protocol} is not http or https.`);
    if (url.username !== '' || url.password !== '') throw blocked('A url with a user name or a password is refused.');
    const addresses = await resolve(url.hostname);
    const lib = url.protocol === 'https:' ? https : http;
    return new Promise<Response>((done, fail) => {
      const request = lib.request(
        {
          hostname: url.hostname.replace(/^\[|\]$/g, ''),
          port: url.port === '' ? undefined : Number(url.port),
          path: `${url.pathname}${url.search}`,
          method,
          headers: Object.fromEntries(headers),
          signal,
          lookup: (_host, lookupOptions, callback) => {
            if (lookupOptions.all === true)
              callback(
                null,
                addresses.map((entry) => ({ address: entry.address, family: entry.family })),
              );
            else callback(null, addresses[0]?.address ?? '', addresses[0]?.family ?? 4);
          },
        },
        (response) => {
          const length = Number(response.headers['content-length']);
          if (Number.isFinite(length) && length > maxBytes) {
            response.destroy();
            fail(
              fetchError(
                'HTTP_FETCH_TOO_LARGE',
                502,
                'The response is larger than the limit.',
                'Raise maxResponseBytes, or ask for less.',
              ),
            );
            return;
          }
          let total = 0;
          const limited = new Transform({
            transform(chunk: Buffer, _encoding, callback) {
              total += chunk.length;
              if (total > maxBytes)
                callback(
                  fetchError(
                    'HTTP_FETCH_TOO_LARGE',
                    502,
                    'The response is larger than the limit.',
                    'Raise maxResponseBytes, or ask for less.',
                  ),
                );
              else callback(null, chunk);
            },
          });
          response.on('error', (error) => limited.destroy(error));
          response.pipe(limited);
          const responseHeaders = new Headers();
          for (const [name, value] of Object.entries(response.headers)) {
            for (const item of Array.isArray(value) ? value : [value])
              if (item !== undefined) responseHeaders.append(name, item);
          }
          const status = response.statusCode ?? 502;
          // The stream of node:stream/web and the global ReadableStream are the same object under two names of one type.
          // oxlint-disable-next-line typescript/no-unsafe-type-assertion
          const stream = Readable.toWeb(limited) as unknown as ReadableStream<Uint8Array>;
          done(new Response(NO_BODY.has(status) ? null : stream, { status, headers: responseHeaders }));
        },
      );
      request.on('socket', (socket) => {
        if (!socket.connecting) return;
        const timer = setTimeout(
          () =>
            request.destroy(
              fetchError('HTTP_FETCH_TIMEOUT', 504, 'The connection was not made in time.', 'Check the host.'),
            ),
          connectTimeout,
        );
        socket.once('connect', () => clearTimeout(timer));
        socket.once('close', () => clearTimeout(timer));
      });
      request.on('error', (error) => fail(error));
      request.end(body);
    });
  }

  /** One attempt: the request and the redirects that it asks for, within the time of an attempt. */
  async function attempt(url: URL, init: HttpFetchInit): Promise<Response> {
    const signal = AbortSignal.timeout(timeout);
    let current = url;
    let method = (init.method ?? 'GET').toUpperCase();
    let body = init.body;
    const headers = new Headers(init.headers);
    for (let hop = 0; ; hop += 1) {
      let response: Response;
      try {
        response = await once(current, method, headers, body, signal);
      } catch (error) {
        if (error instanceof HttpFetchError) throw error;
        if (signal.aborted)
          throw fetchError(
            'HTTP_FETCH_TIMEOUT',
            504,
            `${current.host} did not answer in time.`,
            'Try again, or raise timeoutMs.',
            error,
          );
        throw fetchError(
          'HTTP_FETCH_FAILED',
          502,
          `The call to ${current.host} failed.`,
          'Check the host and the network.',
          error,
        );
      }
      const location = response.headers.get('location');
      if (!REDIRECTS.has(response.status) || location === null || (init.redirect ?? 'follow') === 'manual')
        return response;
      await response.body?.cancel();
      if (init.redirect === 'error' || hop >= maxRedirects) {
        throw fetchError(
          'HTTP_FETCH_FAILED',
          502,
          `${current.host} redirected too many times.`,
          'Call the final address.',
        );
      }
      const next = new URL(location, current);
      if (next.host !== current.host) headers.delete('authorization');
      if (response.status === 303 || ((response.status === 301 || response.status === 302) && method === 'POST')) {
        method = 'GET';
        body = undefined;
        headers.delete('content-type');
      }
      current = next;
    }
  }

  return {
    async fetch(input, init = {}) {
      let url: URL;
      try {
        url = new URL(input);
      } catch {
        throw blocked('The address is not a url.');
      }
      const idempotent =
        IDEMPOTENT.has((init.method ?? 'GET').toUpperCase()) || new Headers(init.headers).has('idempotency-key');
      for (let n = 0; ; n += 1) {
        open(url.host);
        const last = n >= retries || !idempotent;
        let response: Response;
        try {
          response = await attempt(url, init);
        } catch (error) {
          if (error instanceof HttpFetchError && error.code === 'HTTP_FETCH_BLOCKED') throw error;
          if (error instanceof HttpFetchError && error.code === 'HTTP_FETCH_TOO_LARGE') throw error;
          record(url.host, true);
          // A network failure and a timeout may pass at the next try. A refusal of ours, such as too many redirects, will not.
          const again =
            error instanceof HttpFetchError && (error.code === 'HTTP_FETCH_TIMEOUT' || error.cause !== undefined);
          if (last || !again) throw error;
          await sleep(backoff * 2 ** n);
          continue;
        }
        record(url.host, response.status >= 500);
        if (!last && (response.status === 502 || response.status === 503 || response.status === 504)) {
          await response.body?.cancel();
          await sleep(backoff * 2 ** n);
          continue;
        }
        return response;
      }
    },
  };
}
