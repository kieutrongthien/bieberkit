/**
 * BieberKit
 *
 * @file        plugins/users/src/admin/api.ts
 * @description The calls of the account screens: the routes of Better Auth for the sign in, the password, the second factor and the sessions, and the profile of the users plugin (UI-26, USR-12, AUTH-05).
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
import type { AdminClient, SessionUser } from '@bieberkit/admin-core';

/** What a right password gives: the session, or for an account with a second factor the step that asks for the code. */
export type SignInResult =
  | { readonly kind: 'signedIn'; readonly user: SessionUser }
  | { readonly kind: 'secondFactor' };

/** What the code step takes: the six digits of the app, or one of the backup codes. */
export type CodeKind = 'totp' | 'backup';

/** One session of the account. `token` names it to end it, and is never kept outside the screen. */
export interface AdminSession {
  readonly token: string;
  readonly userAgent: string;
  readonly ip: string;
  readonly createdAt: string;
  readonly lastUsedAt: string;
  /** The session of this browser. */
  readonly current: boolean;
}

/** The signed-in person as `GET /users/me` says (USR-12). */
export interface Me {
  readonly id: string;
  readonly name: string;
  readonly email: string;
  readonly mfaEnabled: boolean;
  /** A second factor is asked of the person, by a role or by the rule for everyone (AUTH-05, POL-02). */
  readonly mfaRequired: boolean;
  /** In the days of grace of POL-02: when the second factor has to be set up. */
  readonly mfaEnrolBy?: string;
}

export interface TotpEnrolment {
  /** The address for an authenticator app, which the screen draws as a QR code. */
  readonly uri: string;
  readonly backupCodes: readonly string[];
}

export interface AccountApi {
  signIn(email: string, password: string): Promise<SignInResult>;
  /** The code after the password. It makes the session (AUTH-05). */
  verifySecondFactor(code: string, kind: CodeKind): Promise<SessionUser>;
  /** Asks for a link. The answer is the same for an address with and without an account (AUTH-06). */
  requestPasswordReset(email: string, redirectTo: string): Promise<void>;
  resetPassword(token: string, password: string): Promise<void>;
  changePassword(input: {
    readonly current: string;
    readonly next: string;
    readonly signOutOthers: boolean;
  }): Promise<void>;
  /** Whether the account has a password of its own. One that an identity provider made has none (IDN-02). */
  hasPassword(): Promise<boolean>;
  enableTotp(password: string): Promise<TotpEnrolment>;
  disableTotp(password: string): Promise<void>;
  /** Makes new backup codes. The ones before stop working. */
  renewBackupCodes(password: string): Promise<readonly string[]>;
  sessions(): Promise<readonly AdminSession[]>;
  revokeSession(token: string): Promise<void>;
  revokeOtherSessions(): Promise<void>;
  /** The profile of the signed-in person, or `undefined` in a project without the users plugin. */
  me(): Promise<Me | undefined>;
  renameMe(name: string): Promise<void>;
}

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null;
const text = (value: unknown): string => (typeof value === 'string' ? value : '');
const texts = (value: unknown): string[] => (Array.isArray(value) ? value.map(text).filter((item) => item !== '') : []);
const records = (value: unknown): Record<string, unknown>[] => (Array.isArray(value) ? value.filter(isRecord) : []);
const field = (value: unknown, name: string): unknown => (isRecord(value) ? value[name] : undefined);

const AUTH = '/api/auth';
const ME = '/api/v1/users/me';

function signedInUser(body: unknown): SessionUser {
  const user = field(body, 'user');
  if (!isRecord(user) || typeof user['id'] !== 'string')
    throw new AdminApiError(500, 'ADMIN_SIGN_IN_ANSWER', 'The server did not say who signed in.', '');
  return {
    id: user['id'],
    email: text(user['email']),
    name: text(user['name']),
    ...(user['twoFactorEnabled'] === true ? { twoFactorEnabled: true as const } : {}),
  };
}

/** The calls of the account, over the client of the admin, which carries the session and reads each refusal as an `AdminApiError`. */
export function accountApi(client: Pick<AdminClient, 'request'>): AccountApi {
  const post = (path: string, body: unknown): Promise<unknown> => client.request('POST', `${AUTH}${path}`, { body });
  const get = (path: string): Promise<unknown> => client.request('GET', `${AUTH}${path}`);

  return {
    async signIn(email, password) {
      const body = await post('/sign-in/email', { email, password });
      if (field(body, 'twoFactorRedirect') === true) return { kind: 'secondFactor' };
      return { kind: 'signedIn', user: signedInUser(body) };
    },
    async verifySecondFactor(code, kind) {
      const path = kind === 'totp' ? '/two-factor/verify-totp' : '/two-factor/verify-backup-code';
      return signedInUser(await post(path, { code }));
    },
    async requestPasswordReset(email, redirectTo) {
      await post('/request-password-reset', { email, redirectTo });
    },
    async resetPassword(token, password) {
      await post('/reset-password', { token, newPassword: password });
    },
    async changePassword(input) {
      await post('/change-password', {
        currentPassword: input.current,
        newPassword: input.next,
        revokeOtherSessions: input.signOutOthers,
      });
    },
    async hasPassword() {
      return records(await get('/list-accounts')).some((account) => account['providerId'] === 'credential');
    },
    async enableTotp(password) {
      const answer = await post('/two-factor/enable', { password });
      return { uri: text(field(answer, 'totpURI')), backupCodes: texts(field(answer, 'backupCodes')) };
    },
    async disableTotp(password) {
      await post('/two-factor/disable', { password });
    },
    async renewBackupCodes(password) {
      return texts(field(await post('/two-factor/generate-backup-codes', { password }), 'backupCodes'));
    },
    async sessions() {
      const [list, now] = await Promise.all([get('/list-sessions'), get('/get-session')]);
      const here = text(field(field(now, 'session'), 'token'));
      return records(list).map((session) => ({
        token: text(session['token']),
        userAgent: text(session['userAgent']),
        ip: text(session['ipAddress']),
        createdAt: text(session['createdAt']),
        lastUsedAt: text(session['updatedAt']),
        current: session['token'] === here,
      }));
    },
    async revokeSession(token) {
      await post('/revoke-session', { token });
    },
    async revokeOtherSessions() {
      await post('/revoke-other-sessions', {});
    },
    async me() {
      let body: unknown;
      try {
        body = await client.request('GET', ME);
      } catch (error) {
        if (error instanceof AdminApiError && error.status === 404) return undefined;
        throw error;
      }
      const enrolBy = text(field(body, 'mfaEnrolBy'));
      return {
        id: text(field(body, 'id')),
        name: text(field(body, 'name')),
        email: text(field(body, 'email')),
        mfaEnabled: field(body, 'mfaEnabled') === true,
        mfaRequired: field(body, 'mfaRequired') === true,
        ...(enrolBy === '' ? {} : { mfaEnrolBy: enrolBy }),
      };
    },
    async renameMe(name) {
      await client.request('PATCH', ME, { body: { name } });
    },
  };
}
