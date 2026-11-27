/**
 * BieberKit
 *
 * @file        packages/auth/src/session-policy.dialects.test.ts
 * @description Tests of the session limit of a user and the notice of a sign in from a new device on three dialects (POL-01, POL-04).
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

import { expect, it } from 'vitest';
import { createAuthenticator } from './authenticator.ts';
import { DEFAULT_POLICY } from './policy.ts';
import type { PolicyReader, SecurityPolicy } from './policy.ts';
import { authServer } from './testing/auth-server.ts';
import { describeDialects } from './testing/dialects.ts';

const reader = (patch: Partial<SecurityPolicy>): PolicyReader => ({
  read: () => Promise.resolve({ ...DEFAULT_POLICY, ...patch }),
});

const info = (cookie: string) => ({ method: 'GET', path: '/api/v1/x', headers: { cookie }, ip: '127.0.0.1' });

describeDialects('POL sessions and devices', ({ open }) => {
  it('POL-01 the default keeps every session of a user', async () => {
    const app = await authServer(open, { policy: reader({}) });
    await app.login('an@example.vn');
    await app.signIn('an@example.vn');
    await app.signIn('an@example.vn');
    // `login` signs up (one session) and signs in (another).
    expect(await app.count('bk_auth_sessions')).toBe(4);
  });

  it('POL-01 max-concurrent revokes the oldest sessions at sign in, and the new one stays', async () => {
    const app = await authServer(open, {
      policy: reader({ session: { ...DEFAULT_POLICY.session, maxConcurrent: 2 } }),
    });
    const first = await app.login('an@example.vn');
    const second = await app.signIn('an@example.vn');
    const third = await app.signIn('an@example.vn');
    expect(await app.count('bk_auth_sessions')).toBe(2);
    const authenticator = createAuthenticator(app.auth);
    expect(await authenticator.authenticate(info(first.cookie))).toBeUndefined();
    const cookie = (reply: typeof second): string => String(reply.headers['set-cookie'] ?? '').split(';')[0] ?? '';
    expect((await authenticator.authenticate(info(cookie(third))))?.id).toBe(first.id);
    expect(second.status).toBe(200);
  });

  it('POL-01 the limit is per user: another user keeps their sessions', async () => {
    const app = await authServer(open, {
      policy: reader({ session: { ...DEFAULT_POLICY.session, maxConcurrent: 1 } }),
    });
    await app.login('an@example.vn');
    await app.login('bo@example.vn');
    await app.signIn('an@example.vn');
    expect(await app.count('bk_auth_sessions')).toBe(2);
  });

  it('POL-04 the first device is not news, a second device sends a notice, and a known device sends none', async () => {
    const app = await authServer(open, { policy: reader({}) });
    await app.login('an@example.vn');
    expect(app.mails.filter((mail) => mail.kind === 'new-device')).toHaveLength(0);
    await app.signIn('an@example.vn', { headers: { 'user-agent': 'Firefox/1' } });
    const notices = app.mails.filter((mail) => mail.kind === 'new-device');
    expect(notices).toHaveLength(1);
    expect(notices[0]).toMatchObject({ to: 'an@example.vn', url: 'Firefox/1' });
    await app.signIn('an@example.vn', { headers: { 'user-agent': 'Firefox/1' } });
    expect(app.mails.filter((mail) => mail.kind === 'new-device')).toHaveLength(1);
    expect(await app.count('bk_auth_known_devices')).toBe(2);
  });

  it('POL-04 notify-new-device off sends no notice and keeps no device', async () => {
    const app = await authServer(open, {
      policy: reader({ signIn: { notifyNewDevice: false } }),
    });
    await app.login('an@example.vn');
    await app.signIn('an@example.vn', { headers: { 'user-agent': 'Firefox/1' } });
    expect(app.mails.filter((mail) => mail.kind === 'new-device')).toHaveLength(0);
    expect(await app.count('bk_auth_known_devices')).toBe(0);
  });
});
