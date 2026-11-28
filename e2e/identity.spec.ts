/**
 * BieberKit
 *
 * @file        e2e/identity.spec.ts
 * @description The identity and the frame of the admin in a browser: the font from the origin of the admin, the grouped menu, the box that goes to a page, the sign in at both widths and both palettes with axe (UI-23, UI-24).
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
import { settle, signIn } from './support.ts';

const RULES = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];

/** `E2E_SHOTS=<folder>` keeps a picture of each screen, for a person to compare with the mockups. */
async function picture(page: Page, name: string): Promise<void> {
  const folder = process.env.E2E_SHOTS;
  if (folder !== undefined) await page.screenshot({ path: `${folder}/${name}.png`, animations: 'disabled' });
}

async function violations(page: Page): Promise<string[]> {
  await settle(page);
  const result = await new AxeBuilder({ page }).withTags(RULES).analyze();
  return result.violations.map(
    (violation) => `${violation.id}: ${violation.nodes.map((node) => node.target.join(' ')).join(' | ')}`,
  );
}

const sideways = (page: Page): Promise<number> =>
  page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);

test('UI-23 the sign in has the brand and the sentence, and the font comes from the origin of the admin', async ({
  page,
}) => {
  const fonts: string[] = [];
  page.on('response', (response) => {
    if (response.url().endsWith('.woff2')) fonts.push(new URL(response.url()).origin);
  });
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto('/admin/');
  await expect(page.getByRole('heading', { name: 'Sign in' })).toBeVisible();
  await expect(page.getByRole('img', { name: 'BieberKit' })).toBeVisible();
  await expect(page.getByText('One tidy kit. Every change on record.')).toBeVisible();
  await page.evaluate(() => document.fonts.ready);
  expect(await page.evaluate(() => document.fonts.check('600 16px "Be Vietnam Pro"'))).toBe(true);
  expect(fonts.length).toBeGreaterThan(0);
  expect(new Set(fonts)).toEqual(new Set(['http://127.0.0.1:4310']));
  await picture(page, 'login-light');
  await page.emulateMedia({ colorScheme: 'dark' });
  expect(await violations(page)).toEqual([]);
  await picture(page, 'login-dark');
});

test('UI-16, UI-23 the sign in at 360 px has no sideways scroll and no violation', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 740 });
  await page.goto('/admin/');
  await expect(page.getByRole('button', { name: 'Sign in' })).toBeVisible();
  expect(await sideways(page)).toBe(0);
  expect(await violations(page)).toEqual([]);
  await picture(page, 'login-360');
});

// One sign in for the screens behind it: the sign in is limited to a few in a minute for an address (AUTH-06).
test.describe('behind the sign in', () => {
  test.describe.configure({ mode: 'serial' });
  let page: Page;
  test.beforeAll(async ({ browser }) => {
    page = await (await browser.newContext({ viewport: { width: 1280, height: 800 } })).newPage();
    await signIn(page);
  });
  test.afterAll(async () => {
    await page.context().close();
  });

  test('UI-24 the menu is in groups, the chosen entry and the breadcrumb say where the person is', async () => {
    await page.setViewportSize({ width: 1280, height: 800 });
    const menu = page.getByRole('navigation', { name: 'Main menu' });
    await expect(menu.getByText('Application', { exact: true })).toBeVisible();
    await expect(menu.getByText('Content', { exact: true })).toBeVisible();
    await picture(page, 'welcome-light');
    await menu.getByRole('menuitem', { name: 'Account' }).click();
    await expect(menu.locator('.ant-menu-item-selected')).toHaveText('Account');
    const crumbs = page.getByRole('navigation', { name: 'Where you are' });
    await expect(crumbs.getByRole('listitem')).toHaveText(['Application', 'Account']);
    await expect(page.getByRole('button', { name: 'New' })).toBeVisible();
    expect(await violations(page)).toEqual([]);
    await picture(page, 'list-light');
  });

  test('UI-24 Ctrl+K opens the box, a name is typed, and Enter goes to the page', async () => {
    await page.goto('/admin/');
    await expect(page.getByRole('heading', { name: 'Welcome' })).toBeVisible();
    await page.keyboard.press('Control+k');
    const box = page.getByRole('combobox', { name: 'Name of a page' });
    await expect(box).toBeFocused();
    await box.fill('zzz');
    await expect(page.getByText('No page has that name.')).toBeVisible();
    await box.fill('ACCOU');
    await expect(page.getByRole('option', { name: 'Account' })).toBeVisible();
    expect(await violations(page)).toEqual([]);
    await picture(page, 'goto-light');
    await box.press('Enter');
    await expect(page).toHaveURL(/\/admin\/crm\/accounts$/);
  });

  test('UI-23 the frame and the tabs of a record in the dark palette and at 360 px', async () => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.emulateMedia({ colorScheme: 'dark' });
    await page.goto('/admin/');
    await expect(page.getByRole('heading', { name: 'Welcome' })).toBeVisible();
    expect(await violations(page)).toEqual([]);
    await picture(page, 'welcome-dark');
    await page.goto('/admin/crm/accounts/new');
    await expect(page.getByRole('button', { name: 'Save' })).toBeVisible();
    await picture(page, 'form-dark');
    await page.emulateMedia({ colorScheme: 'light' });
    await page.setViewportSize({ width: 360, height: 740 });
    await page.goto('/admin/');
    await expect(page.getByRole('heading', { name: 'Welcome' })).toBeVisible();
    expect(await sideways(page)).toBe(0);
    expect(await violations(page)).toEqual([]);
    await picture(page, 'welcome-360');
  });
});
