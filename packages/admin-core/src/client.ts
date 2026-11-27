/**
 * BieberKit
 *
 * @file        packages/admin-core/src/client.ts
 * @description The client of the admin: the session, the metadata, and the list, get, create, update and delete of an entity, with the problem answers of RFC 9457 turned into one error (UI-02, API-13).
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

import type { ListParams, Meta, MetaEntity, Page, Row, SessionUser } from './types.ts';

/** One field that the server refused, from the `errors` of a validation problem. */
export interface FieldProblem {
  readonly path: string;
  readonly code: string;
  readonly message: string;
}

/** What a call that failed leaves: the status, the stable code, and what to do, as the API says them. */
export class AdminApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly fix: string;
  readonly problems: readonly FieldProblem[];
  /** On a 412: the row as it is now, so that the form can show what changed and who changed it (UI-18). */
  readonly current: Row | undefined;

  constructor(
    status: number,
    code: string,
    message: string,
    fix: string,
    problems: readonly FieldProblem[] = [],
    current?: Row,
  ) {
    super(message);
    this.name = 'AdminApiError';
    this.status = status;
    this.code = code;
    this.fix = fix;
    this.problems = problems;
    this.current = current;
  }
}

export interface AdminClientOptions {
  /** The origin of the API. Empty means the same origin, which is how the admin is served (UI-14). */
  readonly baseUrl?: string;
  readonly fetch?: typeof fetch;
}

export interface AdminClient {
  /** The user of the session, or `undefined` when nobody is signed in. */
  session(): Promise<SessionUser | undefined>;
  signIn(email: string, password: string): Promise<SessionUser>;
  signOut(): Promise<void>;
  meta(): Promise<Meta>;
  list(entity: MetaEntity, params?: ListParams): Promise<Page>;
  get(entity: MetaEntity, id: string): Promise<Row>;
  create(entity: MetaEntity, body: Row): Promise<Row>;
  /** `version` is the version that the person read (API-13). A stale one is a 412 with the current row. */
  update(entity: MetaEntity, id: string, body: Row, version: number): Promise<Row>;
  remove(entity: MetaEntity, id: string, version: number): Promise<void>;
}

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null;

const text = (value: unknown, fallback: string): string => (typeof value === 'string' ? value : fallback);

function problemsOf(value: unknown): FieldProblem[] {
  if (!Array.isArray(value)) return [];
  return value.filter(isRecord).map((item) => ({
    path: text(item['path'], ''),
    code: text(item['code'], ''),
    message: text(item['message'], ''),
  }));
}

async function failure(response: Response): Promise<AdminApiError> {
  let body: unknown;
  try {
    body = await response.json();
  } catch {
    body = undefined;
  }
  const problem = isRecord(body) ? body : {};
  // Better Auth answers `{ code, message }`, and the API answers a problem with `detail`, `fix` and `errors`.
  return new AdminApiError(
    response.status,
    text(problem['code'], `HTTP_${String(response.status)}`),
    text(problem['detail'], text(problem['message'], response.statusText)),
    text(problem['fix'], ''),
    problemsOf(problem['errors']),
    isRecord(problem['current']) ? problem['current'] : undefined,
  );
}

function userOf(body: unknown): SessionUser | undefined {
  const user = isRecord(body) ? body['user'] : undefined;
  if (!isRecord(user) || typeof user['id'] !== 'string') return undefined;
  return { id: user['id'], email: text(user['email'], ''), name: text(user['name'], '') };
}

const rowOf = (body: unknown): Row => (isRecord(body) && isRecord(body['data']) ? body['data'] : {});

function queryOf(params: ListParams): string {
  const query = new URLSearchParams();
  query.set('page', String(params.page ?? 1));
  query.set('pageSize', String(params.pageSize ?? 25));
  query.set('withTotal', 'true');
  if (params.sort !== undefined && params.sort !== '') query.set('sort', params.sort);
  if (params.fields !== undefined && params.fields.length > 0) query.set('fields', params.fields.join(','));
  return `?${query.toString()}`;
}

/** A client of the API of the application that serves the admin. It keeps no state: the session is the cookie of the browser. */
export function createAdminClient(options: AdminClientOptions = {}): AdminClient {
  const base = options.baseUrl ?? '';
  const call = options.fetch ?? ((input, init) => fetch(input, init));

  async function request(
    method: string,
    path: string,
    init: { readonly body?: unknown; readonly headers?: Readonly<Record<string, string>> } = {},
  ): Promise<unknown> {
    const response = await call(`${base}${path}`, {
      method,
      credentials: 'same-origin',
      headers: {
        accept: 'application/json',
        ...(init.body === undefined ? {} : { 'content-type': 'application/json' }),
        ...init.headers,
      },
      ...(init.body === undefined ? {} : { body: JSON.stringify(init.body) }),
    });
    if (!response.ok) throw await failure(response);
    if (response.status === 204) return undefined;
    const raw = await response.text();
    return raw === '' ? undefined : JSON.parse(raw);
  }

  return {
    async session() {
      return userOf(await request('GET', '/api/auth/get-session'));
    },
    async signIn(email, password) {
      const user = userOf(await request('POST', '/api/auth/sign-in/email', { body: { email, password } }));
      if (user === undefined)
        throw new AdminApiError(500, 'ADMIN_SIGN_IN_ANSWER', 'The server did not say who signed in.', '');
      return user;
    },
    async signOut() {
      await request('POST', '/api/auth/sign-out', { body: {} });
    },
    async meta() {
      const body = await request('GET', '/api/v1/_meta');
      // The shape is the one of META_SCHEMA, which the server checks before it sends it.
      // oxlint-disable-next-line typescript/no-unsafe-type-assertion
      return body as Meta;
    },
    async list(entity, params = {}) {
      const body = await request('GET', `${entity.path}${queryOf(params)}`);
      const data = isRecord(body) && Array.isArray(body['data']) ? body['data'] : [];
      const meta = isRecord(body) && isRecord(body['meta']) ? body['meta'] : {};
      return {
        rows: data.filter(isRecord),
        page: typeof meta['page'] === 'number' ? meta['page'] : (params.page ?? 1),
        pageSize: typeof meta['pageSize'] === 'number' ? meta['pageSize'] : (params.pageSize ?? 25),
        ...(typeof meta['total'] === 'number' ? { total: meta['total'] } : {}),
      };
    },
    async get(entity, id) {
      return rowOf(await request('GET', `${entity.path}/${encodeURIComponent(id)}`));
    },
    async create(entity, body) {
      return rowOf(await request('POST', entity.path, { body }));
    },
    async update(entity, id, body, version) {
      return rowOf(
        await request('PATCH', `${entity.path}/${encodeURIComponent(id)}`, {
          body,
          headers: { 'if-match': String(version) },
        }),
      );
    },
    async remove(entity, id, version) {
      await request('DELETE', `${entity.path}/${encodeURIComponent(id)}`, {
        headers: { 'if-match': String(version) },
      });
    },
  };
}
