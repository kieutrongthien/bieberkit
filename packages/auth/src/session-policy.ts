/**
 * BieberKit
 *
 * @file        packages/auth/src/session-policy.ts
 * @description What happens when a session is created: the session limit of a user and the notice of a sign in from a new device (POL-01, POL-04).
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

import { createHash } from 'node:crypto';
import { uuid7 } from '@bieberkit/data';
import { requestKysely } from '@bieberkit/data/orm';
import type { Database } from '@bieberkit/data/orm';
import type { AuthMailOptions } from './better-auth.ts';
import { defaultPolicyReader } from './policy.ts';
import type { PolicyReader } from './policy.ts';

/** The columns of a new session that the policies read. */
export interface CreatedSession {
  readonly userId: string;
  readonly ipAddress?: string | null | undefined;
  readonly userAgent?: string | null | undefined;
}

const fingerprintOf = (userAgent: string): string => createHash('sha256').update(userAgent).digest('hex');

/** A short name of a device for a mail: the user agent, cut. */
const deviceOf = (userAgent: string): string => (userAgent === '' ? 'an unknown device' : userAgent.slice(0, 120));

/** Revokes the oldest sessions of a user beyond `max`, so the new one always stays (POL-01). */
async function limitSessions(db: Database, userId: string, max: number): Promise<void> {
  const kysely = requestKysely(db);
  const surplus = await kysely
    .selectFrom('authSession')
    .select(['id'])
    .where('userId', '=', userId)
    .orderBy('createdAt', 'desc')
    .orderBy('id', 'desc')
    .limit(1000)
    .offset(max)
    .execute();
  if (surplus.length === 0) return;
  await kysely
    .deleteFrom('authSession')
    .where(
      'id',
      'in',
      surplus.map((row) => String(row.id)),
    )
    .execute();
}

/** Remembers the device. A device that is new for a user who had others sends the notice (POL-04). The first device is not news. */
async function noticeNewDevice(
  db: Database,
  mail: AuthMailOptions | undefined,
  session: CreatedSession,
): Promise<void> {
  const kysely = requestKysely(db);
  const fingerprint = fingerprintOf(session.userAgent ?? '');
  const known = await kysely
    .selectFrom('authKnownDevice')
    .select(['fingerprint'])
    .where('userId', '=', session.userId)
    .execute();
  const now = new Date();
  if (known.some((row) => row.fingerprint === fingerprint)) {
    await kysely
      .updateTable('authKnownDevice')
      .set({ lastSeenAt: now })
      .where('userId', '=', session.userId)
      .where('fingerprint', '=', fingerprint)
      .execute();
    return;
  }
  await kysely
    .insertInto('authKnownDevice')
    .values({ id: uuid7(), userId: session.userId, fingerprint, firstSeenAt: now, lastSeenAt: now })
    .execute();
  if (known.length === 0 || mail?.sendNewDevice === undefined) return;
  const user = await kysely
    .selectFrom('authUser')
    .select(['email'])
    .where('id', '=', session.userId)
    .executeTakeFirst();
  if (user === undefined) return;
  await mail.sendNewDevice({
    to: String(user.email),
    device: deviceOf(session.userAgent ?? ''),
    ip: session.ipAddress ?? '',
    at: now,
  });
}

/**
 * Runs after a session row is made. The session limit is enforced (an error stops the sign in). The notice is a courtesy: a failure
 * of it never refuses a sign in.
 */
export async function onSessionCreated(
  options: {
    readonly db: Database;
    readonly policy?: PolicyReader | undefined;
    readonly mail?: AuthMailOptions | undefined;
  },
  session: CreatedSession,
): Promise<void> {
  const policy = await (options.policy ?? defaultPolicyReader).read({});
  if (policy.session.maxConcurrent > 0) await limitSessions(options.db, session.userId, policy.session.maxConcurrent);
  if (!policy.signIn.notifyNewDevice) return;
  try {
    await noticeNewDevice(options.db, options.mail, session);
  } catch {
    // The device is remembered at the next sign in.
  }
}
