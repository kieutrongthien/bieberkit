/**
 * BieberKit
 *
 * @file        e2e/admin.spec.ts
 * @description The browser test of the admin: the login refuses a wrong password and takes the administrator, then a setting is made, changed and deleted from the generic list and form, and the page breaks no policy (spec section 21, UI-02, UI-03, UI-14).
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

test('the administrator signs in, manages a setting, and signs out', async ({ page }) => {
  const violations: string[] = [];
  page.on('console', (message) => {
    if (message.text().includes('Content Security Policy')) violations.push(message.text());
  });
  page.on('pageerror', (error) => violations.push(error.message));

  await page.goto('/admin/');
  await expect(page.getByRole('heading', { name: 'Sign in' })).toBeVisible();

  // A wrong password says so and keeps the login.
  await page.getByLabel('Email').fill(EMAIL);
  await page.getByLabel('Password').fill('not-the-password');
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.getByText(/invalid email or password/i)).toBeVisible();

  await page.getByLabel('Password').fill(PASSWORD);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.getByRole('heading', { name: 'Welcome' })).toBeVisible();
  await expect(page.getByText(EMAIL)).toBeVisible();

  // The menu lists what the administrator may read, and a click opens the list.
  await page.getByRole('menuitem', { name: 'Account' }).click();
  await expect(page).toHaveURL(/\/admin\/crm\/accounts$/);

  // Create.
  await page.getByRole('button', { name: 'New' }).click();
  await page.getByRole('textbox', { name: 'code' }).fill('A-1');
  await page.getByRole('textbox', { name: 'name' }).fill('Demo');
  await page.getByRole('button', { name: 'Save' }).click();
  await expect(page.getByRole('link', { name: 'A-1' })).toBeVisible();

  // The server refuses a second setting with the same key, at the field.
  await page.getByRole('button', { name: 'New' }).click();
  await page.getByRole('textbox', { name: 'code' }).fill('A-1');
  await page.getByRole('textbox', { name: 'name' }).fill('Again');
  await page.getByRole('button', { name: 'Save' }).click();
  await expect(page.getByRole('button', { name: 'Save' })).toBeVisible();
  // The form has unsaved changes, so leaving it asks first (UI-17).
  page.once('dialog', (dialog) => void dialog.accept());
  await page.getByRole('button', { name: 'Cancel' }).click();

  // Change.
  await page.getByRole('link', { name: 'A-1' }).click();
  await page.getByRole('textbox', { name: 'name' }).fill('Renamed');
  await page.getByRole('button', { name: 'Save' }).click();
  await expect(page.getByRole('cell', { name: 'Renamed' })).toBeVisible();

  // Delete, after the question.
  await page.getByRole('button', { name: 'Delete' }).click();
  await page.getByRole('button', { name: 'Delete' }).last().click();
  await expect(page.getByRole('link', { name: 'A-1' })).toHaveCount(0);

  // A reload on a route of the application gives the application, not a 404.
  await page.reload();
  await expect(page).toHaveURL(/\/admin\/crm\/accounts$/);
  await expect(page.getByRole('button', { name: 'New' })).toBeVisible();

  await page.getByRole('button', { name: 'Sign out' }).click();
  await expect(page.getByRole('heading', { name: 'Sign in' })).toBeVisible();

  expect(violations).toEqual([]);
});
