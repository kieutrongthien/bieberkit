/**
 * BieberKit
 *
 * @file        packages/testing/src/network-guard.test.ts
 * @description Tests of the network guard: a call outside the machine fails at once with a code, and the machine itself, a local socket and the allowed hosts are let through (TST-03).
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
import net from 'node:net';
import { afterEach, describe, expect, it } from 'vitest';
import { installNetworkGuard, isLocalHost } from './network-guard.ts';

let uninstall: (() => void) | undefined;
afterEach(() => {
  uninstall?.();
  uninstall = undefined;
});

const settle = (socket: net.Socket): Promise<unknown> =>
  new Promise((resolve) => {
    socket.once('error', resolve);
    socket.once('connect', () => {
      socket.destroy();
      resolve('connected');
    });
  });

const viaPort = (port: number, host: string): Promise<unknown> => settle(net.connect(port, host));
const viaOptions = (options: net.NetConnectOpts): Promise<unknown> => settle(net.connect(options));
const viaPath = (path: string): Promise<unknown> => settle(net.connect(path));

describe('TST-03 the network guard', () => {
  it('TST-03 a connection to a host outside the machine fails with a code and a fix, before any lookup', async () => {
    uninstall = installNetworkGuard();
    for (const error of [await viaPort(443, 'example.com'), await viaOptions({ host: '93.184.216.34', port: 80 })]) {
      expect(error).toMatchObject({ code: 'TEST_NETWORK_BLOCKED' });
      expect(String(Reflect.get(Object(error), 'message'))).toContain('not a test container');
    }
  });

  it('TST-03 fetch to a host outside the machine fails too', async () => {
    uninstall = installNetworkGuard();
    const failure = await fetch('https://example.com/').catch((error: unknown) => error);
    expect(Reflect.get(Object(Reflect.get(Object(failure), 'cause')), 'code')).toBe('TEST_NETWORK_BLOCKED');
  });

  it('TST-03 the machine itself is let through, by name and by address', async () => {
    const server = createServer((_request, response) => response.end('ok'));
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const address = server.address();
    const port = address !== null && typeof address === 'object' ? address.port : 0;
    try {
      uninstall = installNetworkGuard();
      expect(await viaPort(port, '127.0.0.1')).toBe('connected');
      expect(await viaPort(port, 'localhost')).toBe('connected');
      const reply = await fetch(`http://127.0.0.1:${port}/`);
      expect(await reply.text()).toBe('ok');
    } finally {
      server.close();
    }
  });

  it('TST-03 a local socket, which is a path on disk, is let through', async () => {
    uninstall = installNetworkGuard();
    const error = await viaPath('/tmp/bieberkit-no-such-socket');
    // It tried to connect to the path, and the path is not there: the error is the one of the system, not the guard.
    expect(Reflect.get(Object(error), 'code')).toBe('ENOENT');
  });

  it('TST-03 a host on the allow list is let through, and one that is not on it still fails', async () => {
    uninstall = installNetworkGuard({ allow: ['ci-postgres'] });
    const allowed = await viaPort(5432, 'ci-postgres');
    expect(Reflect.get(Object(allowed), 'code')).not.toBe('TEST_NETWORK_BLOCKED');
    expect(await viaPort(5432, 'other-host')).toMatchObject({ code: 'TEST_NETWORK_BLOCKED' });
  });

  it('TST-03 taking the guard away gives the connection back', async () => {
    installNetworkGuard()();
    const error = await viaPort(9, 'localhost');
    expect(Reflect.get(Object(error), 'code')).not.toBe('TEST_NETWORK_BLOCKED');
  });

  it('TST-03 knows what the machine itself is called', () => {
    for (const host of ['localhost', '127.0.0.1', '127.1.2.3', '::1', '[::1]', '0.0.0.0', 'LOCALHOST'])
      expect({ host, local: isLocalHost(host) }).toEqual({ host, local: true });
    for (const host of ['example.com', '10.0.0.5', '192.168.1.1', '1.1.1.1', 'localhost.example.com'])
      expect({ host, local: isLocalHost(host) }).toEqual({ host, local: false });
  });
});
