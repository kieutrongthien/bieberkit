/**
 * BieberKit
 *
 * @file        packages/core/src/reporting/sentry.ts
 * @description A reporter for Sentry, GlitchTip and Bugsink: it builds the event and sends it to the envelope endpoint of the DSN, with no SDK (OBS-06).
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

import { randomUUID } from 'node:crypto';
import { BkError } from '../errors/errors.ts';
import type { Logger } from '../logging/logger.ts';
import type { ErrorReporter, ErrorReportContext } from './reporter.ts';

export interface SentryReporterOptions {
  /** `https://<public key>@<host>/<project id>`, the DSN that the server shows. */
  readonly dsn: string;
  readonly environment?: string;
  readonly release?: string;
  /** The share of reports that is sent, from 0 to 1. `fatal` reports are always sent. Defaults to 1. */
  readonly sampleRate?: number;
  /** Values that must never leave the process (the secrets of the environment). They are replaced in messages and stacks. */
  readonly secrets?: readonly string[];
  /** Reports sent in a minute at most; the rest are dropped and counted. Defaults to 60. */
  readonly maxPerMinute?: number;
  /** How long one send may take. Defaults to 5 seconds. */
  readonly timeoutMs?: number;
  readonly logger?: Logger;
  /** For tests. Defaults to the global `fetch`. */
  readonly fetch?: typeof fetch;
  readonly now?: () => number;
  readonly random?: () => number;
}

export interface ParsedDsn {
  readonly publicKey: string;
  readonly endpoint: string;
}

const REDACTED = '[redacted]';
const MAX_PENDING = 20;
const MAX_CAUSES = 5;
const THROTTLE_MS = 60_000;

function dsnError(dsn: string): BkError {
  return new BkError('The error reporter DSN is not valid.', {
    code: 'CFG_ERROR_REPORTER_DSN_INVALID',
    status: 500,
    fix: 'Use the DSN of the project, for example https://<key>@<host>/<project id>.',
    safeMessage: `ERROR_REPORTER_DSN is not valid (${dsn.length} characters).`,
  });
}

/** Reads a DSN: the key, the host, an optional path prefix and the project id. The secret part of an old DSN is ignored. */
export function parseDsn(dsn: string): ParsedDsn {
  let url: URL;
  try {
    url = new URL(dsn);
  } catch {
    throw dsnError(dsn);
  }
  const segments = url.pathname.split('/').filter((part) => part !== '');
  const project = segments.pop();
  if (
    (url.protocol !== 'https:' && url.protocol !== 'http:') ||
    url.username === '' ||
    project === undefined ||
    !/^\w+$/.test(project)
  ) {
    throw dsnError(dsn);
  }
  const prefix = segments.length === 0 ? '' : `/${segments.join('/')}`;
  return {
    publicKey: decodeURIComponent(url.username),
    endpoint: `${url.protocol}//${url.host}${prefix}/api/${project}/envelope/`,
  };
}

interface Frame {
  readonly filename: string;
  readonly function?: string;
  readonly lineno?: number;
  readonly colno?: number;
  readonly in_app: boolean;
}

const FRAME = /^\s*at (?:async )?(?:(.+?) \()?(.+?):(\d+):(\d+)\)?$/;

/** The frames of a V8 stack, oldest first as Sentry wants them. Lines that are not frames are left out. */
export function framesOf(stack: string | undefined): Frame[] {
  const frames: Frame[] = [];
  for (const line of (stack ?? '').split('\n')) {
    const match = FRAME.exec(line);
    if (match === null) continue;
    const filename = (match[2] ?? '').replace(/^file:\/\//, '');
    frames.push({
      filename,
      ...(match[1] === undefined ? {} : { function: match[1] }),
      lineno: Number(match[3]),
      colno: Number(match[4]),
      in_app: !filename.includes('node_modules') && !filename.startsWith('node:'),
    });
  }
  return frames.toReversed();
}

function exceptions(error: unknown, scrub: (text: string) => string) {
  const values: { type: string; value: string; stacktrace?: { frames: Frame[] } }[] = [];
  let current: unknown = error;
  for (let depth = 0; depth < MAX_CAUSES; depth += 1) {
    if (current instanceof Error) {
      const frames = framesOf(current.stack).map((frame) => ({ ...frame, filename: scrub(frame.filename) }));
      values.unshift({
        type: current.name,
        value: scrub(current.message),
        ...(frames.length === 0 ? {} : { stacktrace: { frames } }),
      });
      current = current.cause;
      if (current === undefined) break;
    } else {
      values.unshift({
        type: 'NonError',
        value: scrub(typeof current === 'string' ? current : 'A value that is not an Error was thrown.'),
      });
      break;
    }
  }
  return values;
}

const clip = (value: string): string => value.slice(0, 200);

/**
 * Sends reports to a Sentry compatible server through its envelope endpoint: Sentry, GlitchTip and Bugsink all take it. There is no SDK:
 * the event is plain JSON, the transport is `fetch`, and the whole file is what the project depends on (P9). A report is built now,
 * sent in the background, and dropped when the server is down, throttled or the budget of the minute is used. Reports carry ids and the
 * place of the error, never a body, a header, a query string or an e-mail.
 */
export function createSentryReporter(options: SentryReporterOptions): ErrorReporter {
  const { publicKey, endpoint } = parseDsn(options.dsn);
  const now = options.now ?? Date.now;
  const random = options.random ?? Math.random;
  const send = options.fetch ?? fetch;
  const sampleRate = options.sampleRate ?? 1;
  const maxPerMinute = options.maxPerMinute ?? 60;
  const timeoutMs = options.timeoutMs ?? 5_000;
  const secrets = (options.secrets ?? []).filter((secret) => secret.length >= 4);
  const pending = new Set<Promise<void>>();
  let windowStart = now();
  let inWindow = 0;
  let dropped = 0;
  let pausedUntil = 0;
  let lastWarning = 0;

  const scrub = (text: string): string => secrets.reduce((out, secret) => out.split(secret).join(REDACTED), text);
  const warn = (message: string, fields: Record<string, unknown>): void => {
    if (options.logger === undefined || now() - lastWarning < THROTTLE_MS) return;
    lastWarning = now();
    options.logger.warn(message, fields);
  };

  function eventOf(error: unknown, context: ErrorReportContext): { id: string; body: string } {
    const id = randomUUID().replaceAll('-', '');
    const tags: Record<string, string> = { source: context.source };
    if (context.tenantId !== undefined) tags['tenant_id'] = context.tenantId;
    if (error instanceof BkError) tags['code'] = error.code;
    if (context.job !== undefined) {
      tags['job'] = context.job.name;
      tags['queue'] = context.job.queue;
    }
    for (const [key, value] of Object.entries(context.tags ?? {})) tags[clip(key)] = clip(scrub(value));
    const event = {
      event_id: id,
      timestamp: now() / 1000,
      platform: 'node',
      level: context.level ?? 'error',
      ...(options.environment === undefined ? {} : { environment: options.environment }),
      ...(options.release === undefined ? {} : { release: options.release }),
      exception: { values: exceptions(error, scrub) },
      tags,
      ...(context.userId === undefined ? {} : { user: { id: context.userId } }),
      ...(context.traceId === undefined || !/^[0-9a-f]{32}$/.test(context.traceId)
        ? {}
        : {
            contexts: {
              trace: {
                trace_id: context.traceId,
                span_id: /^[0-9a-f]{16}$/.test(context.spanId ?? '')
                  ? context.spanId
                  : randomUUID().replaceAll('-', '').slice(0, 16),
              },
            },
          }),
      ...(context.http === undefined ? {} : { request: { method: context.http.method, url: context.http.path } }),
      extra: {
        ...(context.requestId === undefined ? {} : { requestId: context.requestId }),
        ...(context.http?.status === undefined ? {} : { status: context.http.status }),
        ...(context.job === undefined ? {} : { jobId: context.job.id, attempt: context.job.attempt }),
      },
    };
    const payload = JSON.stringify(event);
    const header = JSON.stringify({ event_id: id, sent_at: new Date(now()).toISOString() });
    const item = JSON.stringify({ type: 'event', length: Buffer.byteLength(payload) });
    return { id, body: `${header}\n${item}\n${payload}\n` };
  }

  async function deliver(body: string): Promise<void> {
    try {
      const response = await send(endpoint, {
        method: 'POST',
        headers: {
          'content-type': 'application/x-sentry-envelope',
          'x-sentry-auth': `Sentry sentry_version=7, sentry_client=bieberkit/0, sentry_key=${publicKey}`,
        },
        body,
        signal: AbortSignal.timeout(timeoutMs),
      });
      if (response.status === 429) {
        const wait = Number(response.headers.get('retry-after'));
        pausedUntil = now() + (Number.isFinite(wait) && wait > 0 ? wait * 1000 : 60_000);
        warn('the error reporter server asked to slow down', { pausedForMs: pausedUntil - now() });
      } else if (!response.ok) {
        warn('the error reporter server refused a report', { status: response.status });
      }
      await response.body?.cancel();
    } catch (error) {
      warn('a report could not be sent', { reason: error instanceof Error ? error.message : String(error) });
    }
  }

  /** Sends in the background, and keeps the send in `pending` until it is over, so that `flush` can wait for it. */
  async function track(body: string): Promise<void> {
    const task = deliver(body);
    pending.add(task);
    try {
      await task;
    } finally {
      pending.delete(task);
    }
  }

  return {
    report(error, context) {
      try {
        const at = now();
        if (context.level !== 'fatal' && sampleRate < 1 && random() >= sampleRate) return;
        if (at - windowStart >= 60_000) {
          if (dropped > 0) warn('reports were dropped', { dropped });
          windowStart = at;
          inWindow = 0;
          dropped = 0;
        }
        if (at < pausedUntil || inWindow >= maxPerMinute || pending.size >= MAX_PENDING) {
          dropped += 1;
          return;
        }
        inWindow += 1;
        void track(eventOf(error, context).body);
      } catch (failure) {
        warn('a report could not be made', { reason: failure instanceof Error ? failure.message : String(failure) });
      }
    },
    async flush(timeoutMsFlush = 2_000) {
      if (pending.size === 0) return true;
      let timer: NodeJS.Timeout | undefined;
      const timeout = new Promise<false>((resolve) => {
        timer = setTimeout(() => resolve(false), timeoutMsFlush);
      });
      try {
        return await Promise.race([Promise.allSettled(pending).then(() => true as const), timeout]);
      } finally {
        if (timer !== undefined) clearTimeout(timer);
      }
    },
  };
}
