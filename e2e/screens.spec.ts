/**
 * BieberKit
 *
 * @file        e2e/screens.spec.ts
 * @description The generic screens in a browser: list filters, saved views, bulk delete, CSV export, the language, the draft of a form and the 412 view (UI-03, UI-05, UI-17, UI-18).
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
import type { Page } from '@playwright/test';
import { ACCOUNTS, callApi, makeRow, signIn } from './support.ts';

/** Opens an Ant Design select by its name and takes one option of it. */
async function pick(page: Page, select: string | RegExp, option: string): Promise<void> {
  await page.getByRole('combobox', { name: select }).click();
  // The list of options that a screen reader gets holds only a few of them, so the open list is read by the title of an option.
  await page
    .locator('.ant-select-dropdown:not(.ant-select-dropdown-hidden)')
    .getByTitle(option, { exact: true })
    .click();
}

const listOf = (page: Page) => page.getByRole('table');

async function rowsOf(page: Page, prefix: string, tiers: readonly string[]): Promise<void> {
  for (const [index, tier] of tiers.entries()) {
    await makeRow(page, ACCOUNTS, {
      code: `${prefix}-${String(index)}`,
      name: `${prefix} ${String(index)}`,
      tier,
      visits: index,
    });
  }
}

// One sign in for the file: the sign in route limits how often an address may try.
test.describe.configure({ mode: 'serial' });
let shared: Page;
test.beforeAll(async ({ browser }) => {
  shared = await (await browser.newContext()).newPage();
  await signIn(shared);
});
test.afterAll(async () => {
  await shared.context().close();
});

test('UI-03 a filter narrows the list, lives in the address, and a saved view brings it back', async () => {
  const page = shared;
  await page.goto('/admin/');
  await rowsOf(page, 'FLT', ['gold', 'basic', 'gold', 'vip']);
  await page.goto('/admin/crm/accounts');
  await expect(page.getByRole('link', { name: 'FLT-0' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'FLT-1' })).toBeVisible();

  await pick(page, 'Field', 'tier');
  await pick(page, 'Value', 'gold');
  await page.getByRole('button', { name: 'Add filter' }).click();

  await expect(page.getByRole('link', { name: 'FLT-0' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'FLT-2' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'FLT-1' })).toHaveCount(0);
  await expect(page.getByRole('link', { name: 'FLT-3' })).toHaveCount(0);
  expect(decodeURIComponent(page.url())).toContain('"field":"tier"');

  // A reload gives the same list, because the filter is in the address.
  await page.reload();
  await expect(page.getByRole('link', { name: 'FLT-1' })).toHaveCount(0);
  await expect(page.getByRole('link', { name: 'FLT-2' })).toBeVisible();

  await page.getByRole('textbox', { name: 'Name of the view' }).fill('Gold only');
  await page.getByRole('button', { name: 'Save view' }).click();
  await page.getByRole('button', { name: 'Clear filters' }).click();
  await expect(page.getByRole('link', { name: 'FLT-1' })).toBeVisible();

  await pick(page, 'Saved views', 'Gold only');
  await expect(page.getByRole('link', { name: 'FLT-1' })).toHaveCount(0);
  await expect(page.getByRole('link', { name: 'FLT-0' })).toBeVisible();
});

test('UI-03 a filter that the API would refuse is not added, and the person is told why', async () => {
  const page = shared;
  await page.goto('/admin/');
  await page.goto('/admin/crm/accounts');
  await pick(page, 'Field', 'visits');
  await page.getByRole('textbox', { name: 'Value' }).fill('many');
  await page.getByRole('button', { name: 'Add filter' }).click();
  await expect(page.getByRole('alert')).toContainText('visits');
  expect(decodeURIComponent(page.url())).not.toContain('filters');
});

test('UI-03 selected rows are deleted in one call, and the list shows what is left', async () => {
  const page = shared;
  await page.goto('/admin/');
  await rowsOf(page, 'BLK', ['basic', 'basic', 'basic']);
  await page.goto('/admin/crm/accounts');
  const row = (code: string) => page.getByRole('row').filter({ has: page.getByRole('link', { name: code }) });
  await row('BLK-0').getByRole('checkbox').check();
  await row('BLK-1').getByRole('checkbox').check();
  await expect(page.getByText('2 selected')).toBeVisible();
  await page.getByRole('button', { name: 'Delete selected' }).click();
  await page.getByRole('button', { name: 'Delete' }).last().click();
  await expect(page.getByText('2 rows done')).toBeVisible();
  await expect(page.getByRole('link', { name: 'BLK-0' })).toHaveCount(0);
  await expect(page.getByRole('link', { name: 'BLK-1' })).toHaveCount(0);
  await expect(page.getByRole('link', { name: 'BLK-2' })).toBeVisible();
});

test('UI-03, IO-04 the export is a CSV of the filtered list, and a formula in a cell is made harmless', async () => {
  const page = shared;
  await page.goto('/admin/');
  await makeRow(page, ACCOUNTS, { code: 'CSV-1', name: '=HYPERLINK("http://x.test")', tier: 'vip' });
  await page.goto('/admin/crm/accounts');
  await pick(page, 'Field', 'tier');
  await pick(page, 'Value', 'vip');
  await page.getByRole('button', { name: 'Add filter' }).click();
  await expect(page.getByRole('link', { name: 'CSV-1' })).toBeVisible();

  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export CSV' }).click();
  const file = await download;
  expect(file.suggestedFilename()).toBe('crm.Account.csv');
  const stream = await file.createReadStream();
  const chunks: Buffer[] = [];
  for await (const chunk of stream) chunks.push(Buffer.from(chunk));
  const text = Buffer.concat(chunks).toString('utf8');
  expect(text.split('\r\n')[0]).toContain('code,name,tier,visits,active');
  expect(text).toContain('CSV-1,"\'=HYPERLINK(""http://x.test"")",vip');
  expect(text).not.toContain('FLT-1');
});

test('UI-05 the language of the screens follows the choice in the header, and stays after a reload', async () => {
  const page = shared;
  await page.goto('/admin/');
  await page.goto('/admin/crm/accounts');
  await expect(page.getByRole('button', { name: 'New' })).toBeVisible();
  await pick(page, 'Language', 'Tiếng Việt');
  await expect(page.getByRole('button', { name: 'Thêm mới' })).toBeVisible();
  await page.reload();
  await expect(page.getByRole('button', { name: 'Thêm mới' })).toBeVisible();
  await pick(page, /Ngôn ngữ|Language/, 'English');
  await expect(page.getByRole('button', { name: 'New' })).toBeVisible();
});

test('UI-17 a form that was left half written offers its draft on the next visit', async () => {
  const page = shared;
  await page.goto('/admin/');
  await page.goto('/admin/crm/accounts/new');
  await page.getByRole('textbox', { name: 'code' }).fill('DRAFT-1');
  await page.getByRole('textbox', { name: 'name' }).fill('Half written');
  // The draft is kept a moment after the last key.
  await page.waitForTimeout(1500);
  await page.reload();
  await expect(page.getByText('A draft of this form was found on this browser.')).toBeVisible();
  await page.getByRole('button', { name: 'Restore the draft' }).click();
  await expect(page.getByRole('textbox', { name: 'name' })).toHaveValue('Half written');
});

test('UI-18 a save of a row that someone else changed shows what changed, and the choices', async () => {
  const page = shared;
  await page.goto('/admin/');
  const row = await makeRow(page, ACCOUNTS, { code: 'CNF-1', name: 'Mine', note: 'first' });
  await page.goto(`/admin/crm/accounts/${String(row['id'])}`);
  await expect(page.getByRole('textbox', { name: 'name' })).toHaveValue('Mine');
  // Someone else changes the same row.
  const other = await callApi(
    page,
    'PATCH',
    `${ACCOUNTS}/${String(row['id'])}`,
    { name: 'Theirs' },
    { 'if-match': String(row['version']) },
  );
  expect(other.status).toBe(200);
  await page.getByRole('textbox', { name: 'name' }).fill('Mine again');
  await page.getByRole('button', { name: 'Save' }).click();
  await expect(page.getByText('Someone else changed this row')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Keep my changes on top of theirs' })).toBeVisible();
  await expect(listOf(page).getByText('Theirs')).toBeVisible();
});
