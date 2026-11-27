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

import { accountClient } from './account-client.ts';
import type { AccountClient } from './account-client.ts';
import { filterParams } from './lists.ts';
import { uploadName } from './files.ts';
import type { MediaFile } from './files.ts';
import { HISTORY_PATH, historyOf, historyQuery } from './related.ts';
import type { HistoryEntry } from './related.ts';
import type { BulkOutcome } from './lists.ts';
import type { BulkOperation, BulkResult, ListParams, Meta, MetaEntity, Page, Row, SessionUser } from './types.ts';

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
  /** On a 429: how many seconds to wait, when the server says (AUTH-06). */
  readonly retryAfter: number | undefined;

  constructor(
    status: number,
    code: string,
    message: string,
    fix: string,
    problems: readonly FieldProblem[] = [],
    current?: Row,
    retryAfter?: number,
  ) {
    super(message);
    this.name = 'AdminApiError';
    this.status = status;
    this.code = code;
    this.fix = fix;
    this.problems = problems;
    this.current = current;
    this.retryAfter = retryAfter;
  }
}

export interface AdminClientOptions {
  /** The origin of the API. Empty means the same origin, which is how the admin is served (UI-14). */
  readonly baseUrl?: string;
  readonly fetch?: typeof fetch;
}

/** What a right password gives: the session, or for an account with a second factor the step that asks for the code. */
export type SignInResult =
  | { readonly kind: 'signedIn'; readonly user: SessionUser }
  | { readonly kind: 'secondFactor' };

export interface AdminClient extends AccountClient {
  /** The user of the session, or `undefined` when nobody is signed in. */
  session(): Promise<SessionUser | undefined>;
  signIn(email: string, password: string): Promise<SignInResult>;
  signOut(): Promise<void>;
  meta(): Promise<Meta>;
  list(entity: MetaEntity, params?: ListParams): Promise<Page>;
  get(entity: MetaEntity, id: string): Promise<Row>;
  create(entity: MetaEntity, body: Row): Promise<Row>;
  /** `version` is the version that the person read (API-13). A stale one is a 412 with the current row. */
  update(entity: MetaEntity, id: string, body: Row, version: number): Promise<Row>;
  remove(entity: MetaEntity, id: string, version: number): Promise<void>;
  /**
   * Sends a file to the media library and answers its record, ready to be named by a field: the record is made, the file goes straight to
   * the storage with the signed URL, and the upload is confirmed (ADR 0036). A disk that cannot sign is an `AdminApiError` with the code
   * `STORAGE_SIGNING_UNSUPPORTED`.
   */
  uploadFile(file: File): Promise<MediaFile>;
  /** The record of a file of the media library. */
  mediaFile(id: string): Promise<MediaFile>;
  /** An address that shows the file for a while. */
  mediaUrl(id: string): Promise<string>;
  /** What the audit log says about one row, newest first. A user without the permission of the audit log gets the error of the API. */
  history(entity: MetaEntity, id: string): Promise<readonly HistoryEntry[]>;
  /** A move of the state field of a row. `version` is the one that was read, and `input` is what the move asks for, if it asks for something. */
  transition(entity: MetaEntity, id: string, name: string, version: number, input?: Row): Promise<Row>;
  /** One change to many rows. The rows are `{ id, version }`, the version that the person read. Above 100 rows the server queues a job (API-14). */
  bulk(
    entity: MetaEntity,
    items: readonly { readonly id: string; readonly version: number }[],
    change: BulkOperation,
  ): Promise<BulkResult>;
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
    retryAfterOf(response),
  );
}

/** The API says `Retry-After`, and Better Auth says `X-Retry-After`. */
function retryAfterOf(response: Response): number | undefined {
  const header = response.headers.get('retry-after') ?? response.headers.get('x-retry-after');
  const seconds = header === null ? Number.NaN : Number(header);
  return Number.isInteger(seconds) && seconds >= 0 ? seconds : undefined;
}

function userOf(body: unknown): SessionUser | undefined {
  const user = isRecord(body) ? body['user'] : undefined;
  if (!isRecord(user) || typeof user['id'] !== 'string') return undefined;
  return { id: user['id'], email: text(user['email'], ''), name: text(user['name'], '') };
}

function signedInUser(body: unknown): SessionUser {
  const user = userOf(body);
  if (user === undefined)
    throw new AdminApiError(500, 'ADMIN_SIGN_IN_ANSWER', 'The server did not say who signed in.', '');
  return user;
}

function outcomeOf(value: Record<string, unknown>): BulkOutcome {
  const error = isRecord(value['error']) ? value['error'] : undefined;
  return {
    id: text(value['id'], ''),
    status: text(value['status'], 'invalid'),
    ...(typeof value['version'] === 'number' ? { version: value['version'] } : {}),
    ...(error === undefined ? {} : { error: { code: text(error['code'], ''), message: text(error['message'], '') } }),
  };
}

const MEDIA_PATH = '/api/v1/media';

function fileOf(body: unknown): MediaFile {
  const data = isRecord(body) && isRecord(body['data']) ? body['data'] : {};
  return {
    id: text(data['id'], ''),
    filename: text(data['filename'], ''),
    contentType: text(data['contentType'], ''),
    kind: text(data['kind'], ''),
    size: typeof data['size'] === 'number' ? data['size'] : 0,
    status: text(data['status'], ''),
  };
}

const rowOf = (body: unknown): Row => (isRecord(body) && isRecord(body['data']) ? body['data'] : {});

function queryOf(entity: MetaEntity, params: ListParams): string {
  const query = new URLSearchParams();
  query.set('page', String(params.page ?? 1));
  query.set('pageSize', String(params.pageSize ?? 25));
  query.set('withTotal', 'true');
  if (params.sort !== undefined && params.sort !== '') query.set('sort', params.sort);
  if (params.fields !== undefined && params.fields.length > 0) query.set('fields', params.fields.join(','));
  if (params.include !== undefined && params.include.length > 0) query.set('include', params.include.join(','));
  if (params.q !== undefined && params.q.trim() !== '') query.set('q', params.q.trim());
  for (const [name, value] of Object.entries(filterParams(entity, params.filters ?? []))) query.set(name, value);
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
    ...accountClient({
      request: (method, path, body) => request(method, path, body === undefined ? {} : { body }),
      userOf: signedInUser,
      isNotFound: (error) => error instanceof AdminApiError && error.status === 404,
    }),
    async session() {
      return userOf(await request('GET', '/api/auth/get-session'));
    },
    async signIn(email, password) {
      const body = await request('POST', '/api/auth/sign-in/email', { body: { email, password } });
      if (isRecord(body) && body['twoFactorRedirect'] === true) return { kind: 'secondFactor' };
      return { kind: 'signedIn', user: signedInUser(body) };
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
      const body = await request('GET', `${entity.path}${queryOf(entity, params)}`);
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
    async uploadFile(file) {
      const made = fileOf(
        await request('POST', MEDIA_PATH, {
          body: {
            filename: uploadName(file.name),
            contentType: file.type === '' ? 'application/octet-stream' : file.type,
            size: file.size,
          },
        }),
      );
      const signed = await request('POST', `${MEDIA_PATH}/${encodeURIComponent(made.id)}/upload-url`, { body: {} });
      const target = isRecord(signed) ? signed : {};
      const headers = isRecord(target['headers'])
        ? Object.fromEntries(Object.entries(target['headers']).map(([key, value]) => [key, text(value, '')]))
        : {};
      // The bytes go to the storage and not to this server, with the headers that were signed and no cookie.
      const sent = await call(text(target['url'], ''), {
        method: text(target['method'], 'PUT'),
        headers,
        body: file,
        credentials: 'omit',
      });
      if (!sent.ok)
        throw new AdminApiError(
          sent.status,
          'ADMIN_UPLOAD_REFUSED',
          'The storage did not take the file.',
          'Try again.',
        );
      await request('POST', `${MEDIA_PATH}/${encodeURIComponent(made.id)}/confirm`, { body: {} });
      return this.mediaFile(made.id);
    },
    async mediaFile(id) {
      return fileOf(await request('GET', `${MEDIA_PATH}/${encodeURIComponent(id)}`));
    },
    async mediaUrl(id) {
      const answer = await request('GET', `${MEDIA_PATH}/${encodeURIComponent(id)}/url`);
      return isRecord(answer) ? text(answer['url'], '') : '';
    },
    async history(entity, id) {
      return historyOf(await request('GET', `${HISTORY_PATH}${historyQuery(entity.name, id)}`));
    },
    async transition(entity, id, name, version, input) {
      return rowOf(
        await request('POST', `${entity.path}/${encodeURIComponent(id)}/actions/${encodeURIComponent(name)}`, {
          body: input ?? {},
          headers: { 'if-match': String(version) },
        }),
      );
    },
    async bulk(entity, items, change) {
      const body = await request('POST', `${entity.path}/bulk`, { body: { ...change, items } });
      const data = isRecord(body) ? body['data'] : undefined;
      if (Array.isArray(data)) return { kind: 'done', outcomes: data.filter(isRecord).map(outcomeOf) };
      if (isRecord(data) && typeof data['jobId'] === 'string') return { kind: 'queued', jobId: data['jobId'] };
      throw new AdminApiError(500, 'ADMIN_BULK_ANSWER', 'The server did not say what became of the rows.', '');
    },
    async remove(entity, id, version) {
      await request('DELETE', `${entity.path}/${encodeURIComponent(id)}`, {
        headers: { 'if-match': String(version) },
      });
    },
  };
}
