/**
 * BieberKit
 *
 * @file        e2e/slots.spec.ts
 * @description The slots of the admin in a browser, filled by the admin part of a plugin of the project: each in its place, behind its permission, in each language, and one that breaks leaves the rest (UI-34 to UI-37, UI-04).
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

import { AxeBuilder } from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { ACCOUNTS, EMAIL, makeRow, recordOf, settle, signIn } from './support.ts';

const RULES = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];

/** What axe finds on the page now, as short lines that say which rule and which element. */
async function violations(page: Page): Promise<string[]> {
  await settle(page);
  const result = await new AxeBuilder({ page }).withTags(RULES).analyze();
  return result.violations.map(
    (violation) =>
      `${violation.id}: ${violation.help} :: ${violation.nodes
        .slice(0, 3)
        .map((node) => node.target.join(' '))
        .join(' | ')}`,
  );
}

const failedPart = (page: Page) => page.getByRole('alert').filter({ hasText: 'This part could not be shown' });

// One sign in for the file: the sign in route limits how often an address may try.
test.describe.configure({ mode: 'serial' });
let shared: Page;
test.beforeAll(async ({ browser }) => {
  shared = await (await browser.newContext({ extraHTTPHeaders: { 'x-forwarded-for': '198.51.100.35' } })).newPage();
  await signIn(shared);
});
test.afterAll(async () => {
  await shared.context().close();
});

test('UI-35 slot 1 and 2: a plugin adds a page with a menu entry in the group that it asks for, and the page reads the API', async () => {
  const page = shared;
  await makeRow(page, ACCOUNTS, { code: 'EXT-A', name: 'Extension account' });
  await page.goto('/admin/');
  await page.getByRole('menuitem', { name: 'Reports' }).click();
  await expect(page).toHaveURL(/\/admin\/reports$/);
  await expect(page.getByRole('heading', { level: 1, name: 'Reports' })).toBeVisible();
  const crumbs = page.getByRole('navigation', { name: 'Where you are' });
  await expect(crumbs).toContainText('Content');
  await expect(crumbs.getByRole('link', { name: 'Reports' })).toHaveAttribute('aria-current', 'page');
  await expect(page.getByText('You may close tickets')).toBeVisible();
  await expect(page.getByRole('list', { name: 'codes' }).getByText('EXT-A')).toBeVisible();
  // A reload on the address of the page gives the page.
  await page.reload();
  await expect(page.getByText('Accounts by code')).toBeVisible();
  expect(await violations(page)).toEqual([]);
});

test('UI-35 slot 3: a button of a plugin is in the header, and goes where it says', async () => {
  const page = shared;
  await page.goto('/admin/crm/accounts');
  await page.getByRole('banner').getByRole('button', { name: 'CRM quick' }).click();
  await expect(page).toHaveURL(/\/admin\/reports$/);
});

test('UI-35 slot 4: a notice of a plugin is over the frame, and closes the one way that the shell gives', async () => {
  const page = shared;
  await page.goto('/admin/');
  await page.evaluate(() => window.localStorage.setItem('crm-notice', 'on'));
  await page.reload();
  await expect(page.getByText('The CRM was updated.')).toBeVisible();
  expect(await violations(page)).toEqual([]);
  await page.getByRole('button', { name: 'Close the notice of the CRM' }).click();
  await expect(page.getByText('The CRM was updated.')).toHaveCount(0);
  // It stays closed while the page is open.
  await page.getByRole('menuitem', { name: 'Reports' }).click();
  await expect(page.getByText('Accounts by code')).toBeVisible();
  await expect(page.getByText('The CRM was updated.')).toHaveCount(0);
  await page.evaluate(() => window.localStorage.removeItem('crm-notice'));
});

test('UI-35 slot 5 and 6: a tab of the detail of an entity, and a control that draws the field whose widget it names', async () => {
  const page = shared;
  const rating = () => page.getByRole('group', { name: 'rating' }).getByRole('button', { name: '4' });
  await page.goto('/admin/crm/accounts/new');
  await page.getByRole('textbox', { name: 'code' }).fill('EXT-B');
  await page.getByRole('textbox', { name: 'name' }).fill('Rated');
  await rating().click();
  await expect(rating()).toHaveAttribute('aria-pressed', 'true');
  expect(await violations(page)).toEqual([]);
  await page.getByRole('button', { name: 'Save' }).click();
  await page.getByRole('link', { name: 'EXT-B' }).click();
  await expect(rating()).toHaveAttribute('aria-pressed', 'true');
  await page.getByRole('tab', { name: 'Panel' }).click();
  await expect(page.getByText('Panel of EXT-B')).toBeVisible();
  // The tab is of accounts only.
  await makeRow(page, '/api/v1/crm/tickets', { title: 'No panel here' });
  await page.goto('/admin/crm/tickets');
  await page.getByRole('link', { name: 'No panel here' }).click();
  await expect(page.getByRole('tab', { name: 'Details' })).toBeVisible();
  await expect(page.getByRole('tab', { name: 'Panel' })).toHaveCount(0);
});

test('UI-35 slot 7, UI-36, UI-21: blocks of the home page, and one that throws leaves the rest and is reported', async () => {
  const page = shared;
  const reported = page.waitForRequest(
    (request) =>
      request.url().includes('/api/v1/_client-reports') &&
      (request.postData() ?? '').includes('This block is broken on purpose'),
  );
  await page.goto('/admin/');
  await reported;
  await expect(page.getByText(/Accounts: \d+/)).toBeVisible();
  await expect(failedPart(page)).toContainText('@bieberkit/plugin-crm/broken');
  await expect(page.getByRole('heading', { name: 'Welcome' })).toBeVisible();
  await expect(page.getByRole('menuitem', { name: 'Account' })).toBeVisible();
  expect(await violations(page)).toEqual([]);
});

test('UI-35 slot 8: a plugin adds a tab to "My account", whose address names it', async () => {
  const page = shared;
  await page.goto('/admin/account');
  await page.getByRole('tab', { name: 'CRM settings' }).click();
  await expect(page).toHaveURL(/\/admin\/account\?tab=crm$/);
  await expect(page.getByText(`Signed in as ${EMAIL}`)).toBeVisible();
  await page.reload();
  await expect(page.getByText(`Signed in as ${EMAIL}`)).toBeVisible();
  expect(await violations(page)).toEqual([]);
});

test('UI-04 a plugin draws the list of an entity in place of the generic one', async () => {
  const page = shared;
  await page.goto('/admin/crm/labels');
  await expect(page.getByText('Labels drawn by the plugin')).toBeVisible();
  await expect(page.getByRole('button', { name: 'New' })).toHaveCount(0);
});

test('UI-35 a page behind a permission that the person has not is not in the menu, says that it is not open, and its code is not read', async () => {
  const page = shared;
  const asked: string[] = [];
  const watch = (request: { url: () => string }): void => void asked.push(request.url());
  page.on('request', watch);
  await page.goto('/admin/secret');
  await expect(page.getByText('This page is not open to you')).toBeVisible();
  await expect(page.getByRole('menuitem', { name: 'Reports' })).toBeVisible();
  await expect(page.getByRole('menuitem', { name: 'Secret' })).toHaveCount(0);
  await page.waitForLoadState('networkidle');
  expect(asked.filter((url) => /\/assets\/Secret-/.test(url))).toEqual([]);
  // The chunk of a page is named after its file, so the check above can see one: the page that is open asks for its own.
  await page.goto('/admin/reports');
  await expect(page.getByText('Accounts by code')).toBeVisible();
  page.off('request', watch);
  expect(asked.filter((url) => /\/assets\/Reports-/.test(url))).not.toEqual([]);
});

test('UI-36, UI-05 the texts of a plugin follow the language of the person', async () => {
  const page = shared;
  await page.goto('/admin/reports');
  await page.getByRole('combobox', { name: 'Language' }).click();
  await page.getByTitle('Tiếng Việt').click();
  await expect(page.getByRole('menuitem', { name: 'Báo cáo' })).toBeVisible();
  await expect(page.getByRole('heading', { level: 1, name: 'Báo cáo' })).toBeVisible();
  await expect(page.getByText('Tài khoản theo mã')).toBeVisible();
  await page.reload();
  await expect(page.getByRole('heading', { level: 1, name: 'Báo cáo' })).toBeVisible();
  await page.getByRole('combobox', { name: 'Ngôn ngữ' }).click();
  await page.getByTitle('English').click();
  await expect(page.getByRole('menuitem', { name: 'Reports' })).toBeVisible();
});

test('UI-07, UI-16 the screens of a plugin fit 360 px and have no violation of WCAG 2.2 AA, in the dark palette too', async () => {
  const page = shared;
  await page.setViewportSize({ width: 360, height: 740 });
  await page.emulateMedia({ colorScheme: 'dark' });
  try {
    for (const [path, text] of [
      ['/admin/', /Accounts: \d+/],
      ['/admin/reports', 'Accounts by code'],
      ['/admin/account?tab=crm', `Signed in as ${EMAIL}`],
    ] as const) {
      await page.goto(path);
      await expect(page.getByText(text)).toBeVisible();
      expect(await violations(page), path).toEqual([]);
      expect(await page.evaluate(() => document.documentElement.scrollWidth), path).toBeLessThanOrEqual(360);
    }
  } finally {
    await page.setViewportSize({ width: 1280, height: 720 });
    await page.emulateMedia({ colorScheme: 'light' });
  }
});

test('UI-35 slot 9: a page of a plugin opens without a session, in the layout of the sign in', async ({ page }) => {
  await page.goto('/admin/crm-status');
  await expect(page.getByRole('heading', { level: 1, name: 'CRM status' })).toBeVisible();
  await expect(page.getByText('This page opens without a session.')).toBeVisible();
  expect(await violations(page)).toEqual([]);
});

test('UI-35 slot 10: a screen of a plugin stands in place of the admin while it says so, and can sign the person out', async () => {
  const page = shared;
  await page.route('**/api/v1/_meta', (route) =>
    route.fulfill({
      status: 403,
      contentType: 'application/problem+json',
      body: JSON.stringify(recordOf({ status: 403, code: 'CRM_TERMS_REQUIRED', detail: 'Accept the terms.' })),
    }),
  );
  await page.goto('/admin/');
  await expect(page.getByRole('heading', { level: 1, name: 'Accept the CRM terms' })).toBeVisible();
  await expect(page.getByRole('navigation', { name: 'Main menu' })).toHaveCount(0);
  expect(await violations(page)).toEqual([]);
  await page.getByRole('button', { name: 'Sign out of the CRM' }).click();
  await expect(page.getByRole('heading', { name: 'Sign in' })).toBeVisible();
  await page.unrouteAll({ behavior: 'ignoreErrors' });
});
