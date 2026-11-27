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
import { validateConfig } from '@bieberkit/core';
import { parseTheme, themeSection } from '@bieberkit/tokens';
import { ADMIN_POLICY, adminLocation, pageAt, policyFor, storageOrigin } from './admin.ts';

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

describe('UI-06 the theme in the page of the admin', () => {
  const html = '<html><head><script src="./assets/a.js"></script></head><body></body></html>';

  it('UI-06 the page carries the theme as data for the adapter and as CSS variables, and the files are still those of the prefix', () => {
    const theme = parseTheme({ colors: { primary: '#0a7' }, radius: 9 });
    const page = pageAt('/panel', theme)(html);
    expect(page).toContain('<meta name="bk-admin-base" content="/panel" />');
    expect(page).toContain('<style id="bk-theme">:root {');
    expect(page).toContain('--bk-color-primary: #0a7;');
    expect(page).toContain('--bk-radius: 9px;');
    expect(page).toContain('src="/panel/assets/a.js"');
    const data = /<meta name="bk-theme" content="([^"]*)"/.exec(page)?.[1] ?? '';
    expect(
      JSON.parse(
        data.replaceAll('&quot;', '"').replaceAll('&lt;', '<').replaceAll('&gt;', '>').replaceAll('&amp;', '&'),
      ),
    ).toEqual(theme);
  });

  it('UI-06 nothing in the theme can close the attribute or the style: the data is escaped and the values are checked first', () => {
    const page = pageAt('', parseTheme(undefined))(html);
    expect(page.match(/<meta name="bk-theme" content="([^"]*)"/)).not.toBeNull();
    // Only the one style of the theme, which the page closes once.
    expect(page.split('</style>')).toHaveLength(2);
  });

  it('UI-06 the config accepts a theme through the section of the tokens package, and refuses a bad one with the key', () => {
    const base = {
      name: 'demo',
      author: 'A <a@example.com>',
      license: 'MIT',
      database: { dialect: 'sqlite' },
      tenancy: { mode: 'single' },
      locales: { default: 'en', supported: ['en'] },
      plugins: [],
    };
    expect(validateConfig({ ...base, theme: { radius: 4 } }, { sections: [themeSection] }).theme).toEqual({
      radius: 4,
    });
    expect(() => validateConfig({ ...base, theme: { radius: 99 } }, { sections: [themeSection] })).toThrow(/radius/);
    expect(() => validateConfig({ ...base, theme: { radius: 4 } })).toThrow(/theme/);
  });
});

describe('ADR 0036 the policy of the admin and the storage that it uploads to', () => {
  const s3 = {
    STORAGE_DISK: 's3',
    S3_BUCKET: 'files',
    S3_REGION: 'eu-west-1',
    S3_ENDPOINT: undefined,
    S3_FORCE_PATH_STYLE: false,
  };

  it('ADR 0036 the local disk adds nothing, because the browser never talks to it', () => {
    expect(storageOrigin({ ...s3, STORAGE_DISK: 'local' })).toBeUndefined();
    expect(policyFor(undefined)).toBe(ADMIN_POLICY);
  });

  it('ADR 0036 the origin is the endpoint with a path style, the bucket in the host with a virtual style, and the host of AWS without an endpoint', () => {
    expect(storageOrigin({ ...s3, S3_ENDPOINT: 'http://localhost:9000/ignored/path', S3_FORCE_PATH_STYLE: true })).toBe(
      'http://localhost:9000',
    );
    expect(storageOrigin({ ...s3, S3_ENDPOINT: 'https://acct.r2.cloudflarestorage.com' })).toBe(
      'https://files.acct.r2.cloudflarestorage.com',
    );
    expect(storageOrigin(s3)).toBe('https://files.s3.eu-west-1.amazonaws.com');
    expect(storageOrigin({ ...s3, S3_BUCKET: undefined })).toBeUndefined();
    expect(storageOrigin({ ...s3, S3_ENDPOINT: 'not a url' })).toBeUndefined();
  });

  it('ADR 0036 the origin is in connect-src and img-src and in no other directive, and the rest of the policy is the same', () => {
    const policy = policyFor('https://files.example.com');
    expect(policy).toContain("connect-src 'self' https://files.example.com");
    expect(policy).toContain("img-src 'self' data: https://files.example.com");
    expect(policy.match(/files\.example\.com/g)).toHaveLength(2);
    expect(policy.replaceAll(' https://files.example.com', '')).toBe(ADMIN_POLICY);
    expect(policy).toContain("script-src 'self'");
  });
});
