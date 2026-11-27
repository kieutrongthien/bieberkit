/**
 * BieberKit
 *
 * @file        e2e/support.ts
 * @description What the browser tests share: the administrator, the sign in, and rows made through the API so that a test starts from the list that it needs.
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

import { expect } from '@playwright/test';
import type { Page } from '@playwright/test';

export const EMAIL = 'admin@example.com';
export const PASSWORD = 'Playwright-Admin-Passw0rd!';

/** Signs in through the login screen and waits for the welcome page. `path` is where the admin is: `/admin/` or `/`. */
export async function signIn(page: Page, path = '/admin/'): Promise<void> {
  await page.goto(path);
  await page.getByLabel('Email').fill(EMAIL);
  await page.getByLabel('Password').fill(PASSWORD);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.getByRole('heading', { name: 'Welcome' })).toBeVisible();
}

/** A call to the API from the page itself, so that the browser sends what it sends for the admin: the cookie and the fetch metadata. */
export async function callApi(
  page: Page,
  method: string,
  path: string,
  body?: Record<string, unknown>,
  headers: Record<string, string> = {},
): Promise<{ status: number; body: unknown }> {
  expect(page.url(), 'the page is on the admin before it calls the API').toMatch(/^https?:/);
  return page.evaluate(
    async (call) => {
      const response = await fetch(call.path, {
        method: call.method,
        credentials: 'same-origin',
        headers: {
          accept: 'application/json',
          ...(call.body === undefined ? {} : { 'content-type': 'application/json' }),
          ...call.headers,
        },
        ...(call.body === undefined ? {} : { body: JSON.stringify(call.body) }),
      });
      const text = await response.text();
      return { status: response.status, body: text === '' ? null : (JSON.parse(text) as unknown) };
    },
    { method, path, body, headers },
  );
}

export async function makeRow(
  page: Page,
  path: string,
  body: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const answer = await callApi(page, 'POST', path, body);
  expect(answer.status, JSON.stringify(answer.body)).toBe(201);
  const data =
    typeof answer.body === 'object' && answer.body !== null && 'data' in answer.body ? answer.body.data : undefined;
  if (typeof data !== 'object' || data === null) throw new Error('The API did not answer a row.');
  return Object.fromEntries(Object.entries(data));
}

export const ACCOUNTS = '/api/v1/crm/accounts';

/** A value of a JSON text that is read as a record, or an empty one: a test reads what a body holds and checks it, and does not cast it. */
export function recordOf(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? Object.fromEntries(Object.entries(value))
    : {};
}
