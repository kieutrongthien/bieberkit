/**
 * BieberKit
 *
 * @file        e2e/account.spec.ts
 * @description The account screens in a browser: sign in with a second factor, password links, enrolment, and the own profile, password, factor and sessions, with axe at both widths and both palettes (UI-26, UI-25, UI-07, UI-16).
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

import { randomUUID } from 'node:crypto';
import { AxeBuilder } from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import type { Browser, Page } from '@playwright/test';
import { totpCode } from '../packages/auth/src/testing/totp.ts';
import { callApi, mailedLink, settle, signIn } from './support.ts';

const RULES = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];
const PASSWORD = 'First-Passw0rd-of-a-person';
const NEXT_PASSWORD = 'Second-Passw0rd-of-a-person';
const USERS = '/api/v1/users/users';
const ROLES = '/api/v1/roles/roles';

let admin: Page;
let people = 0;
let addresses = 0;

/** An address of its own for each browser, so that the limits for an address are not shared between tests. */
const nextAddress = (): string => `198.51.100.${String((addresses += 1))}`;

async function browserOf(browser: Browser): Promise<Page> {
  const context = await browser.newContext({ extraHTTPHeaders: { 'x-forwarded-for': nextAddress() } });
  return context.newPage();
}

test.beforeAll(async ({ browser }) => {
  admin = await browserOf(browser);
  await signIn(admin);
});
test.afterAll(async () => {
  await admin.context().close();
});

const idOf = (body: unknown): string => String(Reflect.get(Object(body), 'id'));

/** A person made through the API by the administrator, so that no test changes the account that other tests use. */
async function person(extra: Record<string, unknown> = { password: PASSWORD }) {
  people += 1;
  // Unique in the server, also after Playwright starts a new worker for the tests that follow a failure.
  const email = `account-${randomUUID()}@example.com`;
  const made = await callApi(admin, 'POST', USERS, { name: `Person ${String(people)}`, email, ...extra });
  expect(made.status, JSON.stringify(made.body)).toBe(201);
  return { id: idOf(made.body), email };
}

async function fillSignIn(page: Page, email: string, password = PASSWORD): Promise<void> {
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
}

const welcome = (page: Page) => page.getByRole('heading', { name: 'Welcome', exact: true });
const codeStep = (page: Page) => page.getByRole('heading', { name: 'Enter the code' });

async function signInAs(page: Page, email: string, password = PASSWORD): Promise<void> {
  await page.goto('/admin/');
  await fillSignIn(page, email, password);
  await expect(welcome(page)).toBeVisible();
}

async function signOut(page: Page): Promise<void> {
  await page.getByRole('button', { name: /Account menu/ }).click();
  await page.getByRole('menuitem', { name: 'Sign out' }).click();
  await expect(page.getByRole('heading', { name: 'Sign in' })).toBeVisible();
}

/** `E2E_SHOTS=<folder>` keeps a picture of each screen, for a person to compare with the mockups. */
async function picture(page: Page, name: string): Promise<void> {
  const folder = process.env.E2E_SHOTS;
  if (folder !== undefined) await page.screenshot({ path: `${folder}/${name}.png`, animations: 'disabled' });
}

/** UI-07 and UI-16: no violation wide in light and dark and at 360 px, and no sideways scroll there. */
async function checkScreen(page: Page, name: string): Promise<void> {
  const views = [
    { suffix: 'light', width: 1280, height: 800, scheme: 'light' },
    { suffix: 'dark', width: 1280, height: 800, scheme: 'dark' },
    { suffix: '360', width: 360, height: 740, scheme: 'light' },
  ] as const;
  for (const view of views) {
    await page.setViewportSize({ width: view.width, height: view.height });
    await page.emulateMedia({ colorScheme: view.scheme, reducedMotion: 'reduce' });
    await settle(page);
    const result = await new AxeBuilder({ page }).withTags(RULES).analyze();
    expect(
      result.violations.map((found) => `${found.id}: ${found.nodes.map((node) => node.target.join(' ')).join(' | ')}`),
      `${name} ${view.suffix}`,
    ).toEqual([]);
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth),
      `${name} ${view.suffix} scrolls sideways`,
    ).toBe(0);
    await picture(page, `account-${name}-${view.suffix}`);
  }
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.emulateMedia({ colorScheme: 'light', reducedMotion: 'reduce' });
}

/** Goes through the three steps of setting up the second factor, from the password to the saved codes. */
async function setUpFactor(page: Page, checked = false): Promise<{ secret: string; codes: string[] }> {
  if (checked) await checkScreen(page, 'setup-password');
  await page.getByLabel('Password', { exact: true }).fill(PASSWORD);
  await page.getByRole('button', { name: 'Continue' }).click();
  const secret = (await page.getByTestId('totp-secret').innerText()).replaceAll(/\s/g, '');
  expect(secret).toMatch(/^[A-Z2-7]{16,}$/);
  await expect(page.getByTestId('totp-qr').locator('svg')).toBeVisible();
  if (checked) await checkScreen(page, 'setup-scan');
  await page.getByLabel('Code', { exact: true }).fill(totpCode(secret));
  await page.getByRole('button', { name: 'Verify' }).click();
  const list = page.getByRole('list', { name: 'Backup codes' });
  await expect(list.getByRole('listitem')).toHaveCount(10);
  const codes = (await list.getByRole('listitem').allInnerTexts()).map((text) => text.trim());
  if (checked) await checkScreen(page, 'setup-codes');
  const done = page.getByRole('button', { name: 'Done' });
  await expect(done).toBeDisabled();
  await page.getByRole('checkbox', { name: 'I have saved these codes' }).check();
  await done.click();
  return { secret, codes };
}

async function openAccount(page: Page, tab: string): Promise<void> {
  await page.getByRole('button', { name: /Account menu/ }).click();
  await page.getByRole('menuitem', { name: 'My account' }).click();
  await expect(page.getByRole('heading', { name: 'My account' })).toBeVisible();
  await page.getByRole('tab', { name: tab }).click();
}

test('UI-26 AUTH-05 a person sets up a second factor, and then signs in with a code or a backup code', async ({
  browser,
}) => {
  test.setTimeout(90_000);
  const { email } = await person();
  const page = await browserOf(browser);
  await signInAs(page, email);
  await openAccount(page, 'Two-factor sign in');
  await expect(page.getByText('Off', { exact: true })).toBeVisible();
  await checkScreen(page, 'factor-off');
  await page.getByRole('button', { name: 'Set up' }).click();
  const { secret, codes } = await setUpFactor(page, true);
  await expect(page.getByText('On', { exact: true })).toBeVisible();
  await checkScreen(page, 'factor-on');
  await signOut(page);

  await fillSignIn(page, email);
  await expect(codeStep(page)).toBeVisible();
  await checkScreen(page, 'code-step');
  await page.getByLabel('Code', { exact: true }).fill('000000');
  await page.getByRole('button', { name: 'Verify' }).click();
  await expect(page.getByText('That code is not right. Try the one that your app shows now.')).toBeVisible();
  // The way an app shows it, with a space in the middle.
  const code = totpCode(secret);
  await page.getByLabel('Code', { exact: true }).fill(`${code.slice(0, 3)} ${code.slice(3)}`);
  await page.getByRole('button', { name: 'Verify' }).click();
  await expect(welcome(page)).toBeVisible();
  await signOut(page);

  await fillSignIn(page, email);
  await page.getByRole('button', { name: 'Use a backup code' }).click();
  await page.getByLabel('Backup code').fill(codes[0] ?? '');
  await page.getByRole('button', { name: 'Verify' }).click();
  await expect(welcome(page)).toBeVisible();
  await page.context().close();
});

test('UI-26 AUTH-05 a person makes new backup codes and turns the factor off, each after the password', async ({
  browser,
}) => {
  test.setTimeout(90_000);
  const { email } = await person();
  const page = await browserOf(browser);
  await signInAs(page, email);
  await openAccount(page, 'Two-factor sign in');
  await page.getByRole('button', { name: 'Set up' }).click();
  const { codes } = await setUpFactor(page);

  await page.getByRole('button', { name: 'New backup codes' }).click();
  await page.getByLabel('Password', { exact: true }).fill(PASSWORD);
  await page.getByRole('button', { name: 'Continue' }).click();
  const list = page.getByRole('list', { name: 'Backup codes' });
  await expect(list.getByRole('listitem')).toHaveCount(10);
  expect(await list.getByRole('listitem').allInnerTexts()).not.toEqual(codes);
  await page.getByRole('checkbox', { name: 'I have saved these codes' }).check();
  await page.getByRole('button', { name: 'Done' }).click();
  await expect(list).toHaveCount(0);

  await page.getByRole('button', { name: 'Turn off' }).click();
  await page.getByLabel('Password', { exact: true }).fill('not the password');
  await page.getByRole('button', { name: 'Continue' }).click();
  await expect(page.getByText('The current password is not right.')).toBeVisible();
  await page.getByLabel('Password', { exact: true }).fill(PASSWORD);
  await page.getByRole('button', { name: 'Continue' }).click();
  await expect(page.getByText('Off', { exact: true })).toBeVisible();
  await signOut(page);
  await fillSignIn(page, email);
  await expect(welcome(page)).toBeVisible();
  await page.context().close();
});

test('UI-26 the code step goes back to the password when it expired', async ({ browser }) => {
  const { email } = await person();
  const page = await browserOf(browser);
  await signInAs(page, email);
  await openAccount(page, 'Two-factor sign in');
  await page.getByRole('button', { name: 'Set up' }).click();
  const { secret } = await setUpFactor(page);
  await signOut(page);
  await fillSignIn(page, email);
  await expect(codeStep(page)).toBeVisible();
  // The cookie of the pending step is gone, as after the time that it lives.
  await page.context().clearCookies();
  await page.getByLabel('Code', { exact: true }).fill(totpCode(secret));
  await page.getByRole('button', { name: 'Verify' }).click();
  await expect(page.getByRole('heading', { name: 'Sign in' })).toBeVisible();
  await expect(page.getByText('The code step expired. Sign in again.')).toBeVisible();
  await page.context().close();
});

test('UI-26 AUTH-06 a forgotten password is asked for with one sentence for every address, and set through the link', async ({
  browser,
}) => {
  test.setTimeout(90_000);
  const { email } = await person();
  const page = await browserOf(browser);
  const sentence = page.getByText('If an account has that address, a link is on its way.');
  const stranger = await browserOf(browser);
  for (const [who, address] of [
    [stranger, 'nobody@example.com'],
    [page, email],
  ] as const) {
    await who.goto('/admin/');
    await who.getByRole('link', { name: 'Forgot password?' }).click();
    await expect(who.getByRole('heading', { name: 'Reset your password' })).toBeVisible();
    if (who === stranger) await checkScreen(who, 'forgot');
    await who.getByLabel('Email').fill(address);
    await who.getByRole('button', { name: 'Send the link' }).click();
    await expect(who.getByText('If an account has that address, a link is on its way.')).toBeVisible();
  }
  await expect(sentence).toBeVisible();
  await stranger.context().close();

  const link = mailedLink(email);
  await page.goto(link);
  await expect(page.getByRole('heading', { name: 'Choose a new password' })).toBeVisible();
  // The token is read and taken out of the address, so that it is not in the history.
  await expect(page).toHaveURL(/\/admin\/reset-password$/);
  await checkScreen(page, 'reset');
  await page.getByLabel('New password').fill(NEXT_PASSWORD);
  await page.getByLabel('Repeat the password').fill(`${NEXT_PASSWORD}x`);
  await page.getByRole('button', { name: 'Set password' }).click();
  await expect(page.getByText('The two passwords differ.')).toBeVisible();
  await page.getByLabel('Repeat the password').fill(NEXT_PASSWORD);
  await page.getByRole('button', { name: 'Set password' }).click();
  await expect(page.getByText('Your password is set. Sign in with it.')).toBeVisible();
  await fillSignIn(page, email, NEXT_PASSWORD);
  await expect(welcome(page)).toBeVisible();
  await signOut(page);

  // The same link again.
  await page.goto(link);
  await expect(page.getByRole('heading', { name: 'This link no longer works' })).toBeVisible();
  await checkScreen(page, 'reset-spent');
  await page.getByRole('link', { name: 'Send a new link' }).click();
  await expect(page.getByRole('heading', { name: 'Reset your password' })).toBeVisible();
  await page.context().close();
});

test('UI-26 USR-10 an invited person chooses a first password through the link and signs in', async ({ browser }) => {
  const { email } = await person({ invite: true });
  const page = await browserOf(browser);
  await page.goto(mailedLink(email));
  await expect(page.getByRole('heading', { name: 'Welcome. Choose your password' })).toBeVisible();
  await expect(page.getByText('A password of 15 characters or more is much harder to guess.')).toBeVisible();
  await checkScreen(page, 'invite');
  await page.getByLabel('New password').fill(PASSWORD);
  await page.getByLabel('Repeat the password').fill(PASSWORD);
  await page.getByRole('button', { name: 'Set password' }).click();
  await expect(page.getByText('Your password is set. Sign in with it.')).toBeVisible();
  await signInAs(page, email);
  await page.context().close();
});

test('UI-26 a link of another account opened while signed in changes that password and leaves the person signed in', async ({
  browser,
}) => {
  const mine = await person();
  const other = await person({ invite: true });
  const page = await browserOf(browser);
  await signInAs(page, mine.email);
  await page.goto(mailedLink(other.email));
  await page.getByLabel('New password').fill(NEXT_PASSWORD);
  await page.getByLabel('Repeat the password').fill(NEXT_PASSWORD);
  await page.getByRole('button', { name: 'Set password' }).click();
  await expect(welcome(page)).toBeVisible();
  await expect(page.getByRole('button', { name: /Account menu/ })).toContainText(mine.email);
  await page.context().close();
});

test('UI-26 AUTH-05 a role that asks for a second factor opens the screen that sets it up, and then the admin', async ({
  browser,
}) => {
  test.setTimeout(90_000);
  const { id, email } = await person();
  const role = await callApi(admin, 'POST', ROLES, {
    name: `strict-${randomUUID()}`,
    permissions: ['users.read'],
    requireMfa: true,
  });
  expect(role.status, JSON.stringify(role.body)).toBe(201);
  const given = await callApi(admin, 'POST', `${ROLES}/${idOf(role.body)}/assign`, { userIds: [id] });
  expect(given.status, JSON.stringify(given.body)).toBe(200);

  const page = await browserOf(browser);
  await page.goto('/admin/');
  await fillSignIn(page, email);
  await expect(page.getByRole('heading', { name: 'Set up two-factor sign in' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Sign out' })).toBeVisible();
  await checkScreen(page, 'enrol');
  await setUpFactor(page);
  await expect(welcome(page)).toBeVisible();

  await openAccount(page, 'Two-factor sign in');
  await expect(page.getByText('Your role or your organization requires it, so it cannot be turned off.')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Turn off' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'New backup codes' })).toBeVisible();
  await checkScreen(page, 'factor-required');
  await page.context().close();
});

test('UI-26 POL-02 during the days of grace the frame says by when, with a link to set it up', async ({ browser }) => {
  const { email } = await person();
  const page = await browserOf(browser);
  // The server's side of the grace is covered by its own tests. Here the answer says it, so that no other test meets the rule.
  await page.route('**/api/v1/users/me', async (route) => {
    const response = await route.fetch();
    const body: unknown = await response.json();
    await route.fulfill({
      response,
      json: { ...Object(body), mfaRequired: true, mfaEnrolBy: '2027-03-15T12:00:00.000Z' },
    });
  });
  await signInAs(page, email);
  const notice = page.getByRole('alert').filter({ hasText: 'Set up two-factor sign in by' });
  await expect(notice).toContainText('2027');
  await checkScreen(page, 'grace');
  await notice.getByRole('link', { name: 'Set it up' }).click();
  await expect(page.getByRole('tab', { name: 'Two-factor sign in', selected: true })).toBeVisible();
  await notice.getByRole('button', { name: /close/i }).click();
  await expect(notice).toHaveCount(0);
  await page.context().close();
});

test('UI-26 USR-12 a person renames themselves, changes the password and ends a session', async ({ browser }) => {
  test.setTimeout(90_000);
  const { email } = await person();
  const elsewhere = await browserOf(browser);
  await signInAs(elsewhere, email);
  const page = await browserOf(browser);
  const files: string[] = [];
  page.on('request', (request) => void files.push(new URL(request.url()).pathname));
  await signInAs(page, email);

  await openAccount(page, 'Profile');
  await expect(page.getByText(email, { exact: true }).first()).toBeVisible();
  await page.getByLabel('Name').fill('A New Name');
  await page.getByRole('button', { name: 'Save' }).click();
  await expect(page.getByText('Saved')).toBeVisible();
  await page.reload();
  await expect(page.getByLabel('Name')).toHaveValue('A New Name');
  await checkScreen(page, 'profile');

  await page.getByRole('tab', { name: 'Sessions' }).click();
  await expect(page.getByText('This device')).toHaveCount(1);
  await expect(page.getByRole('button', { name: 'End', exact: true })).toHaveCount(1);
  await checkScreen(page, 'sessions');
  await page.getByRole('button', { name: 'End', exact: true }).click();
  await expect(page.getByRole('button', { name: 'End', exact: true })).toHaveCount(0);
  await elsewhere.reload();
  await expect(elsewhere.getByRole('heading', { name: 'Sign in' })).toBeVisible();

  await page.getByRole('tab', { name: 'Password' }).click();
  await expect(page.getByRole('checkbox', { name: 'Sign out other sessions' })).toBeChecked();
  await checkScreen(page, 'password');
  await page.getByLabel('Current password').fill('not the password');
  await page.getByLabel('New password').fill(NEXT_PASSWORD);
  await page.getByLabel('Repeat the password').fill(NEXT_PASSWORD);
  await page.getByRole('button', { name: 'Change password' }).click();
  await expect(page.getByText('The current password is not right.')).toBeVisible();
  await page.getByLabel('Current password').fill(PASSWORD);
  await page.getByRole('button', { name: 'Change password' }).click();
  await expect(page.getByText('Password changed')).toBeVisible();
  await signOut(page);
  await fillSignIn(page, email, NEXT_PASSWORD);
  await expect(welcome(page)).toBeVisible();

  // An English session reads no other language (UI-12).
  expect(files.filter((file) => /\/(vi|zh)-[\w-]+\.js$/.test(file))).toEqual([]);
  await elsewhere.context().close();
  await page.context().close();
});
