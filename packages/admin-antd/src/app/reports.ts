/**
 * BieberKit
 *
 * @file        packages/admin-antd/src/app/reports.ts
 * @description What the browser tells the server about the admin: its errors, and its Core Web Vitals for a sample of the visits, sent to the route of the client reports without personal data (UI-21).
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

import { dedupe, errorReport, ratingOf, sampled, vitalReport } from '@bieberkit/admin-core';
import type { ErrorReport, Vital, VitalReport } from '@bieberkit/admin-core';

const ENDPOINT = '/api/v1/_client-reports';

/** The share of the visits that report their vitals. Errors are all reported, once each. */
const VITALS_RATE = 0.1;

const seen = new Set<string>();

function send(
  body:
    | { readonly kind: 'error'; readonly error: ErrorReport }
    | { readonly kind: 'vital'; readonly vital: VitalReport },
): void {
  // `keepalive` lets the request finish after the page is gone, which is when the vitals are final. The last two versions of the
  // four browsers of UI-20 have it.
  void fetch(ENDPOINT, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
    keepalive: true,
    credentials: 'same-origin',
  }).catch(() => undefined);
}

/** Tells the server about an error. The same error twice, and more than ten in a page, are not sent. */
export function reportClientError(error: unknown): void {
  const report = errorReport(error, { route: window.location.pathname });
  if (dedupe(seen, report)) send({ kind: 'error', error: report });
}

interface ObserveOptions extends PerformanceObserverInit {
  /** The shortest event that is reported, in ms. Not in every version of the DOM types. */
  durationThreshold?: number;
}

function observe(type: string, handle: (entry: PerformanceEntry) => void, options: ObserveOptions = {}): void {
  const init: ObserveOptions = { type, buffered: true, ...options };
  try {
    new PerformanceObserver((list) => list.getEntries().forEach(handle)).observe(init);
  } catch {
    // This browser does not give this vital.
  }
}

/** The vitals of the page, each sent once, when the person leaves it or hides the tab, and only for a sample of the visits. */
function watchVitals(): void {
  if (typeof PerformanceObserver === 'undefined' || !sampled(VITALS_RATE)) return;
  const values = new Map<string, number>();
  observe('paint', (entry) => {
    if (entry.name === 'first-contentful-paint') values.set('FCP', entry.startTime);
  });
  observe('largest-contentful-paint', (entry) => values.set('LCP', entry.startTime));
  observe('layout-shift', (entry) => {
    // A shift that follows an input is the person's own and does not count.
    if (!Reflect.get(entry, 'hadRecentInput')) {
      const value = Reflect.get(entry, 'value');
      if (typeof value === 'number') values.set('CLS', (values.get('CLS') ?? 0) + value);
    }
  });
  observe(
    'event',
    (entry) => {
      if (Reflect.get(entry, 'interactionId') !== 0)
        values.set('INP', Math.max(values.get('INP') ?? 0, entry.duration));
    },
    { durationThreshold: 40 },
  );
  const navigation = performance
    .getEntriesByType('navigation')
    .find((entry): entry is PerformanceNavigationTiming => entry instanceof PerformanceNavigationTiming);
  if (navigation !== undefined && navigation.responseStart > 0) values.set('TTFB', navigation.responseStart);

  let sent = false;
  const flush = (leaving: boolean): void => {
    // The tab was hidden, or the page is going away: the values are final. A page that comes back from the cache sends again.
    if (sent || (!leaving && document.visibilityState !== 'hidden')) return;
    sent = true;
    for (const [name, value] of values) {
      const vital: Vital = { name, value, rating: ratingOf(name, value) };
      send({ kind: 'vital', vital: vitalReport(vital, window.location.pathname) });
    }
  };
  document.addEventListener('visibilitychange', () => flush(false));
  window.addEventListener('pagehide', () => flush(true));
  window.addEventListener('pageshow', () => {
    sent = false;
  });
}

/** Starts the reports of the page: what no code caught, and the vitals. */
export function startReports(): void {
  window.addEventListener('error', (event) => {
    // A script, an image or a style that did not load is an event of its element and has no error: it is not an error of the code.
    if (event.error !== undefined && event.error !== null) reportClientError(event.error);
  });
  window.addEventListener('unhandledrejection', (event) => reportClientError(event.reason));
  watchVitals();
}
