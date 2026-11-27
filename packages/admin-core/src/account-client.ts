/**
 * BieberKit
 *
 * @file        packages/admin-core/src/account-client.ts
 * @description The calls of the account screens: the second factor, the password links, the password, the sessions and the own profile, on the routes of Better Auth and of the users plugin (UI-26, USR-12).
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

import type { SessionUser } from './types.ts';

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

export interface AccountClient {
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

/** What the calls need of the client: one request, with the failures of the API as errors, and the user of an answer. */
export interface Transport {
  readonly request: (method: string, path: string, body?: unknown) => Promise<unknown>;
  readonly userOf: (body: unknown) => SessionUser;
  /** Whether an error of `request` is the answer 404. */
  readonly isNotFound: (error: unknown) => boolean;
}

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null;
const text = (value: unknown): string => (typeof value === 'string' ? value : '');
const texts = (value: unknown): string[] => (Array.isArray(value) ? value.map(text).filter((item) => item !== '') : []);
const records = (value: unknown): Record<string, unknown>[] => (Array.isArray(value) ? value.filter(isRecord) : []);
const field = (value: unknown, name: string): unknown => (isRecord(value) ? value[name] : undefined);

const AUTH = '/api/auth';
const ME = '/api/v1/users/me';

export function accountClient(transport: Transport): AccountClient {
  const { request } = transport;
  const post = (path: string, body: unknown): Promise<unknown> => request('POST', `${AUTH}${path}`, body);
  const get = (path: string): Promise<unknown> => request('GET', `${AUTH}${path}`);

  return {
    async verifySecondFactor(code, kind) {
      const path = kind === 'totp' ? '/two-factor/verify-totp' : '/two-factor/verify-backup-code';
      return transport.userOf(await post(path, { code }));
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
        body = await request('GET', ME);
      } catch (error) {
        if (transport.isNotFound(error)) return undefined;
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
      await request('PATCH', ME, { name });
    },
  };
}
