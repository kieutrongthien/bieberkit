/**
 * BieberKit
 *
 * @file        packages/auth/src/rotation.dialects.test.ts
 * @description Tests of the rotation of the secret: what Better Auth encrypted with the old secret is read with the new one when the old one is listed as previous (SEC-08, AUTH-11).
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
import { authServer, cookieNamed, cookieOf } from './testing/auth-server.ts';
import { describeDialects } from './testing/dialects.ts';
import { totpCode } from './testing/totp.ts';

const OLD = 'old-secret-that-is-long-enough-for-the-rule-0001';
const NEW = 'new-secret-that-is-long-enough-for-the-rule-0002';

const signIn = async (app: Awaited<ReturnType<typeof authServer>>, secret: string) => {
  const reply = await app.signIn('an@example.vn', { ip: '203.0.113.7' });
  return app.api('POST', '/two-factor/verify-totp', {
    ip: '203.0.113.7',
    cookie: cookieNamed(reply, '__Host-bk_two_factor') ?? '',
    payload: { code: totpCode(secret) },
  });
};

describeDialects('SEC-08 the rotation of the secret', ({ open }) => {
  async function enrolled() {
    const first = await authServer(open, { totp: true, secret: OLD });
    const { cookie } = await first.login('an@example.vn');
    const { secret } = await first.enableTotp(cookie);
    return { first, secret };
  }

  it('SEC-08 the TOTP secret is stored as an envelope with the id of the key, so a later rotation can find the key', async () => {
    const { first } = await enrolled();
    const [row] = await first.rows('select * from bk_auth_two_factors');
    expect(String(row?.['secret'])).toMatch(/^\$ba\$\d+\$/);
  });

  it('SEC-08 after the rotation, with the old secret as previous, the same TOTP secret still gives a session', async () => {
    const { first, secret } = await enrolled();
    const rotated = await authServer(open, { totp: true, secret: NEW, previousSecrets: [OLD], db: first.db });
    expect(cookieOf(await signIn(rotated, secret))).toBeDefined();
  });

  it('SEC-08 without the old secret listed, the TOTP secret cannot be read, and nobody gets a session by it', async () => {
    const { first, secret } = await enrolled();
    const lost = await authServer(open, { totp: true, secret: NEW, db: first.db });
    expect(cookieOf(await signIn(lost, secret))).toBeUndefined();
  });

  it('SEC-08 what is written after the rotation is made with the new secret, and the old one can then be dropped', async () => {
    const { first } = await enrolled();
    const rotated = await authServer(open, { totp: true, secret: NEW, previousSecrets: [OLD], db: first.db });
    const second = await rotated.login('bo@example.vn');
    const { secret } = await rotated.enableTotp(second.cookie);
    const dropped = await authServer(open, { totp: true, secret: NEW, db: first.db });
    const reply = await dropped.signIn('bo@example.vn', { ip: '203.0.113.8' });
    const done = await dropped.api('POST', '/two-factor/verify-totp', {
      ip: '203.0.113.8',
      cookie: cookieNamed(reply, '__Host-bk_two_factor') ?? '',
      payload: { code: totpCode(secret) },
    });
    expect(cookieOf(done)).toBeDefined();
  }, 30_000);
});
