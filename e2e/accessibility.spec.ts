/**
 * BieberKit
 *
 * @file        e2e/accessibility.spec.ts
 * @description Accessibility of the generic screens against WCAG 2.2 level AA with axe, on a wide screen and at 360 px (UI-07, UI-16, spec section 18.1).
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
import { ACCOUNTS, makeRow, signIn } from './support.ts';

const RULES = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];

/** What axe finds on the page now, as short lines that say which rule, which element and how bad. */
async function violations(page: Page): Promise<string[]> {
  const result = await new AxeBuilder({ page }).withTags(RULES).analyze();
  return result.violations.map(
    (violation) =>
      `${violation.id} (${violation.impact ?? 'n/a'}): ${violation.help} :: ${violation.nodes
        .slice(0, 3)
        .map((node) => node.target.join(' '))
        .join(' | ')}`,
  );
}

test.describe.configure({ mode: 'serial' });
let shared: Page;
test.beforeAll(async ({ browser }) => {
  shared = await (await browser.newContext()).newPage();
});
test.afterAll(async () => {
  await shared.context().close();
});

test('UI-07 the login page has no violation of WCAG 2.2 AA', async () => {
  await shared.goto('/admin/');
  await expect(shared.getByRole('heading', { name: 'Sign in' })).toBeVisible();
  expect(await violations(shared)).toEqual([]);
});

test('UI-07 the welcome page, a list, a form and a list of cards have no violation of WCAG 2.2 AA', async () => {
  const page = shared;
  await signIn(page);
  await makeRow(page, ACCOUNTS, { code: 'AXE-1', name: 'Axe account', note: 'checked' });
  await makeRow(page, '/api/v1/crm/tickets', { title: 'Axe ticket' });

  expect(await violations(page)).toEqual([]);

  await page.goto('/admin/crm/accounts');
  await expect(page.getByRole('link', { name: 'AXE-1' })).toBeVisible();
  expect(await violations(page)).toEqual([]);

  // With a filter, a selection and the bar of changes.
  await page
    .getByRole('row')
    .filter({ has: page.getByRole('link', { name: 'AXE-1' }) })
    .getByRole('checkbox')
    .check();
  expect(await violations(page)).toEqual([]);

  await page.goto('/admin/crm/accounts/new');
  await expect(page.getByRole('textbox', { name: 'code' })).toBeVisible();
  expect(await violations(page)).toEqual([]);

  await page.goto('/admin/crm/tickets');
  await expect(page.getByRole('link', { name: 'Axe ticket' })).toBeVisible();
  expect(await violations(page)).toEqual([]);
});

test('UI-07 a form that asks for the input of a move, and the filters that are set, have no violation of WCAG 2.2 AA', async () => {
  const page = shared;
  await page.goto('/admin/crm/tickets');
  await page.getByRole('button', { name: 'close' }).first().click();
  await expect(page.getByRole('textbox', { name: 'reason' })).toBeVisible();
  expect(await violations(page)).toEqual([]);
  await page.getByRole('button', { name: 'Cancel' }).click();

  await page.goto('/admin/crm/accounts');
  await page.getByRole('combobox', { name: 'Field' }).click();
  await page
    .locator('.ant-select-dropdown:not(.ant-select-dropdown-hidden)')
    .getByTitle('tier', { exact: true })
    .click();
  await page.getByRole('combobox', { name: 'Value' }).click();
  await page
    .locator('.ant-select-dropdown:not(.ant-select-dropdown-hidden)')
    .getByTitle('gold', { exact: true })
    .click();
  await page.getByRole('button', { name: 'Add filter' }).click();
  await expect(page.getByText('tier is gold')).toBeVisible();
  await expect(page.locator('.ant-select-dropdown:not(.ant-select-dropdown-hidden)')).toHaveCount(0);
  expect(await violations(page)).toEqual([]);
});

test('UI-07 a detail with its tabs, its child table and its history has no violation of WCAG 2.2 AA', async () => {
  const page = shared;
  await page.goto('/admin/crm/accounts');
  await page.getByRole('link', { name: 'AXE-1' }).click();
  await expect(page.getByRole('tab', { name: 'Details' })).toBeVisible();
  expect(await violations(page)).toEqual([]);
  await page.getByRole('tab', { name: 'Ticket' }).click();
  expect(await violations(page)).toEqual([]);
  await page.getByRole('tab', { name: 'History' }).click();
  await expect(page.getByText('create', { exact: true })).toBeVisible();
  expect(await violations(page)).toEqual([]);

  await page.goto('/admin/crm/tickets');
  await page.getByRole('link', { name: 'Axe ticket' }).click();
  await expect(page.getByText('Filled in by the server')).toBeVisible();
  expect(await violations(page)).toEqual([]);
});

test('UI-07 the page, the widgets, the panel and the control that a plugin adds have no violation of WCAG 2.2 AA', async () => {
  const page = shared;
  await page.goto('/admin/');
  await expect(page.getByText(/Accounts: \d+/)).toBeVisible();
  expect(await violations(page)).toEqual([]);
  await page.goto('/admin/ext/crm/reports');
  await expect(page.getByText('Accounts by code')).toBeVisible();
  expect(await violations(page)).toEqual([]);
  await page.goto('/admin/crm/accounts/new');
  await expect(page.getByRole('group', { name: 'rating' })).toBeVisible();
  expect(await violations(page)).toEqual([]);
});

test('UI-07 a form with file fields has no violation of WCAG 2.2 AA', async () => {
  const page = shared;
  await page.goto('/admin/crm/accounts/new');
  await expect(page.getByLabel('attachment')).toBeVisible();
  expect(await violations(page)).toEqual([]);
});

test('UI-07 a form with a relation picker, closed and with its list open, has no violation of WCAG 2.2 AA', async () => {
  const page = shared;
  await page.goto('/admin/crm/tickets/new');
  await expect(page.getByRole('combobox', { name: 'accountId' })).toBeVisible();
  expect(await violations(page)).toEqual([]);
  await page.getByRole('combobox', { name: 'accountId' }).click();
  await expect(page.locator('.ant-select-dropdown:not(.ant-select-dropdown-hidden)')).toBeVisible();
  expect(await violations(page)).toEqual([]);
});

test('UI-07 a form with the lines of a record, empty, with lines, and with a line that is not valid, has no violation of WCAG 2.2 AA', async () => {
  const page = shared;
  await page.goto('/admin/crm/tickets/new');
  await expect(page.getByRole('button', { name: 'Add Work note' })).toBeVisible();
  expect(await violations(page)).toEqual([]);
  await page.getByRole('button', { name: 'Add Work note' }).click();
  await page.getByRole('button', { name: 'Add Work note' }).click();
  await page.getByRole('textbox', { name: 'Work note 1 text' }).fill('one');
  await page.getByRole('textbox', { name: 'title' }).fill('AXE-LINES');
  await page.getByRole('button', { name: 'Save' }).click();
  await expect(page.getByRole('alert').filter({ hasText: 'This field is required' })).toHaveCount(1);
  expect(await violations(page)).toEqual([]);
});

test('UI-07, UI-16 the list of cards at 360 px has no violation of WCAG 2.2 AA', async () => {
  const page = shared;
  await page.setViewportSize({ width: 360, height: 740 });
  try {
    await page.goto('/admin/crm/tickets');
    await expect(page.getByRole('listitem').first()).toBeVisible();
    expect(await violations(page)).toEqual([]);
  } finally {
    await page.setViewportSize({ width: 1280, height: 720 });
  }
});

test('UI-07, UI-06 the dark palette has no violation of WCAG 2.2 AA either', async () => {
  const page = shared;
  await page.emulateMedia({ colorScheme: 'dark' });
  try {
    for (const path of ['/admin/', '/admin/crm/tickets', '/admin/crm/accounts/new']) {
      await page.goto(path);
      await expect(page.locator('main, .ant-card').first()).toBeVisible();
      expect(await violations(page), path).toEqual([]);
    }
  } finally {
    await page.emulateMedia({ colorScheme: 'light' });
  }
});
