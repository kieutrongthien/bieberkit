/**
 * BieberKit
 *
 * @file        plugins/users/src/admin/rules.ts
 * @description The rules of the account screens that need no screen: the password of AUTH-04, the codes, the device of a session, the address of the reset page and the sentence of a refusal (UI-26).
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

import { AdminApiError } from '@bieberkit/admin-core';
import type { MessageKey } from './messages/en.ts';

/** The rules of AUTH-04. The server enforces them: these only say early what it would refuse, and advise. */
export const PASSWORD_MIN = 8;
export const PASSWORD_MAX = 128;
export const PASSWORD_ADVISED = 15;

/** What is wrong with a password. It is counted as typed, spaces included, as the server counts it. */
export function passwordProblem(text: string): 'tooShort' | 'tooLong' | undefined {
  if (text.length < PASSWORD_MIN) return 'tooShort';
  return text.length > PASSWORD_MAX ? 'tooLong' : undefined;
}

/** Whether the screen advises a longer password. It never asks for a kind of character. */
export const passwordIsShort = (text: string): boolean => text.length < PASSWORD_ADVISED;

/** The code that is sent: an app shows six digits with a space between them, and a backup code is sent as it was saved. */
export function normalizeCode(text: string, kind: 'totp' | 'backup'): string {
  return kind === 'totp' ? text.replaceAll(/\s/g, '') : text.trim();
}

/** The key that a person may type in place of scanning, from the address for an authenticator app. Empty when there is none. */
export function secretOfUri(uri: string): string {
  try {
    return new URL(uri).searchParams.get('secret') ?? '';
  } catch {
    return '';
  }
}

// The order matters: Edge and Opera also say Chrome, and Chrome also says Safari. An iPhone also says Mac OS X.
const BROWSERS: readonly (readonly [string, string])[] = [
  ['Edg', 'Edge'],
  ['OPR/', 'Opera'],
  ['Firefox/', 'Firefox'],
  ['Chrome/', 'Chrome'],
  ['Safari/', 'Safari'],
];
const SYSTEMS: readonly (readonly [string, string])[] = [
  ['Android', 'Android'],
  ['iPhone', 'iOS'],
  ['iPad', 'iOS'],
  ['Windows', 'Windows'],
  ['Mac OS X', 'macOS'],
  ['Linux', 'Linux'],
];

const named = (userAgent: string, names: readonly (readonly [string, string])[]): string | undefined =>
  names.find(([mark]) => userAgent.includes(mark))?.[1];

/** A name of the device of a session that a person can tell from another: the browser and the system, or what the device said. */
export function deviceOf(userAgent: string): string {
  const browser = named(userAgent, BROWSERS);
  if (browser === undefined) return userAgent.slice(0, 80);
  const system = named(userAgent, SYSTEMS);
  return system === undefined ? browser : `${browser} · ${system}`;
}

export interface ResetSearch {
  /** The token of the link. It is never kept: the screen holds it in memory and takes it out of the address. */
  readonly token?: string;
  /** The link is an invitation, so the person chooses a first password (USR-10). */
  readonly invite: boolean;
  /** The link was used, is too old, or has no token. */
  readonly invalid: boolean;
}

/** What the address of the reset page says. */
export function resetSearchOf(search: string): ResetSearch {
  const query = new URLSearchParams(search);
  const token = query.get('token') ?? '';
  const invite = query.get('invite') === '1';
  if (token === '' || query.has('error')) return { invite, invalid: true };
  return { token, invite, invalid: false };
}

const ENROLMENT = new Set(['AUTH_MFA_REQUIRED', 'AUTH_MFA_ENROL_REQUIRED']);

/** Whether the API refused because a second factor is asked of the person, so the screen that sets it up opens (AUTH-05, POL-02). */
export function enrolmentNeeded(error: unknown): boolean {
  return error instanceof AdminApiError && ENROLMENT.has(error.code);
}

const EXPIRED = new Set(['INVALID_TWO_FACTOR_COOKIE', 'TOO_MANY_ATTEMPTS_REQUEST_NEW_CODE']);

/** Whether the code step is over, so the person starts again with the password. */
export function stepExpired(error: unknown): boolean {
  return error instanceof AdminApiError && EXPIRED.has(error.code);
}

const SENTENCES: Readonly<Record<string, MessageKey>> = {
  INVALID_EMAIL_OR_PASSWORD: 'users.auth.error.credentials',
  INVALID_CODE: 'users.auth.error.code',
  INVALID_BACKUP_CODE: 'users.auth.error.backupCode',
  INVALID_PASSWORD: 'users.auth.error.currentPassword',
  INVALID_TOKEN: 'users.auth.error.link',
  AUTH_USER_DISABLED: 'users.auth.error.disabled',
  AUTH_NETWORK_DENIED: 'users.auth.error.network',
  ACCOUNT_TEMPORARILY_LOCKED: 'users.auth.error.locked',
  INVALID_TWO_FACTOR_COOKIE: 'users.auth.error.stepExpired',
  TOO_MANY_ATTEMPTS_REQUEST_NEW_CODE: 'users.auth.error.stepExpired',
};

/** The sentence of a refusal in the language of the person. A refusal that is not known keeps the text of the server. */
export function authMessageKey(error: AdminApiError): MessageKey | undefined {
  if (error.status === 429) return 'users.auth.error.tooMany';
  return SENTENCES[error.code];
}
