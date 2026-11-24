/**
 * BieberKit
 *
 * @file        benchmarks/entity.k6.js
 * @description The k6 script of the reference endpoints: the list of 25 rows and the get of one, as a signed in administrator, with the targets of section 18.1 as thresholds (PERF-08).
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

import http from 'k6/http';
import { check } from 'k6';

const BASE = __ENV.BASE;
const EMAIL = __ENV.EMAIL;
const PASSWORD = __ENV.PASSWORD;
const DURATION = __ENV.DURATION || '20s';
const VUS = Number(__ENV.VUS || 10);

const JSON_HEADERS = { 'content-type': 'application/json', origin: BASE, 'sec-fetch-site': 'same-origin' };

export const options = {
  scenarios: {
    list: { executor: 'constant-vus', vus: VUS, duration: DURATION, exec: 'list' },
    get: { executor: 'constant-vus', vus: VUS, duration: DURATION, exec: 'get', startTime: `${DURATION}` },
    // The floor: a route with no authentication and no query, so that the cost of the rest is what the other two add.
    live: {
      executor: 'constant-vus',
      vus: VUS,
      duration: DURATION,
      exec: 'live',
      startTime: `${DURATION}`.replace(/\d+/, (n) => String(Number(n) * 2)),
    },
  },
  thresholds: {
    // Section 18.1: p95 under 50 ms for a list of 25 rows, and under 20 ms for one row.
    'http_req_duration{scenario:list}': ['p(95)<50'],
    'http_req_duration{scenario:get}': ['p(95)<20'],
    // No target: this is the floor, and a threshold is what makes k6 export it.
    'http_req_duration{scenario:live}': ['p(95)<1000'],
    http_req_failed: ['rate<0.001'],
  },
};

/** Signs in once, and makes the rows that the two scenarios read. */
export function setup() {
  const signed = http.post(`${BASE}/api/auth/sign-in/email`, JSON.stringify({ email: EMAIL, password: PASSWORD }), {
    headers: JSON_HEADERS,
  });
  if (signed.status !== 200) throw new Error(`sign in answered ${signed.status}`);
  const cookie = `__Host-bk_session=${signed.cookies['__Host-bk_session'][0].value}`;
  const headers = { ...JSON_HEADERS, cookie };
  let first = '';
  for (let index = 0; index < 100; index += 1) {
    const made = http.post(
      `${BASE}/api/v1/settings/settings`,
      JSON.stringify({ key: `bench.${index}`, value: `value ${index}` }),
      { headers },
    );
    if (made.status !== 201 && made.status !== 409) throw new Error(`create answered ${made.status}`);
  }
  const listed = http.get(`${BASE}/api/v1/settings/settings?pageSize=25`, { headers });
  first = listed.json('data.0.id');
  return { cookie, id: first };
}

export function list(data) {
  const reply = http.get(`${BASE}/api/v1/settings/settings?pageSize=25`, { headers: { cookie: data.cookie } });
  check(reply, { 'list is 200': (r) => r.status === 200, 'list has 25 rows': (r) => r.json('data').length === 25 });
}

export function live() {
  const reply = http.get(`${BASE}/health/live`);
  check(reply, { 'live is 200': (r) => r.status === 200 });
}

export function get(data) {
  const reply = http.get(`${BASE}/api/v1/settings/settings/${data.id}`, { headers: { cookie: data.cookie } });
  check(reply, { 'get is 200': (r) => r.status === 200 });
}
