/**
 * BieberKit
 *
 * @file        packages/auth/src/authenticator.dialects.test.ts
 * @description Tests of the authenticator: a session cookie becomes the principal of a request, and nothing else does (AUTH-01, AUTH-02).
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
import { runInUnitOfWork } from '@bieberkit/data/orm';
import { createAuthenticator } from './authenticator.ts';
import { AuthSession } from './tables.ts';
import { authServer } from './testing/auth-server.ts';
import { describeDialects } from './testing/dialects.ts';

const info = (cookie?: string) => ({
  method: 'GET',
  path: '/api/v1/crm/deals',
  headers: cookie === undefined ? {} : { cookie },
  ip: '127.0.0.1',
});

describeDialects('AUTH-01 the authenticator', ({ open }) => {
  it('AUTH-01 gives the principal of a valid cookie: the user, how it came and the session', async () => {
    const app = await authServer(open);
    const { id, cookie } = await app.login('an@example.vn');
    const principal = await createAuthenticator(app.auth).authenticate(info(cookie));
    expect(principal).toMatchObject({ id, kind: 'user', via: 'cookie' });
    const shown = (await app.api('GET', '/get-session', { cookie })).body['session'];
    expect(principal?.sessionId).toBe(
      typeof shown === 'object' && shown !== null && 'id' in shown ? String(shown.id) : '',
    );
  });

  it('AUTH-01 gives no principal and asks no question of the database when there is no cookie', async () => {
    const app = await authServer(open);
    const before = app.queries.length;
    expect(await createAuthenticator(app.auth).authenticate(info())).toBeUndefined();
    expect(await createAuthenticator(app.auth).authenticate(info('other=1; theme=dark'))).toBeUndefined();
    expect(app.queries.length).toBe(before);
  });

  it('AUTH-01 gives no principal for a cookie that is forged, expired, or of a session that was signed out', async () => {
    const app = await authServer(open);
    const authenticator = createAuthenticator(app.auth);
    const { cookie } = await app.login('an@example.vn');
    expect(await authenticator.authenticate(info('__Host-bk_session=forged.value'))).toBeUndefined();
    await app.api('POST', '/sign-out', { cookie, payload: {} });
    expect(await authenticator.authenticate(info(cookie))).toBeUndefined();
    const second = await app.login('bo@example.vn');
    await runInUnitOfWork(app.db, async (em) => {
      await em.nativeUpdate(AuthSession, {}, { expiresAt: new Date('2020-01-01T00:00:00.000Z') });
    });
    expect(await authenticator.authenticate(info(second.cookie))).toBeUndefined();
  });

  it('AUTH-01 a header Authorization is not read: a token is for the API keys of another slice', async () => {
    const app = await authServer(open);
    const { cookie } = await app.login('an@example.vn');
    const token = cookie.split('=')[1] ?? '';
    const principal = await createAuthenticator(app.auth).authenticate({
      ...info(),
      headers: { authorization: `Bearer ${token}` },
    });
    expect(principal).toBeUndefined();
  });

  it('AUTH-02 two users have two principals, and a request reads the session of its own cookie', async () => {
    const app = await authServer(open);
    const one = await app.login('one@example.vn');
    const two = await app.login('two@example.vn');
    const authenticator = createAuthenticator(app.auth);
    expect((await authenticator.authenticate(info(one.cookie)))?.id).toBe(one.id);
    expect((await authenticator.authenticate(info(two.cookie)))?.id).toBe(two.id);
  });
});
