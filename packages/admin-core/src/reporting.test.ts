/**
 * BieberKit
 *
 * @file        packages/admin-core/src/reporting.test.ts
 * @description Tests of what the admin sends about its own errors and speed: scrubbed, sampled and without personal data (UI-21, OBS-06).
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

import { describe, expect, it } from 'vitest';
import { dedupe, errorReport, ratingOf, routeShape, sampled, vitalReport } from './reporting.ts';

describe('UI-21 the shape of a route', () => {
  it('UI-21 an id, a number and a token in a path become :id, so a report has no record in it', () => {
    expect(routeShape('/admin/crm/accounts/01a21bb9-96f5-717b-b8cb-21258248561a')).toBe('/admin/crm/accounts/:id');
    expect(routeShape('/admin/crm/accounts/42/edit')).toBe('/admin/crm/accounts/:id/edit');
    expect(routeShape('/admin/users/ann%40example.com')).toBe('/admin/users/:id');
    expect(routeShape('/admin/crm/accounts?filter[name]=ann#x')).toBe('/admin/crm/accounts');
    expect(routeShape('/admin/crm/accounts')).toBe('/admin/crm/accounts');
  });
});

describe('UI-21 the report of an error', () => {
  it('UI-21 has the kind, a short message, the place and the route, and no query string', () => {
    const error = new TypeError('Cannot read properties of undefined');
    error.stack =
      'TypeError: x\n    at render (https://shop.example.com/admin/assets/List-abc.js:10:5?token=secret)\n    at b (https://shop.example.com/admin/assets/index-def.js:1:2)';
    const report = errorReport(error, { route: '/admin/crm/accounts/42', release: 'r7' });
    expect(report).toMatchObject({
      kind: 'TypeError',
      route: '/admin/crm/accounts/:id',
      release: 'r7',
      frames: ['List-abc.js:10:5', 'index-def.js:1:2'],
    });
    expect(JSON.stringify(report)).not.toContain('token=secret');
    expect(JSON.stringify(report)).not.toContain('shop.example.com');
  });

  it('UI-21 an email, a long number and a long token in the message are taken out', () => {
    const report = errorReport(
      new Error('No user ann@example.com, card 4111111111111111, session 0123456789abcdef0123456789abcdef'),
      { route: '/admin' },
    );
    expect(report.message).toBe('No user [email], card [number], session [token]');
  });

  it('UI-21 a message is cut, and a thing that is not an error is still reported', () => {
    expect(errorReport(new Error('x'.repeat(1000)), { route: '/' }).message.length).toBeLessThanOrEqual(300);
    expect(errorReport('boom', { route: '/' })).toMatchObject({ kind: 'Error', message: 'boom', frames: [] });
    expect(errorReport(undefined, { route: '/' }).message).toBe('unknown');
  });
});

describe('UI-21 the vitals and the sample', () => {
  it('UI-21 a vital has its name, a rounded value, its rating and the shape of the route', () => {
    expect(vitalReport({ name: 'LCP', value: 2512.7, rating: 'good' }, '/admin/crm/accounts/42')).toEqual({
      name: 'LCP',
      value: 2513,
      rating: 'good',
      route: '/admin/crm/accounts/:id',
    });
    expect(vitalReport({ name: 'CLS', value: 0.123456, rating: 'needs-improvement' }, '/admin').value).toBe(0.123);
  });

  it('UI-21 a sample keeps about the rate that was asked for, and none at 0 and all at 1', () => {
    expect(sampled(0, () => 0)).toBe(false);
    expect(sampled(1, () => 0.999)).toBe(true);
    expect(sampled(0.1, () => 0.05)).toBe(true);
    expect(sampled(0.1, () => 0.5)).toBe(false);
  });
});

describe('UI-21 the rating of a vital, and the rate of the reports', () => {
  it('UI-21 a vital is good up to its first limit, needs improvement up to its second, and is poor beyond', () => {
    expect([ratingOf('LCP', 2500), ratingOf('LCP', 3000), ratingOf('LCP', 4001)]).toEqual([
      'good',
      'needs-improvement',
      'poor',
    ]);
    expect([ratingOf('CLS', 0.05), ratingOf('CLS', 0.2), ratingOf('CLS', 0.3)]).toEqual([
      'good',
      'needs-improvement',
      'poor',
    ]);
    expect([ratingOf('INP', 200), ratingOf('FCP', 1801), ratingOf('TTFB', 1801)]).toEqual([
      'good',
      'needs-improvement',
      'poor',
    ]);
    expect(ratingOf('FID', 1)).toBe('poor');
  });

  it('UI-21 the same error is sent once, and a page sends ten at most', () => {
    const seen = new Set<string>();
    const report = { kind: 'TypeError', message: 'x', route: '/a' };
    expect(dedupe(seen, report)).toBe(true);
    expect(dedupe(seen, report)).toBe(false);
    for (let n = 0; n < 20; n += 1) dedupe(seen, { ...report, message: String(n) });
    expect(seen.size).toBe(10);
    expect(dedupe(seen, { ...report, message: 'another' })).toBe(false);
  });
});

describe('UI-21 the page of a password link', () => {
  it('UI-21 a report of an error on the reset page carries no token', () => {
    expect(routeShape('/reset-password?token=tok-1&invite=1')).toBe('/reset-password');
  });
});
