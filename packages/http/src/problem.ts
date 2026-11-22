/**
 * BieberKit
 *
 * @file        packages/http/src/problem.ts
 * @description RFC 9457 problems: the error classes of the server and the mapping from any error to a problem (MOD-17, SEC-07).
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

import { STATUS_CODES } from 'node:http';
import { BkError } from '@bieberkit/core';
import type { ValidationIssue } from '@bieberkit/data/build';

/** An error of the HTTP layer: a `BkError` that may also set response headers, as `Retry-After` does. */
export class HttpError extends BkError {
  readonly headers: Readonly<Record<string, string>>;

  constructor(
    code: string,
    status: number,
    message: string,
    fix: string,
    headers: Readonly<Record<string, string>> = {},
    cause?: unknown,
  ) {
    super(message, { code, status, fix, ...(cause === undefined ? {} : { cause }) });
    this.headers = headers;
  }
}

/** A request that does not match the schema of its route. `errors` is what the problem lists. */
export class ValidationFailed extends HttpError {
  readonly errors: readonly { readonly path: string; readonly code: string; readonly message: string }[];

  constructor(issues: readonly ValidationIssue[]) {
    super(
      'HTTP_VALIDATION_FAILED',
      400,
      'The request is not valid.',
      'Fix the fields that `errors` lists, and send it again.',
    );
    this.errors = issues.map((issue) => ({ path: issue.path, code: issue.keyword, message: issue.message }));
  }
}

export interface Problem {
  readonly type: string;
  readonly title: string;
  readonly status: number;
  readonly detail: string;
  readonly code: string;
  readonly traceId: string;
  readonly instance: string;
  readonly fix?: string;
  readonly errors?: readonly { readonly path: string; readonly code: string; readonly message: string }[];
}

export interface ProblemContext {
  readonly traceId: string;
  /** The path of the request, without its query. */
  readonly instance: string;
  /** Whether the fix text of an error may be shown. It is written for the developer. */
  readonly showFix: boolean;
}

/** What Fastify says about a request that it refused before a route ran, as codes of ours. */
const FASTIFY_CODES: Readonly<Record<string, { status: number; code: string; detail: string }>> = {
  FST_ERR_CTP_BODY_TOO_LARGE: {
    status: 413,
    code: 'HTTP_BODY_TOO_LARGE',
    detail: 'The body is larger than the limit.',
  },
  FST_ERR_CTP_INVALID_MEDIA_TYPE: {
    status: 415,
    code: 'HTTP_UNSUPPORTED_MEDIA_TYPE',
    detail: 'Send application/json.',
  },
  FST_ERR_CTP_INVALID_JSON_BODY: { status: 400, code: 'HTTP_BODY_INVALID', detail: 'The body is not valid JSON.' },
  FST_ERR_CTP_EMPTY_JSON_BODY: {
    status: 400,
    code: 'HTTP_BODY_INVALID',
    detail: 'The body is empty, and JSON was expected.',
  },
  FST_ERR_CTP_INVALID_CONTENT_LENGTH: {
    status: 400,
    code: 'HTTP_BODY_INVALID',
    detail: 'The content length does not match the body.',
  },
  FST_ERR_NOT_FOUND: { status: 404, code: 'HTTP_NOT_FOUND', detail: 'There is no such route.' },
};

function fastifyError(error: unknown): { status: number; code: string; detail: string } | undefined {
  if (typeof error !== 'object' || error === null) return undefined;
  const code: unknown = Reflect.get(error, 'code');
  if (typeof code === 'string' && code in FASTIFY_CODES) return FASTIFY_CODES[code];
  const status: unknown = Reflect.get(error, 'statusCode');
  if (
    typeof status === 'number' &&
    status >= 400 &&
    status < 500 &&
    typeof code === 'string' &&
    code.startsWith('FST_')
  ) {
    return { status, code: 'HTTP_BAD_REQUEST', detail: 'The request could not be handled.' };
  }
  return undefined;
}

export interface Described {
  readonly problem: Problem;
  readonly headers: Readonly<Record<string, string>>;
  /** True for an error that is a bug of ours and not a refusal of the request. The caller logs and reports it. */
  readonly bug: boolean;
  /** What the problem came from, for the log. */
  readonly source: unknown;
}

function titleOf(status: number): string {
  return STATUS_CODES[status] ?? 'Error';
}

/** Turns any thrown value into the problem that the client gets (MOD-17). Nothing of `message` or `cause` of a bug is in it. */
export function describeError(error: unknown, context: ProblemContext): Described {
  const known = error instanceof BkError ? error : undefined;
  const fastify = known === undefined ? fastifyError(error) : undefined;
  const status = known?.status ?? fastify?.status ?? 500;
  const code = known?.code ?? fastify?.code ?? 'HTTP_INTERNAL';
  const detail = known?.safeMessage ?? fastify?.detail ?? 'Something went wrong.';
  const fix = known?.fix ?? '';
  const problem: Problem = {
    type: `urn:bieberkit:error:${code}`,
    title: titleOf(status),
    status,
    detail,
    code,
    traceId: context.traceId,
    instance: context.instance,
    ...(context.showFix && fix !== '' ? { fix } : {}),
    ...(error instanceof ValidationFailed ? { errors: error.errors } : {}),
  };
  return {
    problem,
    headers: error instanceof HttpError ? error.headers : {},
    bug: status >= 500,
    source: error,
  };
}
