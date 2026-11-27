/**
 * BieberKit
 *
 * @file        packages/admin-core/src/reporting.ts
 * @description What the admin sends about its own errors and speed: the shape of a route, a scrubbed error, a web vital and a sample, with no personal data in them (UI-21, OBS-06).
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

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** A path without what identifies a record or a person: ids, numbers and encoded text become `:id`, and the query and the fragment go. */
export function routeShape(path: string): string {
  const bare = path.split('#')[0]?.split('?')[0] ?? '';
  return bare
    .split('/')
    .map((segment) =>
      UUID.test(segment) || /^\d+$/.test(segment) || /[%@]/.test(segment) || /^[\w-]{24,}$/.test(segment)
        ? ':id'
        : segment,
    )
    .join('/');
}

export interface ErrorReport {
  readonly kind: string;
  readonly message: string;
  /** The file, line and column of each frame of the stack, with no host and no query. */
  readonly frames: readonly string[];
  readonly route: string;
  readonly release?: string;
}

const MESSAGE_MAX = 300;
const FRAME = /([^/\s()]+\.(?:m?js|tsx?)):(\d+):(\d+)/;

function scrub(text: string): string {
  return text
    .replaceAll(/[\w.+-]+@[\w-]+(?:\.[\w-]+)+/g, '[email]')
    .replaceAll(/\b[A-Za-z0-9_-]{24,}\b/g, '[token]')
    .replaceAll(/\b\d{9,}\b/g, '[number]')
    .slice(0, MESSAGE_MAX);
}

/** What is sent for an error: its kind, a message without emails and long numbers or tokens, and where it happened. Never a value of the page. */
export function errorReport(
  error: unknown,
  context: { readonly route: string; readonly release?: string },
): ErrorReport {
  const real = error instanceof Error;
  const message = real ? error.message : typeof error === 'string' ? error : 'unknown';
  const frames =
    real && error.stack !== undefined
      ? error.stack.split('\n').flatMap((line) => {
          const found = FRAME.exec(line);
          return found === null ? [] : [`${found[1] ?? ''}:${found[2] ?? ''}:${found[3] ?? ''}`];
        })
      : [];
  return {
    kind: real ? error.name : 'Error',
    message: scrub(message === '' ? 'unknown' : message),
    frames: frames.slice(0, 10),
    route: routeShape(context.route),
    ...(context.release === undefined ? {} : { release: context.release }),
  };
}

export interface Vital {
  readonly name: string;
  readonly value: number;
  readonly rating: string;
}

export interface VitalReport extends Vital {
  readonly route: string;
}

/** A Core Web Vital with a value that a report can hold: whole ms, or three decimals for a score such as CLS. */
export function vitalReport(vital: Vital, path: string): VitalReport {
  const value = vital.name === 'CLS' ? Math.round(vital.value * 1000) / 1000 : Math.round(vital.value);
  return { name: vital.name, value, rating: vital.rating, route: routeShape(path) };
}

/** Whether this visit is in the sample: none at a rate of 0, all at 1. */
export function sampled(rate: number, random: () => number = Math.random): boolean {
  if (rate <= 0) return false;
  return rate >= 1 || random() < rate;
}
