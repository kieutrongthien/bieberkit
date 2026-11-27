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

function withRetained() {
  const { root } = app();
  const kept = mkdtempSync(join(tmpdir(), 'bk-static-kept-'));
  folders.push(kept);
  mkdirSync(join(kept, 'assets'));
  writeFileSync(join(kept, 'assets', 'old-111.js'), 'console.log("old")');
  writeFileSync(join(kept, 'assets', 'main-abc123.js'), 'console.log("kept copy")');
  writeFileSync(join(kept, 'index.html'), 'not the page');
  const server = createHttpServer({ APP_ENV: 'test', APP_PORT: 0, TRUST_PROXY: false, API_DOCS_PUBLIC: false });
  serveStatic(server, { prefix: '/admin', directory: root, policy: POLICY, retained: kept });
  return server;
}

describe('UI-22 the hashed files of the release before', () => {
  it('UI-22 a hashed file that the build does not have is served from the folder of the retained ones, with the cache of any hashed file', async () => {
    const server = withRetained();
    const old = await server.inject({ method: 'GET', url: '/admin/assets/old-111.js' });
    expect(old.statusCode).toBe(200);
    expect(old.body).toBe('console.log("old")');
    expect(old.headers['cache-control']).toBe('public, max-age=31536000, immutable');
  });

  it('UI-22 the build comes first: a file that it has is its own, and the retained folder never gives the page or a path outside assets', async () => {
    const server = withRetained();
    expect((await server.inject({ method: 'GET', url: '/admin/assets/main-abc123.js' })).body).toBe('console.log(1)');
    expect((await server.inject({ method: 'GET', url: '/admin/' })).body).toContain('<title>app</title>');
    expect((await server.inject({ method: 'GET', url: '/admin/assets/../index.html' })).body).not.toBe('not the page');
  });

  it('UI-22 a file that no release has is a 404, so the admin knows to reload', async () => {
    const server = withRetained();
    expect((await server.inject({ method: 'GET', url: '/admin/assets/gone-999.js' })).statusCode).toBe(404);
  });
});

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

function adminServer(options: { prefix: string; host?: string; transformPage?: (html: string) => string }) {
  const root = mkdtempSync(join(tmpdir(), 'bk-static-'));
  folders.push(root);
  writeFileSync(join(root, 'index.html'), '<!doctype html><script src="./assets/main.js"></script>');
  mkdirSync(join(root, 'assets'));
  writeFileSync(join(root, 'assets', 'main.js'), 'console.log(1)');
  const instance = createHttpServer({ APP_ENV: 'test', APP_PORT: 0, TRUST_PROXY: false, API_DOCS_PUBLIC: false });
  instance.route({
    method: 'GET',
    url: '/api/v1/ping',
    public: true,
    schema: { response: { 200: { type: 'object', properties: { pong: { type: 'boolean' } }, required: ['pong'] } } },
    handler: () => ({ pong: true }),
  });
  serveStatic(instance, { directory: root, policy: POLICY, ...options });
  return instance;
}

describe('UI-14 the admin at any address', () => {
  it('serves a page that the application gives its own address, through a transform of the page', async () => {
    const instance = adminServer({ prefix: '/panel', transformPage: (html) => html.replaceAll('./', '/panel/') });
    const page = await instance.inject({ method: 'GET', url: '/panel/settings/new' });
    expect(page.statusCode).toBe(200);
    expect(page.body).toContain('src="/panel/assets/main.js"');
    expect((await instance.inject({ method: 'GET', url: '/admin/' })).statusCode).toBe(404);
  });

  it('serves only the requests for its own host, and the other hosts get a 404', async () => {
    const instance = adminServer({ prefix: '/panel', host: 'admin.example.com' });
    const own = await instance.inject({ method: 'GET', url: '/panel/', headers: { host: 'admin.example.com' } });
    expect(own.statusCode).toBe(200);
    const other = await instance.inject({ method: 'GET', url: '/panel/', headers: { host: 'example.com' } });
    expect(other.statusCode).toBe(404);
  });

  it('serves the root of a host as a fallback: the page for a route of the application, and the files', async () => {
    const instance = adminServer({ prefix: '', host: 'admin.example.com' });
    const headers = { host: 'admin.example.com' };
    expect((await instance.inject({ method: 'GET', url: '/', headers })).statusCode).toBe(200);
    expect((await instance.inject({ method: 'GET', url: '/settings/settings/new', headers })).body).toContain(
      '<script',
    );
    const asset = await instance.inject({ method: 'GET', url: '/assets/main.js', headers });
    expect([asset.statusCode, asset.headers['cache-control']]).toEqual([200, 'public, max-age=31536000, immutable']);
    expect((await instance.inject({ method: 'GET', url: '/', headers: { host: 'example.com' } })).statusCode).toBe(404);
  });

  it('keeps the API, the probes and the metrics out of the root: they answer as they do, and a missing one is the problem of the API', async () => {
    const instance = adminServer({ prefix: '' });
    expect((await instance.inject({ method: 'GET', url: '/api/v1/ping' })).statusCode).toBe(200);
    expect((await instance.inject({ method: 'GET', url: '/health/live' })).statusCode).toBe(200);
    const missing = await instance.inject({ method: 'GET', url: '/api/v1/nope' });
    expect(missing.statusCode).toBe(404);
    expect(JSON.parse(missing.body)).toMatchObject({ code: 'HTTP_NOT_FOUND' });
    expect((await instance.inject({ method: 'GET', url: '/metrics' })).body).not.toContain('<script');
  });

  it('answers a method that writes at the root with a 404 problem, since it is no page of ours, and a second fallback is refused', async () => {
    const instance = adminServer({ prefix: '' });
    expect((await instance.inject({ method: 'POST', url: '/', payload: {} })).statusCode).toBe(404);
    expect(() => serveStatic(instance, { prefix: '', directory: '/tmp', policy: POLICY })).toThrow(/fallback/);
  });
});
