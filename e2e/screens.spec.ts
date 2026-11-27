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
import { ACCOUNTS, callApi, makeRow, recordOf, signIn } from './support.ts';

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
  const files: string[] = [];
  page.on('request', (request) => void files.push(new URL(request.url()).pathname));
  await page.goto('/admin/crm/accounts');
  await expect(page.getByRole('button', { name: 'New' })).toBeVisible();
  // The other languages are chunks of their own (UI-12): English does not read them.
  expect(files.filter((file) => /\/(vi|zh)-[\w-]+\.js$/.test(file))).toEqual([]);
  await pick(page, 'Language', 'Tiếng Việt');
  await expect(page.getByRole('button', { name: 'Thêm mới' })).toBeVisible();
  expect(files.some((file) => /\/vi-[\w-]+\.js$/.test(file))).toBe(true);
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

const TICKETS = '/api/v1/crm/tickets';

test('UI-03, UI-13 a move that asks for something opens a form, and the row shows its new state at once', async () => {
  const page = shared;
  await page.goto('/admin/');
  await makeRow(page, TICKETS, { title: 'MOV-1' });
  await page.goto('/admin/crm/tickets');
  const row = page.getByRole('row').filter({ has: page.getByRole('link', { name: 'MOV-1' }) });
  await expect(row.getByRole('cell', { name: 'open', exact: true })).toBeVisible();

  // The server answers slowly, so the new state can only come from the screen.
  await page.route('**/api/v1/crm/tickets/*/actions/close', async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 1500));
    await route.continue();
  });
  await row.getByRole('button', { name: 'close' }).click();
  // The schema of the move says three letters at least, so the form refuses two before it asks.
  await page.getByRole('textbox', { name: 'reason' }).fill('ab');
  await page.getByRole('button', { name: 'Apply' }).click();
  await expect(page.getByText('At least 3 characters')).toBeVisible();
  await page.getByRole('textbox', { name: 'reason' }).fill('resolved');
  await page.getByRole('button', { name: 'Apply' }).click();
  await expect(row.getByRole('cell', { name: 'closed', exact: true })).toBeVisible({ timeout: 1000 });
  await expect(page.getByText('close done')).toBeVisible();
  await page.unroute('**/api/v1/crm/tickets/*/actions/close');
  await page.reload();
  await expect(row.getByRole('cell', { name: 'closed', exact: true })).toBeVisible();
  await expect(row.getByRole('button', { name: 'reopen' })).toBeVisible();
});

test('UI-13 a move that the server refuses is taken back', async () => {
  const page = shared;
  await page.goto('/admin/');
  await makeRow(page, TICKETS, { title: 'MOV-2' });
  await page.goto('/admin/crm/tickets');
  const row = page.getByRole('row').filter({ has: page.getByRole('link', { name: 'MOV-2' }) });
  await page.route('**/api/v1/crm/tickets/*/actions/close', (route) =>
    route.fulfill({
      status: 500,
      contentType: 'application/json',
      body: JSON.stringify({ code: 'X', detail: 'Broken.' }),
    }),
  );
  await row.getByRole('button', { name: 'close' }).click();
  await page.getByRole('textbox', { name: 'reason' }).fill('resolved');
  await page.getByRole('button', { name: 'Apply' }).click();
  await expect(page.getByText('Broken.')).toBeVisible();
  await expect(row.getByRole('cell', { name: 'open', exact: true })).toBeVisible();
  await page.unroute('**/api/v1/crm/tickets/*/actions/close');
});

test('UI-03 selected rows take a move together, and one value for a field', async () => {
  const page = shared;
  await page.goto('/admin/');
  await makeRow(page, TICKETS, { title: 'BLM-1' });
  await makeRow(page, TICKETS, { title: 'BLM-2' });
  await page.goto('/admin/crm/tickets');
  const row = (title: string) => page.getByRole('row').filter({ has: page.getByRole('link', { name: title }) });
  await row('BLM-1').getByRole('checkbox').check();
  await row('BLM-2').getByRole('checkbox').check();
  await pick(page, 'Move to', 'close');
  await page.getByRole('textbox', { name: 'reason' }).fill('batch closed');
  await page.getByRole('button', { name: 'Apply' }).click();
  await expect(page.getByText('2 rows done')).toBeVisible();
  await expect(row('BLM-1').getByRole('cell', { name: 'closed', exact: true })).toBeVisible();
  await expect(row('BLM-2').getByRole('cell', { name: 'closed', exact: true })).toBeVisible();

  await row('BLM-1').getByRole('checkbox').check();
  await row('BLM-2').getByRole('checkbox').check();
  await pick(page, 'Change a field', 'title');
  await page.getByRole('textbox', { name: 'title' }).fill('BLM-same');
  await page.getByRole('button', { name: 'Apply' }).click();
  await expect(page.getByRole('link', { name: 'BLM-same' })).toHaveCount(2);
});

test('UI-17 n opens a new row and / goes to the filters, and neither takes a letter from a field', async () => {
  const page = shared;
  await page.goto('/admin/crm/accounts');
  await expect(page.getByRole('button', { name: 'New' })).toBeVisible();
  await page.keyboard.press('/');
  await expect(page.getByRole('combobox', { name: 'Field' })).toBeFocused();
  // The focus is in a field now, so `n` is a letter.
  await page.keyboard.press('n');
  await expect(page).toHaveURL(/\/admin\/crm\/accounts$/);
  await page.locator('body').click({ position: { x: 5, y: 5 } });
  await page.keyboard.press('n');
  await expect(page).toHaveURL(/\/admin\/crm\/accounts\/new$/);
  await page.getByRole('textbox', { name: 'code' }).fill('nnn');
  await expect(page.getByRole('textbox', { name: 'code' })).toHaveValue('nnn');
});

test('UI-16 at 360 px the list is cards, nothing scrolls sideways, and a card can be selected and moved', async () => {
  const page = shared;
  await page.setViewportSize({ width: 360, height: 740 });
  try {
    await page.goto('/admin/');
    await makeRow(page, '/api/v1/crm/tickets', { title: 'MOB-1' });
    await page.goto('/admin/crm/tickets');
    const card = page.getByRole('listitem').filter({ has: page.getByRole('link', { name: 'MOB-1' }) });
    await expect(card).toBeVisible();
    await expect(page.getByRole('table')).toHaveCount(0);
    const wide = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(wide).toBeLessThanOrEqual(0);

    await card.getByRole('button', { name: 'close' }).click();
    await page.getByRole('textbox', { name: 'reason' }).fill('from a phone');
    await page.getByRole('button', { name: 'Apply' }).click();
    await expect(card.getByText('closed')).toBeVisible();

    await card.getByRole('checkbox').check();
    await expect(page.getByText('1 selected')).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(0);

    await page.goto('/admin/crm/accounts/new');
    await expect(page.getByRole('textbox', { name: 'code' })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(0);
  } finally {
    await page.setViewportSize({ width: 1280, height: 720 });
  }
});

test('UI-12 a person may take a page of 50 rows, and the list asks the API for it', async () => {
  const page = shared;
  await page.goto('/admin/crm/accounts');
  const asked = page.waitForRequest((request) => request.url().includes('pageSize=50'));
  await page.locator('.ant-pagination-options .ant-select').click();
  await page.locator('.ant-select-dropdown:not(.ant-select-dropdown-hidden)').getByTitle('50 / page').click();
  await asked;
});

test('UI-21 an error that nothing caught is sent without the e-mail in it, with the shape of the route', async () => {
  const page = shared;
  await page.goto('/admin/');
  await makeRow(page, ACCOUNTS, { code: 'REP-1', name: 'Reported' });
  const found = await callApi(page, 'GET', `${ACCOUNTS}?filter[code][eq]=REP-1`);
  const rows = recordOf(found.body)['data'];
  const id = String(recordOf(Array.isArray(rows) ? rows[0] : undefined)['id']);
  await page.goto(`/admin/crm/accounts/${id}`);
  const sent = page.waitForRequest((request) => request.url().includes('/api/v1/_client-reports'));
  await page.evaluate(() => {
    setTimeout(() => {
      throw new TypeError('Cannot read the account of ann@example.com');
    }, 0);
  });
  const body = recordOf(JSON.parse((await sent).postData() ?? '{}'));
  const error = recordOf(body['error']);
  expect(body['kind']).toBe('error');
  expect(error['kind']).toBe('TypeError');
  expect(error['message']).toBe('Cannot read the account of [email]');
  expect(error['route']).toBe('/admin/crm/accounts/:id');
});

test('UI-21 the vitals of a visit are sent when the person leaves, for a sample, and the login page may send them too', async ({
  browser,
  request,
}) => {
  const context = await browser.newContext();
  const page = await context.newPage();
  // The sample is a tenth of the visits, so this one is made to be in it.
  await page.addInitScript(() => {
    Math.random = () => 0;
  });
  const count = async (): Promise<number> => {
    const text = await (await request.get('http://127.0.0.1:4311/metrics')).text();
    return Number(/bk_admin_web_vitals_total\{name="FCP",rating="[a-z-]+"\} (\d+)/.exec(text)?.[1] ?? 0);
  };
  const before = await count();
  await page.goto('/admin/');
  await expect(page.getByRole('heading', { name: 'Sign in' })).toBeVisible();
  await page.waitForTimeout(500);
  // A request that a page makes as it goes is not one that the browser test can watch, so the metrics of the server are read.
  await page.goto('about:blank');
  await expect.poll(count, { timeout: 5000 }).toBeGreaterThan(before);
  await context.close();
});

test('UI-11 a row has its child tables as tabs, a new child starts pointing at the row, and the history is the audit log', async () => {
  const page = shared;
  await page.goto('/admin/');
  const account = await makeRow(page, ACCOUNTS, { code: 'TAB-1', name: 'Tabbed' });
  const id = String(account['id']);
  await makeRow(page, TICKETS, { title: 'CHILD-1', accountId: id });
  await makeRow(page, TICKETS, { title: 'CHILD-2', accountId: id });
  await makeRow(page, TICKETS, { title: 'OTHER-1' });
  await page.goto(`/admin/crm/accounts/${id}`);

  await page.getByRole('tab', { name: 'Ticket' }).click();
  await expect(page.getByRole('link', { name: 'CHILD-1' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'CHILD-2' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'OTHER-1' })).toHaveCount(0);

  await page.getByRole('button', { name: 'New Ticket' }).click();
  await expect(page).toHaveURL(/\/admin\/crm\/tickets\/new\?.*accountId=/);
  // The relation is filled in, and the picker names the account and not its id.
  await expect(page.locator('form').getByText('Tabbed')).toBeVisible();
  await page.getByRole('textbox', { name: 'title' }).fill('CHILD-3');
  await page.getByRole('button', { name: 'Save' }).click();
  await expect(page.getByRole('link', { name: 'CHILD-3' })).toBeVisible();

  await page.goto(`/admin/crm/accounts/${id}`);
  await page.getByRole('tab', { name: 'Ticket' }).click();
  await expect(page.getByRole('link', { name: 'CHILD-3' })).toBeVisible();

  await page.getByRole('tab', { name: 'History' }).click();
  await expect(page.getByText('create', { exact: true })).toBeVisible();
  await expect(page.getByText('Administrator')).toBeVisible();
});

test('UI-11 the fields that the server fills are shown beside the form, and a move can be taken from the row', async () => {
  const page = shared;
  await page.goto('/admin/');
  const ticket = await makeRow(page, TICKETS, { title: 'DETAIL-1' });
  await page.goto(`/admin/crm/tickets/${String(ticket['id'])}`);
  await expect(page.getByText('Filled in by the server')).toBeVisible();
  await expect(page.getByText('open', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'close' }).click();
  await page.getByRole('textbox', { name: 'reason' }).fill('done here');
  await page.getByRole('button', { name: 'Apply' }).click();
  await expect(page.getByText('closed', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'reopen' })).toBeVisible();
});

test('UI-11 a field that a condition hides is not in the form, and a field that it requires blocks the save until it has a value', async () => {
  const page = shared;
  await page.goto('/admin/crm/accounts/new');
  await page.getByRole('textbox', { name: 'code' }).fill('WHEN-1');
  await page.getByRole('textbox', { name: 'name' }).fill('Conditional');
  await expect(page.getByRole('textbox', { name: 'reason' })).toHaveCount(0);

  await page.getByRole('switch', { name: 'active' }).click();
  await expect(page.getByRole('textbox', { name: 'reason' })).toBeVisible();
  await page.getByRole('button', { name: 'Save' }).click();
  await expect(page.getByText('This field is required')).toBeVisible();
  await expect(page).toHaveURL(/\/crm\/accounts\/new/);

  await page.getByRole('textbox', { name: 'reason' }).fill('closed down');
  await page.getByRole('button', { name: 'Save' }).click();
  await expect(page.getByRole('link', { name: 'WHEN-1' })).toBeVisible();

  // Switching back to active hides the field again, and what was typed is not sent.
  await page.getByRole('link', { name: 'WHEN-1' }).click();
  await expect(page.getByRole('textbox', { name: 'reason' })).toHaveValue('closed down');
  await page.getByRole('switch', { name: 'active' }).click();
  await expect(page.getByRole('textbox', { name: 'reason' })).toHaveCount(0);
});

test('UI-11 a relation is picked by typing, the picker asks the server to search, and the list names the row', async () => {
  const page = shared;
  await page.goto('/admin/');
  await makeRow(page, ACCOUNTS, { code: 'REL-A', name: 'Relation Alpha' });
  await makeRow(page, ACCOUNTS, { code: 'REL-B', name: 'Relation Beta' });
  await makeRow(page, ACCOUNTS, { code: 'REL-C', name: 'Other Company' });
  await page.goto('/admin/crm/tickets/new');
  await page.getByRole('textbox', { name: 'title' }).fill('REL-TICKET');

  const searched = page.waitForRequest((request) => request.url().includes('q=relation+b'));
  await page.getByRole('combobox', { name: 'accountId' }).click();
  await page.getByRole('combobox', { name: 'accountId' }).fill('relation b');
  await searched;
  const open = page.locator('.ant-select-dropdown:not(.ant-select-dropdown-hidden)');
  await expect(open.getByTitle('Relation Beta')).toBeVisible();
  await expect(open.getByTitle('Relation Alpha')).toHaveCount(0);
  await open.getByTitle('Relation Beta').click();
  await page.getByRole('button', { name: 'Save' }).click();

  // The list shows the name of the account and not its id.
  const row = page.getByRole('row').filter({ has: page.getByRole('link', { name: 'REL-TICKET' }) });
  await expect(row.getByRole('cell', { name: 'Relation Beta' })).toBeVisible();

  // The same picker is the filter of the list.
  await pick(page, 'Field', 'accountId');
  await page.getByRole('combobox', { name: 'Value' }).fill('relation b');
  await page.locator('.ant-select-dropdown:not(.ant-select-dropdown-hidden)').getByTitle('Relation Beta').click();
  await page.getByRole('button', { name: 'Add filter' }).click();
  await expect(page.getByRole('link', { name: 'REL-TICKET' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'MOV-1' })).toHaveCount(0);
});

test('MOD-09 the lines of a ticket are edited in its form, saved with it, and a line that is not valid is shown before anything is sent', async () => {
  const page = shared;
  await page.goto('/admin/crm/tickets/new');
  await page.getByRole('textbox', { name: 'title' }).fill('LINES-1');
  await page.getByRole('button', { name: 'Add Work note' }).click();
  await page.getByRole('button', { name: 'Add Work note' }).click();
  await page.getByRole('textbox', { name: 'Work note 1 text' }).fill('call the client');
  // The second line has no text, which a line needs.
  await page.getByRole('button', { name: 'Save' }).click();
  await expect(page.getByText('Some lines are not valid')).toBeVisible();
  await expect(page.getByRole('alert').filter({ hasText: 'This field is required' })).toHaveCount(1);
  await expect(page).toHaveURL(/\/crm\/tickets\/new/);
  await page.getByRole('textbox', { name: 'Work note 2 text' }).fill('write the report');
  await page.getByRole('button', { name: 'Save' }).click();
  await expect(page.getByRole('link', { name: 'LINES-1' })).toBeVisible();

  // The lines come back when the row is opened, and a change of one and the removal of the other are saved.
  await page.getByRole('link', { name: 'LINES-1' }).click();
  await expect(page.getByRole('textbox', { name: 'Work note 1 text' })).toHaveValue('call the client');
  await expect(page.getByRole('textbox', { name: 'Work note 2 text' })).toHaveValue('write the report');
  await page.getByRole('textbox', { name: 'Work note 1 text' }).fill('called the client');
  await page.getByRole('button', { name: 'Remove Work note 2' }).click();
  await page.getByRole('button', { name: 'Save' }).click();
  await expect(page.getByRole('link', { name: 'LINES-1' })).toBeVisible();
  await page.getByRole('link', { name: 'LINES-1' }).click();
  await expect(page.getByRole('textbox', { name: 'Work note 1 text' })).toHaveValue('called the client');
  await expect(page.getByRole('textbox', { name: 'Work note 2 text' })).toHaveCount(0);

  // A save that changes the title and leaves the lines alone does not touch them.
  await page.getByRole('textbox', { name: 'title' }).fill('LINES-1 renamed');
  await page.getByRole('button', { name: 'Save' }).click();
  await page.getByRole('link', { name: 'LINES-1 renamed' }).click();
  await expect(page.getByRole('textbox', { name: 'Work note 1 text' })).toHaveValue('called the client');
});

/** The media routes and the bucket, played by the page: the e2e project has a disk that cannot sign, so the bytes need somewhere to go. */
async function playMedia(
  page: Page,
  file: { id: string; filename: string; contentType: string; kind: string },
): Promise<string[]> {
  const seen: string[] = [];
  const record = (status: string) => ({ data: { ...file, size: 5, status } });
  await page.route('**/api/v1/media**', async (route) => {
    const url = new URL(route.request().url());
    const key = `${route.request().method()} ${url.pathname}`;
    seen.push(key);
    const json = (body: unknown, status = 200) =>
      route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
    if (key === 'POST /api/v1/media') return json(record('pending'), 201);
    if (key.endsWith('/upload-url'))
      return json({
        url: `${url.origin}/__bucket/${file.id}`,
        method: 'PUT',
        headers: { 'content-type': file.contentType },
        expiresAt: 1,
      });
    if (key.endsWith('/confirm')) return json({ id: file.id, status: 'ready', size: 5 });
    if (key.endsWith('/url')) return json({ url: `${url.origin}/__bucket/${file.id}`, expiresAt: null });
    return json(record('ready'));
  });
  await page.route('**/__bucket/**', (route) => {
    seen.push(`${route.request().method()} bucket`);
    // A one pixel picture, so that the preview of an image has bytes to show.
    return route.fulfill({
      status: 200,
      contentType: 'image/png',
      body: Buffer.from(
        'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGNgYGD4DwABBAEAHnOcQAAAAABJRU5ErkJggg==',
        'base64',
      ),
    });
  });
  return seen;
}

test('UI-11 a file is picked, goes to the library and then to the bucket, and the form keeps its id', async () => {
  const page = shared;
  await page.goto('/admin/crm/accounts/new');
  const seen = await playMedia(page, {
    id: '0198aaaa-0000-7000-8000-000000000001',
    filename: 'contract.pdf',
    contentType: 'application/pdf',
    kind: 'document',
  });
  let sent: Record<string, unknown> = {};
  await page.route('**/api/v1/crm/accounts', async (route) => {
    if (route.request().method() !== 'POST') return route.continue();
    sent = JSON.parse(route.request().postData() ?? '{}');
    return route.fulfill({
      status: 201,
      contentType: 'application/json',
      body: JSON.stringify({ data: { id: 'x', version: 1 } }),
    });
  });
  await page.getByRole('textbox', { name: 'code' }).fill('FILE-1');
  await page.getByRole('textbox', { name: 'name' }).fill('With a file');

  // A file of a type that the field does not take is refused before anything is sent.
  await page
    .getByLabel('attachment')
    .setInputFiles({ name: 'picture.png', mimeType: 'image/png', buffer: Buffer.from('12345') });
  await expect(page.getByRole('alert').filter({ hasText: 'application/pdf' })).toBeVisible();
  expect(seen).toEqual([]);

  await page
    .getByLabel('attachment')
    .setInputFiles({ name: 'contract.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-') });
  await expect(page.getByText('contract.pdf (5 B)')).toBeVisible();
  expect(seen.slice(0, 4)).toEqual([
    'POST /api/v1/media',
    'POST /api/v1/media/0198aaaa-0000-7000-8000-000000000001/upload-url',
    'PUT bucket',
    'POST /api/v1/media/0198aaaa-0000-7000-8000-000000000001/confirm',
  ]);
  await page.getByRole('button', { name: 'Save' }).click();
  await expect.poll(() => sent['attachment']).toBe('0198aaaa-0000-7000-8000-000000000001');
  await page.unrouteAll({ behavior: 'ignoreErrors' });
});

test('UI-11 an image shows its picture, a file can be removed, and the server refuses an id that is not a file of the library', async () => {
  const page = shared;
  await page.goto('/admin/crm/accounts/new');
  await playMedia(page, {
    id: '0198aaaa-0000-7000-8000-000000000002',
    filename: 'logo.png',
    contentType: 'image/png',
    kind: 'image',
  });
  await page.getByRole('textbox', { name: 'code' }).fill('FILE-2');
  await page.getByRole('textbox', { name: 'name' }).fill('With a picture');
  await page
    .getByLabel('photo')
    .setInputFiles({ name: 'logo.png', mimeType: 'image/png', buffer: Buffer.from('12345') });
  await expect(page.getByRole('img', { name: 'logo.png' })).toBeVisible();

  // The library of this project has no such file, so the server refuses it at the field and nothing is saved.
  await page.getByRole('button', { name: 'Save' }).click();
  await expect(page.getByText('is not a file that you may use')).toBeVisible();
  await expect(page).toHaveURL(/\/crm\/accounts\/new/);

  await page.getByRole('button', { name: 'Remove the file of photo' }).click();
  await expect(page.getByRole('img', { name: 'logo.png' })).toHaveCount(0);
  await page.getByRole('button', { name: 'Save' }).click();
  await expect(page.getByRole('link', { name: 'FILE-2' })).toBeVisible();
  await page.unrouteAll({ behavior: 'ignoreErrors' });
});
