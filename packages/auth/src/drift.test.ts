/**
 * BieberKit
 *
 * @file        packages/auth/src/drift.test.ts
 * @description Tests of the drift check: the entities of BieberKit and the schema that Better Auth expects agree, and the check sees a difference (AUTH-10).
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

import { describe, expect, it } from 'vitest';
import { organization } from 'better-auth/plugins';
import { createAuth } from './better-auth.ts';
import { checkAuthDrift, driftEntities } from './drift.ts';
import { describeDialects } from './testing/dialects.ts';

describeDialects('AUTH-10 the drift check on the real entities', ({ open }) => {
  const setup = async () => {
    const db = await open([]);
    const auth = createAuth({ db, dialect: db.dialect, secret: 'x'.repeat(40), baseUrl: 'https://app.test' });
    return { auth, entities: driftEntities(db) };
  };

  it('AUTH-10 finds no difference between the five entities and what Better Auth expects', async () => {
    const { auth, entities } = await setup();
    expect(checkAuthDrift(auth.options, entities)).toEqual([]);
  });

  it('AUTH-10 sees a property that is missing, a property that is nullable by mistake and a unique key that is missing', async () => {
    const { auth, entities } = await setup();
    const broken = structuredClone(entities);
    delete broken['authSession']?.properties['token'];
    delete broken['authAccount']?.properties['password'];
    const name = broken['authUser']?.properties['name'];
    if (name !== undefined) name.nullable = true;
    const email = broken['authUser']?.properties['email'];
    if (email !== undefined) email.unique = false;
    const problems = checkAuthDrift(auth.options, broken);
    expect(problems).toEqual(
      expect.arrayContaining([
        expect.stringContaining('authSession.token'),
        expect.stringContaining('authAccount.password'),
        expect.stringContaining('authUser.name'),
        expect.stringContaining('authUser.email'),
      ]),
    );
  });

  it('AUTH-10 sees a plugin that wants a table or a column that the entities do not have', async () => {
    const { auth, entities } = await setup();
    const problems = checkAuthDrift({ ...auth.options, plugins: [organization()] }, entities);
    expect(problems.join('\n')).toMatch(/organization/);
    expect(problems.join('\n')).toMatch(/member/);
  });
});

describeDialects('AUTH-10 the drift check with each method on', ({ open }) => {
  const check = async (methods: Parameters<typeof createAuth>[0]['methods']) => {
    const db = await open([]);
    const auth = createAuth({
      db,
      dialect: db.dialect,
      secret: 'x'.repeat(40),
      baseUrl: 'https://app.test',
      ...(methods === undefined ? {} : { methods }),
    });
    return checkAuthDrift(auth.options, driftEntities(db));
  };

  it('AUTH-10 TOTP: the table and the flag of the user agree with the entities', async () => {
    expect(await check({ totp: { issuer: 'x' } })).toEqual([]);
  });

  it('AUTH-10 passkeys: the table agrees with the entity', async () => {
    expect(await check({ passkey: { rpName: 'x' } })).toEqual([]);
  });

  it('AUTH-10 the magic link needs no table of its own', async () => {
    expect(await check({ magicLink: { send: async () => undefined } })).toEqual([]);
  });

  it('AUTH-10 all of them together agree too', async () => {
    expect(
      await check({ totp: { issuer: 'x' }, passkey: { rpName: 'x' }, magicLink: { send: async () => undefined } }),
    ).toEqual([]);
  });
});

describe('AUTH-10 the drift check on its own', () => {
  it('AUTH-10 reports an entity that is missing', () => {
    // The options are read and no query is sent, so a bare object stands for the database.
    const auth = createAuth({
      // oxlint-disable-next-line typescript/no-unsafe-type-assertion
      db: {} as never,
      dialect: 'sqlite',
      secret: 'x'.repeat(40),
      baseUrl: 'https://app.test',
    });
    expect(checkAuthDrift(auth.options, {})).toEqual(expect.arrayContaining([expect.stringContaining('authUser')]));
  });
});
