/**
 * BieberKit
 *
 * @file        packages/auth/src/config.test.ts
 * @description Tests of the fixed options of Better Auth: the cookie, the client IP, the ids, the telemetry, the exact version and the checks of the settings that come in (AUTH-01, AUTH-10, AUTH-11, P8).
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

import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { Database } from '@bieberkit/data/orm';
import { createAuth } from './better-auth.ts';

// A database that `createAuth` never touches: nothing here sends a query, so a bare object is enough.
// oxlint-disable-next-line typescript/no-unsafe-type-assertion
const DB = {} as unknown as Database;
const make = (extra: Partial<Parameters<typeof createAuth>[0]> = {}) =>
  createAuth({ db: DB, dialect: 'sqlite', secret: 'x'.repeat(40), baseUrl: 'https://app.test', ...extra });

describe('AUTH-10 the options of Better Auth', () => {
  it('AUTH-01 names the cookie __Host-bk_session, with its attributes, and never turns useSecureCookies on, which would prefix the name with __Secure-, even for an https base URL', () => {
    const { options } = make();
    expect(options.advanced?.cookies?.['session_token']).toEqual({
      name: '__Host-bk_session',
      attributes: { httpOnly: true, secure: true, sameSite: 'lax', path: '/' },
    });
    expect(options.advanced?.useSecureCookies).toBe(false);
  });

  it('AUTH-10 takes the client IP from x-bk-client-ip only', () => {
    expect(make().options.advanced?.ipAddress?.ipAddressHeaders).toEqual(['x-bk-client-ip']);
  });

  it('AUTH-10 makes UUIDv7 ids, and keeps the id generator that the UUID type needs', () => {
    const generate = make().options.advanced?.database?.generateId;
    expect(typeof generate).toBe('function');
    const id = typeof generate === 'function' ? generate({ model: 'authUser' }) : '';
    expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  });

  it('AUTH-10 stores accountId as externalId and names the models authUser, authSession, authAccount, authVerification, authRateLimit', () => {
    const { options } = make();
    expect(options.account?.fields?.accountId).toBe('externalId');
    expect([
      options.user?.modelName,
      options.session?.modelName,
      options.account?.modelName,
      options.verification?.modelName,
      options.rateLimit?.modelName,
    ]).toEqual(['authUser', 'authSession', 'authAccount', 'authVerification', 'authRateLimit']);
  });

  it('AUTH-10 keeps the rate limit in the database, switched on, never in memory', () => {
    const { rateLimit } = make().options;
    expect(rateLimit?.enabled).toBe(true);
    expect(rateLimit?.storage).not.toBe('memory');
  });

  it('AUTH-11 keeps the telemetry off', () => {
    expect(make().options.telemetry?.enabled).toBe(false);
  });

  it('AUTH-04 asks for 8 to 128 characters of password and no verification of the email until the project asks', () => {
    const { emailAndPassword } = make().options;
    expect(emailAndPassword).toMatchObject({
      enabled: true,
      minPasswordLength: 8,
      maxPasswordLength: 128,
      requireEmailVerification: false,
    });
  });

  it('P8 refuses a secret of fewer than 32 characters, and a base URL that is not a URL', () => {
    expect(() => make({ secret: 'short' })).toThrow(expect.objectContaining({ code: 'AUTH_CONFIG_INVALID' }));
    expect(() => make({ baseUrl: 'app.test' })).toThrow(expect.objectContaining({ code: 'AUTH_CONFIG_INVALID' }));
  });

  it('P8 reads no environment: the secret that comes in is the one that is used', () => {
    expect(make({ secret: 'y'.repeat(40) }).options.secret).toBe('y'.repeat(40));
  });
});

const ids = (methods?: Parameters<typeof createAuth>[0]['methods']) =>
  (make(methods === undefined ? {} : { methods }).options.plugins ?? [])
    .map((plugin) => plugin.id)
    .toSorted((a, b) => a.localeCompare(b));

describe('AUTH-01 the cookies and the secrets of the methods', () => {
  it('AUTH-01 every cookie of Better Auth is a __Host- cookie that is secure and for this host only', () => {
    const cookies = make().options.advanced?.cookies ?? {};
    expect(Object.keys(cookies).toSorted((a, b) => a.localeCompare(b))).toEqual([
      'better-auth-passkey',
      'dont_remember',
      'session_data',
      'session_token',
      'trust_device',
      'two_factor',
    ]);
    for (const cookie of Object.values(cookies)) {
      expect(cookie.name?.startsWith('__Host-bk_')).toBe(true);
      expect(cookie.attributes).toMatchObject({ httpOnly: true, secure: true, path: '/' });
      expect(cookie.attributes).not.toHaveProperty('domain');
    }
    expect(make().options.advanced?.defaultCookieAttributes).toMatchObject({ secure: true, httpOnly: true, path: '/' });
  });

  it('SEC-08 gives the secret and the previous ones to Better Auth as a list, the current first, each with a number that its text makes', () => {
    const list =
      make({ secret: 'a'.repeat(40), previousSecrets: ['b'.repeat(40), 'c'.repeat(40)] }).options.secrets ?? [];
    expect(list.map((item) => item.value)).toEqual(['a'.repeat(40), 'b'.repeat(40), 'c'.repeat(40)]);
    expect(new Set(list.map((item) => item.version)).size).toBe(3);
    const again = make({ secret: 'b'.repeat(40) }).options.secrets ?? [];
    expect(again[0]?.version).toBe(list[1]?.version);
  });

  it('AUTH-03 loads the plugin of a method that is asked for, and none of the others', () => {
    expect(ids()).toEqual([]);
    expect(ids({ totp: { issuer: 'x' } })).toEqual(['two-factor']);
    expect(ids({ passkey: { rpName: 'x' } })).toEqual(['passkey']);
    expect(ids({ magicLink: { send: async () => undefined } })).toEqual(['magic-link']);
    expect((make({ apiKeys: {} }).options.plugins ?? []).map((plugin) => plugin.id)).toEqual(['api-key']);
  });
});

describe('AUTH-11 the version of Better Auth', () => {
  it('AUTH-11 is pinned to one exact version of 1.7.16 or later, in the package and in its adapter', () => {
    const manifest: { dependencies: Record<string, string> } = JSON.parse(
      readFileSync(new URL('../package.json', import.meta.url), 'utf8'),
    );
    for (const name of ['better-auth', '@better-auth/kysely-adapter', '@better-auth/passkey', '@better-auth/api-key']) {
      const version = manifest.dependencies[name] ?? '';
      expect(version).toMatch(/^\d+\.\d+\.\d+$/);
      const [major = 0, minor = 0, patch = 0] = version.split('.').map(Number);
      expect(major * 1_000_000 + minor * 1_000 + patch).toBeGreaterThanOrEqual(1_007_016);
    }
    expect(manifest.dependencies['better-auth']).toBe(manifest.dependencies['@better-auth/kysely-adapter']);
    expect(manifest.dependencies['better-auth']).toBe(manifest.dependencies['@better-auth/passkey']);
    expect(manifest.dependencies['better-auth']).toBe(manifest.dependencies['@better-auth/api-key']);
  });
});
