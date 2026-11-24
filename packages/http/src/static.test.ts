/**
 * BieberKit
 *
 * @file        packages/http/src/static.test.ts
 * @description Tests of the static files under a prefix: the files with their types and cache rules, the fallback of a single page app, a path that leaves the folder, and the policy of the page (UI-14, SEC-01, UI-08).
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

import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { createHttpServer } from './server.ts';
import { serveStatic } from './static.ts';

const folders: string[] = [];
afterEach(() => {
  for (const folder of folders.splice(0)) rmSync(folder, { recursive: true, force: true });
});

const POLICY = "default-src 'none'; script-src 'self'";

function app() {
  const root = mkdtempSync(join(tmpdir(), 'bk-static-'));
  folders.push(root);
  writeFileSync(join(root, 'index.html'), '<!doctype html><title>app</title>');
  mkdirSync(join(root, 'assets'));
  writeFileSync(join(root, 'assets', 'main-abc123.js'), 'console.log(1)');
  writeFileSync(join(root, 'assets', 'logo.png'), Buffer.from([0x89, 0x50, 0x4e, 0x47, 0, 255, 128]));
  writeFileSync(join(root, '..secret.txt'), 'x');
  const server = createHttpServer({ APP_ENV: 'test', APP_PORT: 0, TRUST_PROXY: false, API_DOCS_PUBLIC: false });
  serveStatic(server, { prefix: '/admin', directory: root, policy: POLICY });
  return { server, root };
}

describe('UI-14 static files under a prefix', () => {
  it('UI-08 serves a file with its type, and a file with a hash in a folder of assets is cached for a year', async () => {
    const { server } = app();
    const script = await server.inject({ method: 'GET', url: '/admin/assets/main-abc123.js' });
    expect(script.statusCode).toBe(200);
    expect(script.headers['content-type']).toContain('text/javascript');
    expect(script.headers['cache-control']).toBe('public, max-age=31536000, immutable');
    expect(script.body).toBe('console.log(1)');
  });

  it('UI-08 sends a binary file as it is', async () => {
    const { server } = app();
    const { port } = await server.listen({ port: 0, host: '127.0.0.1' });
    try {
      const png = await fetch(`http://127.0.0.1:${String(port)}/admin/assets/logo.png`);
      expect(png.headers.get('content-type')).toBe('image/png');
      expect(Buffer.from(await png.arrayBuffer()).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0, 255, 128]))).toBe(
        true,
      );
    } finally {
      await server.stop({ drainMs: 0 });
    }
  });

  it('UI-14 gives the page its own policy, and never caches it', async () => {
    const { server } = app();
    const page = await server.inject({ method: 'GET', url: '/admin/' });
    expect(page.statusCode).toBe(200);
    expect(page.headers['content-security-policy']).toBe(POLICY);
    expect(page.headers['cache-control']).toBe('no-cache');
    expect(page.headers['x-content-type-options']).toBe('nosniff');
    expect(page.body).toContain('<title>app</title>');
  });

  it('UI-14 answers a path with no file and no extension with the page, so a route of the app survives a reload', async () => {
    const { server } = app();
    const route = await server.inject({ method: 'GET', url: '/admin/settings/settings/new' });
    expect(route.statusCode).toBe(200);
    expect(route.body).toContain('<title>app</title>');
  });

  it('UI-14 answers a missing file with an extension 404, and not the page', async () => {
    const { server } = app();
    const missing = await server.inject({ method: 'GET', url: '/admin/assets/gone.js' });
    expect(missing.statusCode).toBe(404);
    expect(missing.body).not.toContain('<title>');
  });

  it('SEC-01 refuses a path that leaves the folder, however it is written', async () => {
    const { server } = app();
    for (const url of [
      '/admin/../secret',
      '/admin/%2e%2e/%2e%2e/etc/passwd',
      '/admin/assets/..%2f..%2f..secret.txt',
      '/admin/%00',
      '/admin/assets/%5c..%5c..secret.txt',
    ]) {
      const reply = await server.inject({ method: 'GET', url });
      expect([url, reply.statusCode === 200 && reply.body === 'x']).toEqual([url, false]);
    }
  });

  it('SEC-01 a method that writes is 405, and the other mounted answers are not affected', async () => {
    const { server } = app();
    expect((await server.inject({ method: 'POST', url: '/admin/', payload: {} })).statusCode).toBe(405);
    expect((await server.inject({ method: 'GET', url: '/health/live' })).statusCode).toBe(200);
  });
});
