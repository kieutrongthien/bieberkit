/**
 * BieberKit
 *
 * @file        e2e/admin-subdomain.spec.ts
 * @description The browser test of the admin on a host of its own: the same login and screens at the root of admin.localhost, a route of the application survives a reload, and the other host does not serve it (UI-14, ADMIN_URL).
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

import { expect, test } from '@playwright/test';

const EMAIL = 'admin@example.com';
const PASSWORD = 'Playwright-Admin-Passw0rd!';

test('the admin at the root of its own host signs in, reloads on a route, and is not served by the other host', async ({
  page,
  request,
}) => {
  const violations: string[] = [];
  page.on('console', (message) => {
    if (message.text().includes('Content Security Policy')) violations.push(message.text());
  });
  page.on('pageerror', (error) => violations.push(error.message));

  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Sign in' })).toBeVisible();
  // The brand of the config of this server: its name instead of the logo of BieberKit, its sentence and the title (UI-33).
  await expect(page).toHaveTitle('Acme Works');
  await expect(page.getByText('Acme Works')).toBeVisible();
  await expect(page.getByText('Acme at work.')).toBeVisible();
  await expect(page.getByRole('img', { name: 'BieberKit' })).toHaveCount(0);
  await page.getByLabel('Email').fill(EMAIL);
  await page.getByLabel('Password').fill(PASSWORD);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.getByRole('heading', { name: 'Welcome' })).toBeVisible();

  await page.getByRole('menuitem', { name: 'Account' }).click();
  await expect(page).toHaveURL('http://admin.localhost:4312/crm/accounts');
  await expect(page.getByRole('button', { name: 'New' })).toBeVisible();

  // A route of the application is the page, not a 404, after a reload.
  await page.reload();
  await expect(page.getByRole('button', { name: 'New' })).toBeVisible();

  // The other host of the same server does not serve the admin, at the root or at /admin.
  expect((await request.get('http://127.0.0.1:4312/')).status()).toBe(404);
  expect((await request.get('http://127.0.0.1:4312/admin/')).status()).toBe(404);

  // Signing out is in the menu of the account (UI-24).
  await page.getByRole('button', { name: /Account menu/ }).click();
  await page.getByRole('menuitem', { name: 'Sign out' }).click();
  await expect(page.getByRole('heading', { name: 'Sign in' })).toBeVisible();
  expect(violations).toEqual([]);
});
