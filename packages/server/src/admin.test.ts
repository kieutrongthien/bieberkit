/**
 * BieberKit
 *
 * @file        packages/server/src/admin.test.ts
 * @description Tests of where the admin is served: a path of the application, a path of another host, or the root of a host of its own, and the addresses that are refused (UI-14, ADMIN_URL).
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
import { adminLocation } from './admin.ts';

const APP = 'https://example.com';

describe('UI-14 where the admin is served', () => {
  it('is /admin of the application when ADMIN_URL is not set', () => {
    expect(adminLocation(APP, undefined)).toEqual({ origin: 'https://example.com', host: undefined, prefix: '/admin' });
  });

  it('is any path of the application, with or without a slash at its end', () => {
    expect(adminLocation(APP, 'https://example.com/panel')).toEqual({
      origin: 'https://example.com',
      host: undefined,
      prefix: '/panel',
    });
    expect(adminLocation(APP, 'https://example.com/back/office/').prefix).toBe('/back/office');
  });

  it('is the root of a host of its own, and then only for that host', () => {
    expect(adminLocation(APP, 'https://admin.example.com')).toEqual({
      origin: 'https://admin.example.com',
      host: 'admin.example.com',
      prefix: '',
    });
    expect(adminLocation(APP, 'https://admin.example.com/')).toMatchObject({ host: 'admin.example.com', prefix: '' });
  });

  it('is a path of a host of its own, and the port is part of the host', () => {
    expect(adminLocation('http://localhost:3000', 'http://admin.localhost:3000/ops')).toEqual({
      origin: 'http://admin.localhost:3000',
      host: 'admin.localhost:3000',
      prefix: '/ops',
    });
    // The same host name on another port is another host.
    expect(adminLocation('http://localhost:3000', 'http://localhost:3001').host).toBe('localhost:3001');
  });

  it('is the root of the application itself, when the person wants no /admin at all', () => {
    expect(adminLocation(APP, 'https://example.com/')).toEqual({ origin: APP, host: undefined, prefix: '' });
  });

  it('refuses an address that is not a place: a query, a fragment, a login, a scheme that is not http, or a path of the API', () => {
    for (const bad of [
      'https://example.com/panel?x=1',
      'https://example.com/panel#top',
      'https://user:pw@example.com/panel',
      'ftp://example.com/panel',
      'https://example.com/api',
      'https://example.com/api/admin',
      'https://example.com/health',
      'https://example.com/metrics',
    ]) {
      expect(() => adminLocation(APP, bad)).toThrow(expect.objectContaining({ code: 'BK_ADMIN_URL_INVALID' }));
    }
  });
});
