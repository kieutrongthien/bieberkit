/**
 * BieberKit
 *
 * @file        packages/server/src/client-reports.ts
 * @description The route that takes the errors and the Core Web Vitals of the admin from the browser, and hands them to the error reporter and the metrics, without personal data and without a body of the page (UI-21, OBS-06).
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

import { reportError } from '@bieberkit/core';
import type { ErrorReporter, Metrics } from '@bieberkit/core';
import { defineRoute } from '@bieberkit/http';
import type { HttpServer } from '@bieberkit/http';

/** Where the admin sends what happened in the browser (UI-21). */
export const CLIENT_REPORTS_PATH = '/api/v1/_client-reports';

const text = (max: number): Record<string, unknown> => ({ type: 'string', maxLength: max });

const ERROR_BODY = {
  type: 'object',
  required: ['kind', 'message', 'frames', 'route'],
  additionalProperties: false,
  properties: {
    kind: text(60),
    message: text(300),
    frames: { type: 'array', maxItems: 10, items: text(120) },
    route: text(200),
    release: text(60),
  },
} as const;

const VITAL_BODY = {
  type: 'object',
  required: ['name', 'value', 'rating', 'route'],
  additionalProperties: false,
  properties: {
    name: { type: 'string', enum: ['LCP', 'FCP', 'CLS', 'INP', 'TTFB'] },
    value: { type: 'number', minimum: 0, maximum: 1_000_000 },
    rating: { type: 'string', enum: ['good', 'needs-improvement', 'poor'] },
    route: text(200),
  },
} as const;

/** One of two shapes, so that a report that says what it is also carries it. */
const BODY = {
  type: 'object',
  oneOf: [
    {
      type: 'object',
      required: ['kind', 'error'],
      additionalProperties: false,
      properties: { kind: { const: 'error' }, error: ERROR_BODY },
    },
    {
      type: 'object',
      required: ['kind', 'vital'],
      additionalProperties: false,
      properties: { kind: { const: 'vital' }, vital: VITAL_BODY },
    },
  ],
} as const;

interface ErrorBody {
  readonly kind: string;
  readonly message: string;
  readonly frames: readonly string[];
  readonly route: string;
  readonly release?: string;
}

interface VitalBody {
  readonly name: string;
  readonly value: number;
  readonly rating: string;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const str = (value: unknown): string => (typeof value === 'string' ? value : '');

function errorOf(value: unknown): ErrorBody | undefined {
  if (!isRecord(value)) return undefined;
  const frames = Array.isArray(value['frames']) ? value['frames'].map(str) : [];
  const release = str(value['release']);
  return {
    kind: str(value['kind']),
    message: str(value['message']),
    frames,
    route: str(value['route']),
    ...(release === '' ? {} : { release }),
  };
}

function vitalOf(value: unknown): VitalBody | undefined {
  if (!isRecord(value) || typeof value['value'] !== 'number') return undefined;
  return { name: str(value['name']), value: value['value'], rating: str(value['rating']) };
}

/**
 * `POST /api/v1/_client-reports` (UI-21). It is public, because an error of the login page is as useful as any other, and so it takes
 * little: a closed list of names, texts with a length, and nothing that the schema does not name. An error is made an `Error` with the
 * frames of the browser as its stack and goes to the reporter as a warning of the source `client`; a vital is counted and observed. The
 * limit of the rate is the one of the server for any address.
 */
export function registerClientReports(
  server: HttpServer,
  options: { readonly reporter: ErrorReporter; readonly metrics: Metrics },
): void {
  const { reporter, metrics } = options;
  const vitals = metrics.counter(
    'bk_admin_web_vitals_total',
    'Core Web Vitals of the admin that browsers sent, by rating.',
    {
      labels: ['name', 'rating'],
    },
  );
  const timings = metrics.histogram(
    'bk_admin_web_vital_seconds',
    'Timing vitals of the admin in seconds (LCP, FCP, INP, TTFB).',
    {
      labels: ['name'],
      buckets: [0.1, 0.25, 0.5, 0.8, 1, 1.8, 2.5, 4, 6, 10],
    },
  );
  const shifts = metrics.histogram('bk_admin_layout_shift', 'Cumulative layout shift of the admin, as a score.', {
    buckets: [0.01, 0.05, 0.1, 0.25, 0.5, 1],
  });
  server.route(
    defineRoute({
      method: 'POST',
      url: CLIENT_REPORTS_PATH,
      public: true,
      schema: { body: BODY, response: { 204: { type: 'null' } } },
      handler: (ctx) => {
        const body = isRecord(ctx.body) ? ctx.body : {};
        if (body['kind'] === 'vital') {
          const vital = vitalOf(body['vital']);
          if (vital !== undefined) {
            vitals.inc({ name: vital.name, rating: vital.rating });
            if (vital.name === 'CLS') shifts.observe(vital.value);
            else timings.observe(vital.value / 1000, { name: vital.name });
          }
        } else {
          const found = errorOf(body['error']);
          if (found !== undefined) {
            const error = new Error(found.message);
            error.name = found.kind;
            error.stack = `${found.kind}: ${found.message}\n${found.frames.map((frame) => `    at ${frame}`).join('\n')}`;
            reportError(reporter, error, {
              source: 'client',
              level: 'warning',
              http: { method: 'GET', path: found.route },
              tags: { route: found.route, ...(found.release === undefined ? {} : { release: found.release }) },
            });
          }
        }
        ctx.status(204);
        return undefined;
      },
    }),
  );
}
