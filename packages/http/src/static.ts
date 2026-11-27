/**
 * BieberKit
 *
 * @file        packages/http/src/static.ts
 * @description Serves the files of a folder under a prefix, with their types, the cache rules of hashed assets, the fallback of a single page app, and a policy of its own for the page (UI-14, SEC-01, UI-08).
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

import { readFile } from 'node:fs/promises';
import { extname, join, normalize, sep } from 'node:path';
import type { HttpServer } from './server.ts';

export interface StaticOptions {
  /**
   * Where the files are served, such as `/admin`. An empty prefix is the root of the host, which is answered as a fallback after every
   * route, and never for the paths of the API, the probes and the metrics.
   */
  readonly prefix: string;
  /** Serve only the requests for this host, with its port (`admin.example.com`). Any other host gets a 404. */
  readonly host?: string;
  /** The folder of the built files. A request never leaves it. */
  readonly directory: string;
  /** The `Content-Security-Policy` of the page and of every file (SEC-01). */
  readonly policy: string;
  /**
   * A second folder for the hashed files of `assets/`: a file that the build does not have is looked for in it. It holds the files of
   * the releases that went before, so that a tab that was open at a deploy still finds its chunks (UI-22).
   */
  readonly retained?: string;
  /** The page that answers a path with no file and no extension. Defaults to `index.html`. */
  readonly fallback?: string;
  /** Changes a page (a file of type html) before it is sent, for what only the server knows, such as the place that it is served at. */
  readonly transformPage?: (html: string) => string;
}

/** What a page at the root of a host never answers: the API, the probes and the metrics (OBS-04). */
const RESERVED = ['/api/', '/health/', '/metrics'];

const TYPES: Readonly<Record<string, string>> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8',
};

const ONE_YEAR = 'public, max-age=31536000, immutable';

/** The path inside the folder that a URL names, or `undefined` when it names something that is not a plain path under the folder. */
function relativeOf(pathname: string, prefix: string): string | undefined {
  let decoded: string;
  try {
    decoded = decodeURIComponent(pathname.slice(prefix.length));
  } catch {
    return undefined;
  }
  if (decoded.includes('\0') || decoded.includes('\\')) return undefined;
  const clean = normalize(decoded.replace(/^\/+/, ''));
  if (clean === '..' || clean.startsWith(`..${sep}`) || clean.split(sep).includes('..')) return undefined;
  return clean === '.' ? '' : clean;
}

async function read(path: string): Promise<Buffer | undefined> {
  try {
    return await readFile(path);
  } catch {
    return undefined;
  }
}

/**
 * Serves `directory` under `prefix` (UI-14). A file is sent with its type, and one inside `assets/` is cached for a year, because its
 * name carries a hash of its content (UI-08). A path that has no file and no extension is a route of the application, so it gets the
 * page and the application reads the address (UI-02). Every answer carries `policy` and `nosniff`, and nothing outside `directory`
 * is ever read.
 */
export function serveStatic(server: HttpServer, options: StaticOptions): void {
  const fallback = options.fallback ?? 'index.html';
  const root = options.prefix === '';

  /** The answer for a request, or `undefined` when the request is not for these files. */
  async function answer(request: Request): Promise<Response | undefined> {
    const url = new URL(request.url);
    if (options.host !== undefined && url.host !== options.host) return undefined;
    const headers = { 'content-security-policy': options.policy, 'x-content-type-options': 'nosniff' };
    if (
      root &&
      RESERVED.some((reserved) => url.pathname === reserved.replace(/\/$/, '') || url.pathname.startsWith(reserved))
    )
      return undefined;
    if (request.method !== 'GET' && request.method !== 'HEAD') {
      return new Response('Method not allowed', { status: 405, headers: { ...headers, allow: 'GET, HEAD' } });
    }
    const relative = relativeOf(url.pathname, options.prefix);
    if (relative === undefined) return new Response('Not found', { status: 404, headers });
    const wanted = relative === '' ? fallback : relative;
    let file = wanted;
    let bytes = await read(join(options.directory, wanted));
    if (bytes === undefined && options.retained !== undefined && wanted.startsWith(`assets${sep}`)) {
      bytes = await read(join(options.retained, wanted));
    }
    if (bytes === undefined && extname(wanted) === '') {
      file = fallback;
      bytes = await read(join(options.directory, fallback));
    }
    if (bytes === undefined) return new Response('Not found', { status: 404, headers });
    const extension = extname(file).toLowerCase();
    const type = TYPES[extension] ?? 'application/octet-stream';
    const hashed = file.startsWith(`assets${sep}`);
    const body =
      extension === '.html' && options.transformPage !== undefined
        ? Buffer.from(options.transformPage(bytes.toString('utf8')))
        : bytes;
    return new Response(new Uint8Array(body), {
      status: 200,
      headers: { ...headers, 'content-type': type, 'cache-control': hashed ? ONE_YEAR : 'no-cache' },
    });
  }

  if (root) {
    server.fallback(answer);
    return;
  }
  server.mount({
    prefix: options.prefix,
    handler: async (request) => (await answer(request)) ?? new Response('Not found', { status: 404 }),
  });
}
