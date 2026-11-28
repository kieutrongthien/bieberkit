/**
 * BieberKit
 *
 * @file        plugins/users/src/admin/lib/rules.test.ts
 * @description The rules of the account screens: the password of AUTH-04, the codes, the device of a session, the address of the reset page and the sentence of each refusal (UI-26, AUTH-05).
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
import { describe, expect, it } from 'vitest';
import {
  authMessageKey,
  deviceOf,
  enrolmentNeeded,
  normalizeCode,
  passwordIsShort,
  passwordProblem,
  resetSearchOf,
  secretOfUri,
  stepExpired,
} from './rules.ts';

const refusal = (code: string, status = 400): AdminApiError => new AdminApiError(status, code, 'English text', '');

describe('UI-26 the rules of the screens', () => {
  it('UI-26 a code of six digits is sent without the spaces that an app shows', () => {
    expect(normalizeCode(' 123 456 ', 'totp')).toBe('123456');
    expect(normalizeCode(' ab12C-de34f ', 'backup')).toBe('ab12C-de34f');
  });

  it('AUTH-04 a password has 8 to 128 characters, counted as the server counts them, spaces included', () => {
    expect(passwordProblem('a'.repeat(7))).toBe('tooShort');
    expect(passwordProblem('a'.repeat(8))).toBeUndefined();
    expect(passwordProblem('a'.repeat(128))).toBeUndefined();
    expect(passwordProblem('a'.repeat(129))).toBe('tooLong');
    expect(passwordProblem('  abcdef')).toBeUndefined();
  });

  it('AUTH-04 under 15 characters the screen advises a longer one, and asks for no kind of character', () => {
    expect(passwordIsShort('a'.repeat(14))).toBe(true);
    expect(passwordIsShort('a'.repeat(15))).toBe(false);
  });

  it('UI-26 a session is named after its browser and its system, and an unknown one stays as it said', () => {
    const chrome =
      'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36';
    expect(deviceOf(chrome)).toBe('Chrome · Linux');
    expect(deviceOf(`${chrome} Edg/140.0.0.0`)).toBe('Edge · Linux');
    expect(
      deviceOf('Mozilla/5.0 (iPhone; CPU iPhone OS 19_0 like Mac OS X) AppleWebKit/605.1.15 Version/19.0 Safari/604.1'),
    ).toBe('Safari · iOS');
    expect(deviceOf('Mozilla/5.0 (Android 16; Mobile; rv:140.0) Gecko/140.0 Firefox/140.0')).toBe('Firefox · Android');
    expect(deviceOf('Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:140.0) Gecko/20100101 Firefox/140.0')).toBe(
      'Firefox · Windows',
    );
    expect(deviceOf('curl/8.5.0')).toBe('curl/8.5.0');
    expect(deviceOf('')).toBe('');
  });

  it('AUTH-05 the two codes that ask for a second factor open the screen that sets it up', () => {
    expect(enrolmentNeeded(refusal('AUTH_MFA_REQUIRED', 403))).toBe(true);
    expect(enrolmentNeeded(refusal('AUTH_MFA_ENROL_REQUIRED', 403))).toBe(true);
    expect(enrolmentNeeded(refusal('HTTP_FORBIDDEN', 403))).toBe(false);
    expect(enrolmentNeeded(new Error('AUTH_MFA_REQUIRED'))).toBe(false);
    expect(enrolmentNeeded(undefined)).toBe(false);
  });

  it('AUTH-05 a code step that expired, or that took too many tries, sends the person back to the password', () => {
    expect(stepExpired(refusal('INVALID_TWO_FACTOR_COOKIE', 401))).toBe(true);
    expect(stepExpired(refusal('TOO_MANY_ATTEMPTS_REQUEST_NEW_CODE'))).toBe(true);
    expect(stepExpired(refusal('INVALID_CODE', 401))).toBe(false);
  });

  it('UI-05 each refusal that the screens know has a sentence in the language of the person', () => {
    const known = {
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
    for (const [code, key] of Object.entries(known)) expect(authMessageKey(refusal(code))).toBe(key);
    expect(authMessageKey(refusal('HTTP_429', 429))).toBe('users.auth.error.tooMany');
    expect(authMessageKey(refusal('SOMETHING_ELSE'))).toBeUndefined();
  });
});

describe('UI-26 what an address says', () => {
  it('UI-26 the address of the reset page gives the token, the kind of link and whether it is spent', () => {
    expect(resetSearchOf('?token=tok-1')).toEqual({ token: 'tok-1', invite: false, invalid: false });
    expect(resetSearchOf('?invite=1&token=tok-1')).toEqual({ token: 'tok-1', invite: true, invalid: false });
    expect(resetSearchOf('?error=INVALID_TOKEN')).toEqual({ invite: false, invalid: true });
    expect(resetSearchOf('?invite=1&error=INVALID_TOKEN')).toEqual({ invite: true, invalid: true });
    expect(resetSearchOf('')).toEqual({ invite: false, invalid: true });
    expect(resetSearchOf('?token=')).toEqual({ invite: false, invalid: true });
  });

  it('AUTH-05 the secret that a person may type is the one of the address for the app', () => {
    expect(secretOfUri('otpauth://totp/demo:an%40example.vn?secret=JBSWY3DPEHPK3PXP&issuer=demo')).toBe(
      'JBSWY3DPEHPK3PXP',
    );
    expect(secretOfUri('not an address')).toBe('');
  });
});
