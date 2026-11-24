/**
 * BieberKit
 *
 * @file        packages/testing/src/network-guard.ts
 * @description Makes a test that opens a connection outside the machine fail, so that tests stay deterministic and never depend on a service that is not a test container (TST-03).
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

import net from 'node:net';
import { testingError } from './errors.ts';

export interface NetworkGuardOptions {
  /** Hosts that a test may call besides the machine itself, for example a service of the CI network. Names or addresses. */
  readonly allow?: readonly string[];
}

const LOCAL = /^(localhost|ip6-localhost|0\.0\.0\.0|::|::1|(?:::ffff:)?127(?:\.\d{1,3}){3})$/i;

/** Whether a host is the machine itself: the containers of the tests publish their ports there. */
export function isLocalHost(host: string): boolean {
  return LOCAL.test(host.replace(/^\[(.*)\]$/, '$1'));
}

/** The options object of a call to `Socket.connect`, when it has one. */
function optionsOf(args: readonly unknown[]): object | undefined {
  const [first] = Array.isArray(args[0]) ? args[0] : args;
  return typeof first === 'object' && first !== null ? first : undefined;
}

/** The host and port that a call to `Socket.connect` is about, or `undefined` for a path on disk (a local socket). */
function targetOf(args: readonly unknown[]): { host: string; port: string } | undefined {
  // `net.connect` and the clients that wrap it hand `connect` the arguments already normalized, as `[options, callback]`.
  const [first, second] = Array.isArray(args[0]) ? args[0] : args;
  if (typeof first === 'object' && first !== null) {
    const path: unknown = Reflect.get(first, 'path');
    if (typeof path === 'string') return undefined;
    const host: unknown = Reflect.get(first, 'host');
    const port: unknown = Reflect.get(first, 'port');
    return {
      host: typeof host === 'string' ? host : 'localhost',
      port: typeof port === 'number' || typeof port === 'string' ? String(port) : '',
    };
  }
  if (
    typeof first === 'string' &&
    typeof second !== 'string' &&
    typeof second !== 'number' &&
    Number.isNaN(Number(first))
  ) {
    // connect(path)
    return undefined;
  }
  return { host: typeof second === 'string' ? second : 'localhost', port: String(first) };
}

type LookupCallback = (error: Error | null, address?: unknown, family?: number) => void;
type Lookup = (hostname: string, options: unknown, callback: LookupCallback) => void;

const addressesOf = (address: unknown): string[] =>
  (Array.isArray(address) ? address : [address]).map((entry: unknown) =>
    typeof entry === 'string' ? entry : String(Reflect.get(Object(entry), 'address')),
  );

/**
 * A caller that gives its own `lookup` (the guard of `http.fetch` pins the address that it checked) decides where a name goes. The name
 * alone says nothing then, so the connection is let through when the address that `lookup` answers is the machine itself or allowed.
 */
function checkedLookup(lookup: Lookup, fail: () => Error, isAllowed: (host: string) => boolean): Lookup {
  return (hostname, lookupOptions, callback) => {
    const done = typeof lookupOptions === 'function' ? lookupOptions : callback;
    const settings = typeof lookupOptions === 'function' ? {} : lookupOptions;
    lookup(hostname, settings, (error, address, family) => {
      if (error !== null) return done(error, address, family);
      if (addressesOf(address).every((entry) => isLocalHost(entry) || isAllowed(entry)))
        return done(null, address, family);
      return done(fail(), undefined, undefined);
    });
  };
}

const ORIGINAL = Symbol.for('bieberkit.network-guard.original');

/**
 * The `connect` of Node, whatever guards were installed over it. The newest guard decides alone, so a test of the guard, or a suite with
 * a host of its own to allow, is not at the mercy of the guard that the setup file installed.
 */
function unguardedConnect(): (this: net.Socket, ...args: unknown[]) => unknown {
  const stored: unknown = Reflect.get(net.Socket.prototype, ORIGINAL);
  const found: unknown = typeof stored === 'function' ? stored : Reflect.get(net.Socket.prototype, 'connect');
  if (typeof found !== 'function') throw new TypeError('net.Socket has no connect.');
  if (typeof stored !== 'function') Reflect.set(net.Socket.prototype, ORIGINAL, found);
  return function connect(this: net.Socket, ...args: unknown[]): unknown {
    return Reflect.apply(found, this, args);
  };
}

/**
 * Makes every connection to a host that is not the machine fail with `TEST_NETWORK_BLOCKED`, before a name is looked up and before a
 * packet leaves. `fetch`, `http`, `https`, the database drivers and the Redis client all open a `net.Socket`, so one guard covers
 * them. A local socket (a path) is let through. It answers a function that takes the guard away again.
 */
export function installNetworkGuard(options: NetworkGuardOptions = {}): () => void {
  const allowed = new Set((options.allow ?? []).map((host) => host.toLowerCase()));
  const previous: unknown = Reflect.get(net.Socket.prototype, 'connect');
  const original = unguardedConnect();
  const isAllowed = (host: string): boolean => allowed.has(host.toLowerCase());
  net.Socket.prototype.connect = function guarded(this: net.Socket, ...args: unknown[]): net.Socket {
    const target = targetOf(args);
    if (target !== undefined && !isLocalHost(target.host) && !isAllowed(target.host)) {
      const fail = (): Error =>
        testingError(
          'TEST_NETWORK_BLOCKED',
          `A test opened a connection to ${target.host}${target.port === '' ? '' : `:${target.port}`}, which is not a test container.`,
          'Use a fake or a test container on this machine. A host of the CI network goes in the allow list of installNetworkGuard.',
        );
      const given = optionsOf(args);
      const lookup: unknown = given === undefined ? undefined : Reflect.get(given, 'lookup');
      if (given === undefined || typeof lookup !== 'function') {
        process.nextTick(() => this.destroy(fail()));
        return this;
      }
      // The name goes to the lookup of the caller, and the connection is judged by the address that it answers.
      // oxlint-disable-next-line typescript/no-unsafe-type-assertion
      const wrapped = checkedLookup(lookup as Lookup, fail, isAllowed);
      const checked = { ...given, lookup: wrapped };
      if (Array.isArray(args[0])) args[0][0] = checked;
      else args[0] = checked;
    }
    // The arguments are the ones that the caller gave, and `connect` has many shapes.
    Reflect.apply(original, this, args);
    return this;
  };
  return () => {
    Reflect.set(net.Socket.prototype, 'connect', previous);
  };
}
