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

import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { serveStatic } from '@bieberkit/http';
import { cssVariables, DEFAULT_THEME, parseTheme } from '@bieberkit/tokens';
import type { Theme } from '@bieberkit/tokens';
import type { AdminSettings } from '@bieberkit/admin-core';
import type { HttpServer } from '@bieberkit/http';
import { retainAssets } from './admin-assets.ts';
import { ServerError } from './errors.ts';

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
/**
 * The origin of the storage that the browser reaches with a signed URL: the endpoint of an S3 disk, or the host of the bucket of AWS. The
 * local disk has none, because the browser never talks to it. The admin may send a file there (`connect-src`) and show a picture from
 * there (`img-src`), and nothing else is added to the policy (ADR 0036).
 */
export function storageOrigin(env: {
  readonly STORAGE_DISK: string;
  readonly S3_BUCKET: string | undefined;
  readonly S3_REGION: string | undefined;
  readonly S3_ENDPOINT: string | undefined;
  readonly S3_FORCE_PATH_STYLE: boolean;
}): string | undefined {
  if (env.STORAGE_DISK !== 's3') return undefined;
  try {
    if (env.S3_ENDPOINT !== undefined) {
      const endpoint = new URL(env.S3_ENDPOINT);
      // A bucket in the host name (virtual hosted style) is another origin than the endpoint.
      return env.S3_FORCE_PATH_STYLE || env.S3_BUCKET === undefined
        ? endpoint.origin
        : `${endpoint.protocol}//${env.S3_BUCKET}.${endpoint.host}`;
    }
    return env.S3_BUCKET === undefined
      ? undefined
      : `https://${env.S3_BUCKET}.s3.${env.S3_REGION ?? 'us-east-1'}.amazonaws.com`;
  } catch {
    return undefined;
  }
}

/** The policy of the admin, with the storage origin in the two places where the browser uses it. */
export function policyFor(storage?: string): string {
  if (storage === undefined) return ADMIN_POLICY;
  return ADMIN_POLICY.replace("img-src 'self' data:", `img-src 'self' data: ${storage}`).replace(
    "connect-src 'self'",
    `connect-src 'self' ${storage}`,
  );
}

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
 * The folder of the built admin of the project: `public/admin`, which the image of the server holds (DEP-06), else
 * `apps/admin/dist`, which `bieberkit build` writes (UI-37). `undefined` when there is none.
 */
export function adminDirectory(root: string): string | undefined {
  return [join(root, 'public', 'admin'), join(root, 'apps', 'admin', 'dist')].find((folder) =>
    existsSync(join(folder, 'index.html')),
  );
}

/** Whether the project has an admin, built or not: `bieberkit dev` serves it from its source and builds no file. */
export function hasAdmin(root: string): boolean {
  return existsSync(join(root, 'apps', 'admin', 'package.json')) || adminDirectory(root) !== undefined;
}

const escapeAttribute = (text: string): string =>
  text.replaceAll('&', '&amp;').replaceAll('"', '&quot;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');

/** Data that the adapter reads from the page. */
const dataMeta = (name: string, value: unknown): string =>
  `<meta name="${name}" content="${escapeAttribute(JSON.stringify(value))}" />`;

/**
 * The page of the application, told where it lives and what it looks like: its files from the prefix, the prefix for the router, the
 * theme of the config as CSS variables (a style, which the policy allows) and as data for the adapter (UI-06, TOK-02), and the brand
 * and the menu of the project as data (UI-24, UI-33). None of it is in the build, so a change of the config is a restart and not a
 * build (UI-14).
 */
export function pageAt(prefix: string, theme: Theme, settings: AdminSettings = {}): (html: string) => string {
  const style = `<style id="bk-theme">${cssVariables(theme)}</style>`;
  const head = `<meta name="bk-admin-base" content="${prefix}" />${dataMeta('bk-theme', theme)}${dataMeta('bk-admin', settings)}${style}</head>`;
  const name = settings.brand?.name;
  return (html) => {
    // The build writes the files as `./assets/...`, which is right at the root of a folder and wrong at a route under it.
    const placed = html.replaceAll(/(["'(])\.\//g, `$1${prefix}/`);
    // The replacements are functions, so that a `$` in a text of the config stays a letter.
    const titled =
      name === undefined
        ? placed
        : placed.replace(/<title>[^<]*<\/title>/, () => `<title>${escapeAttribute(name)}</title>`);
    return titled.replace('</head>', () => head);
  };
}

/** `pageAt` for a project: its theme and its `admin` key. The dev server of the admin writes its page with it (UI-37). */
export function adminPageOf(
  config: { readonly theme?: unknown; readonly admin?: AdminSettings | undefined },
  prefix: string,
): (html: string) => string {
  return pageAt(prefix, parseTheme(config.theme), config.admin);
}

/** Serves the built admin where `location` says, when there is one. It answers whether it did. */
export function registerAdmin(
  server: HttpServer,
  root: string,
  location: AdminLocation,
  theme: Theme = DEFAULT_THEME,
  /** Where the hashed files of the releases before are kept for a day (UI-22). Without it the admin serves its own build only. */
  retained?: string,
  /** The origin of the storage that the browser reaches with a signed URL, when there is one. */
  storage?: string,
  /** The `admin` key of the config: the brand and the menu of the project (UI-24, UI-33). */
  settings: AdminSettings = {},
): boolean {
  const directory = adminDirectory(root);
  if (directory === undefined) return false;
  if (retained !== undefined) retainAssets({ source: directory, retained, now: Date.now() });
  serveStatic(server, {
    ...(retained === undefined ? {} : { retained }),
    prefix: location.prefix,
    directory,
    policy: policyFor(storage),
    transformPage: pageAt(location.prefix, theme, settings),
    ...(location.host === undefined ? {} : { host: location.host }),
  });
  return true;
}
