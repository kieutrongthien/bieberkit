/**
 * BieberKit
 *
 * @file        packages/server/src/admin.ts
 * @description Serves the admin under /admin/ when the project has an admin adapter installed: it finds the built files of the package and serves them with the policy of the admin (UI-10, UI-14, SEC-01).
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

import { existsSync, realpathSync } from 'node:fs';
import { join } from 'node:path';
import { serveStatic } from '@bieberkit/http';
import { cssVariables, DEFAULT_THEME } from '@bieberkit/tokens';
import type { Theme } from '@bieberkit/tokens';
import type { HttpServer } from '@bieberkit/http';
import { retainAssets } from './admin-assets.ts';
import { ServerError } from './errors.ts';

/** The adapter that the framework maintains (UI-10). A project that installs another one sets its name in `admin.adapter` later. */
export const ADMIN_PACKAGE = '@bieberkit/admin-antd';

/** Where the admin is served when `ADMIN_URL` says nothing (UI-14). */
export const ADMIN_PREFIX = '/admin';

/** The first segments of a path that belong to the server: the API, the probes and the metrics. */
const RESERVED = new Set(['api', 'health', 'metrics']);

/** Where the admin is: on which host, and under which path. */
export interface AdminLocation {
  /** `https://admin.example.com`: the origin that a browser opens it from. It is trusted by the sign in (a cookie is host only). */
  readonly origin: string;
  /** Set when the admin has a host of its own: only the requests for it are the admin's. Includes the port. */
  readonly host: string | undefined;
  /** `/admin`, `/panel`, or `''` for the root of the host. Never ends with a slash. */
  readonly prefix: string;
}

const refused = (address: string, why: string): ServerError =>
  new ServerError(`ADMIN_URL "${address}" is not a place for the admin: ${why}.`, {
    code: 'BK_ADMIN_URL_INVALID',
    fix: 'Give an address of the form https://example.com/panel (a path of the application), https://admin.example.com (a host of its own), or leave ADMIN_URL out for /admin.',
  });

/**
 * Reads `ADMIN_URL` against `APP_URL`. A path of the host of the application is a prefix, a host that is not the application's is a
 * host of its own, and a path of nothing is the root. The admin is always on the same server as the API, so a browser calls the API
 * with the origin that it opened the page from, and there is no CORS to configure (UI-14).
 */
export function adminLocation(appUrl: string, adminUrl: string | undefined): AdminLocation {
  const app = new URL(appUrl);
  if (adminUrl === undefined) return { origin: app.origin, host: undefined, prefix: ADMIN_PREFIX };
  let url: URL;
  try {
    url = new URL(adminUrl);
  } catch {
    throw refused(adminUrl, 'it is not an address');
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') throw refused(adminUrl, 'the scheme is http or https');
  if (url.search !== '' || url.hash !== '') throw refused(adminUrl, 'it has a query or a fragment');
  if (url.username !== '' || url.password !== '') throw refused(adminUrl, 'it has a login');
  const prefix = url.pathname.replace(/\/+$/, '');
  const first = prefix.split('/')[1];
  if (first !== undefined && RESERVED.has(first)) throw refused(adminUrl, `/${first} is the path of the server`);
  return { origin: url.origin, host: url.host === app.host ? undefined : url.host, prefix };
}

/**
 * The policy of the admin (UI-14, SEC-01). Its files are static, so the policy is fixed: scripts only from the same origin, no frame,
 * no form that leaves the origin. `style-src` allows inline styles because Ant Design writes its tokens as style elements at run time
 * and a static file cannot carry a nonce (ADR 0025).
 */
export const ADMIN_POLICY: string = [
  "default-src 'none'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data:",
  "font-src 'self' data:",
  "connect-src 'self'",
  "base-uri 'none'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join('; ');

/**
 * The folder of the built admin of the project, or `undefined` when no adapter is installed. The adapter is a dependency of the
 * server app (or of the root), so it is in the `node_modules` of one of the two, and its application is `dist/app` in the package.
 * Only these two places are looked at: a package that happens to be on the path of the process is not the adapter of this project.
 */
export function adminDirectory(root: string): string | undefined {
  for (const base of [join(root, 'apps', 'server'), root]) {
    try {
      const folder = join(realpathSync(join(base, 'node_modules', ADMIN_PACKAGE)), 'dist', 'app');
      if (existsSync(join(folder, 'index.html'))) return folder;
    } catch {
      // Not installed here. Try the next place.
    }
  }
  return undefined;
}

const escapeAttribute = (text: string): string =>
  text.replaceAll('&', '&amp;').replaceAll('"', '&quot;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');

/**
 * The page of the application, told where it lives and what it looks like: its files from the prefix, the prefix for the router, and
 * the theme of the config as CSS variables (a style, which the policy allows) and as data for the adapter (UI-06, TOK-02). The theme
 * is not in the build, so a change of the config is a restart and not a build (UI-14).
 */
export function pageAt(prefix: string, theme: Theme): (html: string) => string {
  const style = `<style id="bk-theme">${cssVariables(theme)}</style>`;
  const data = `<meta name="bk-theme" content="${escapeAttribute(JSON.stringify(theme))}" />`;
  return (html) =>
    html
      // The build writes the files as `./assets/...`, which is right at the root of a folder and wrong at a route under it.
      .replaceAll(/(["'(])\.\//g, `$1${prefix}/`)
      .replace('</head>', `<meta name="bk-admin-base" content="${prefix}" />${data}${style}</head>`);
}

/** Serves the admin where `location` says, when an adapter is installed. It answers whether it did. */
export function registerAdmin(
  server: HttpServer,
  root: string,
  location: AdminLocation,
  theme: Theme = DEFAULT_THEME,
  /** Where the hashed files of the releases before are kept for a day (UI-22). Without it the admin serves its own build only. */
  retained?: string,
): boolean {
  const directory = adminDirectory(root);
  if (directory === undefined) return false;
  if (retained !== undefined) retainAssets({ source: directory, retained, now: Date.now() });
  serveStatic(server, {
    ...(retained === undefined ? {} : { retained }),
    prefix: location.prefix,
    directory,
    policy: ADMIN_POLICY,
    transformPage: pageAt(location.prefix, theme),
    ...(location.host === undefined ? {} : { host: location.host }),
  });
  return true;
}
