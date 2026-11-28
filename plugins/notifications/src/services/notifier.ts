/**
 * BieberKit
 *
 * @file        plugins/notifications/src/services/notifier.ts
 * @description The notifier: checks a notification and delivers it in the app and by mail, in the transaction of the caller (NTF-01 to NTF-04).
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

import { currentEntityManager, emitEvent, recordAudit, runInTransaction } from '@bieberkit/data/orm';
import type { Database } from '@bieberkit/data/orm';
import { MAIL_JOB } from '@bieberkit/mail';
import type { Mail } from '@bieberkit/mail';
import { HttpError } from '@bieberkit/http';
import { isUuid, uuid7 } from '@bieberkit/data';
import { AuthRole, AuthUser, AuthUserRole, NIL_TENANT } from '@bieberkit/auth';
import { requestContext } from '@bieberkit/core';
import type { Channel, Level, Notifier, SendInput } from './types.ts';
import { LEVELS, Notification } from '../entities/notification.ts';
import { CHANNELS, Preference } from '../entities/preference.ts';
import { EXPAND_EVENT } from '../events/names.ts';

export const MAX_DIRECT = 100;

const CATEGORY = /^[a-z][a-z0-9-]{0,59}$/;

type EntityManager = Parameters<Parameters<typeof runInTransaction>[1]>[0];

interface Bound {
  readonly db: Database;
  readonly mail: Mail;
  readonly retentionDays: number;
  readonly notifier: Notifier;
}

/** The services of the jobs: a job is declared before the container boots, so the notifier binds them when it is made. */
const bound: { current?: Bound } = {};

export function boundOf(): Bound {
  if (bound.current === undefined) {
    throw new HttpError(
      'NOTIFICATIONS_NOT_READY',
      500,
      'The notifications job ran before the notifier was made.',
      'Boot the container of the process with the notifications plugin before the worker starts.',
    );
  }
  return bound.current;
}

const invalid = (message: string): never => {
  throw new HttpError('NOTIFICATIONS_INVALID', 400, message, 'Fix the notification and send it again.');
};

interface Checked {
  readonly title: string;
  readonly body: string | null;
  readonly level: Level;
  readonly category: string;
  readonly link: string | null;
  readonly data: string | null;
  readonly channels: readonly Channel[];
  readonly dedupeKey: string | null;
  readonly expiresAt: Date | null;
}

const isLevel = (value: unknown): value is Level => typeof value === 'string' && LEVELS.includes(value);

const isChannel = (value: unknown): value is Channel => typeof value === 'string' && CHANNELS.includes(value);

function checked(input: SendInput): Checked {
  const title = input.title.trim();
  if (title === '' || title.length > 200) invalid('A title has 1 to 200 characters.');
  if (input.body !== undefined && input.body.length > 5000) invalid('A body has at most 5000 characters.');
  const level = input.level ?? 'info';
  if (!isLevel(level)) invalid(`The level is one of ${LEVELS.join(', ')}.`);
  const category = input.category ?? 'general';
  if (!CATEGORY.test(category)) invalid('A category is lower case letters, digits and dashes, at most 60.');
  if (input.link !== undefined && (input.link === '' || input.link.length > 500))
    invalid('A link has 1 to 500 characters.');
  const data = input.data === undefined ? null : JSON.stringify(input.data);
  if (data !== null && data.length > 10_000) invalid('The data has at most 10 000 characters of JSON.');
  const listed: readonly unknown[] = input.channels ?? ['in-app'];
  const channels = [...new Set(listed)].filter(isChannel);
  if (channels.length === 0 || channels.length !== new Set(listed).size)
    invalid(`The channels are some of ${CHANNELS.join(', ')}.`);
  if (input.dedupeKey !== undefined && (input.dedupeKey === '' || input.dedupeKey.length > 200))
    invalid('A dedupe key has 1 to 200 characters.');
  return {
    title,
    body: input.body ?? null,
    level,
    category,
    link: input.link ?? null,
    data,
    channels,
    dedupeKey: input.dedupeKey ?? null,
    expiresAt: input.expiresAt ?? null,
  };
}

const usersOf = (to: readonly string[]): string[] => {
  if (to.length > MAX_DIRECT) invalid(`A send names at most ${String(MAX_DIRECT)} users. Send to a role for more.`);
  if (!to.every(isUuid)) invalid('A recipient is the id of a user.');
  return [...new Set(to.map((id) => id.toLowerCase()))];
};

const isList = (value: SendInput['to']): value is readonly string[] => Array.isArray(value);

export const classOf = (em: EntityManager, name: string): abstract new (...args: never[]) => Record<string, unknown> =>
  em.getMetadata().getByClassName(name).class;

const text = (row: unknown, name: string): unknown => Reflect.get(Object(row), name);

/** In the transaction of the caller when one is open, so the notification commits or rolls back with the caller's write (NTF-01). */
async function inTransaction<T>(db: Database, run: (em: EntityManager) => Promise<T>): Promise<T> {
  const em = currentEntityManager();
  return em?.isInTransaction() === true ? run(em) : runInTransaction(db, run);
}

async function deliver(em: EntityManager, mail: Mail, users: readonly string[], note: Checked): Promise<number> {
  if (users.length === 0) return 0;
  const off = new Set(
    (
      await em.find(classOf(em, Preference.name), {
        userId: { $in: [...users] },
        category: note.category,
        enabled: false,
      })
    ).map((row) => `${String(text(row, 'userId'))}\u0000${String(text(row, 'channel'))}`),
  );
  const seen =
    note.dedupeKey === null
      ? new Set<string>()
      : new Set(
          (
            await em.find(classOf(em, Notification.name), { userId: { $in: [...users] }, dedupeKey: note.dedupeKey })
          ).map((row) => String(text(row, 'userId'))),
        );
  const wantsMail = note.channels.includes('mail');
  const emails = wantsMail
    ? new Map(
        (await em.find(AuthUser, { id: { $in: [...users] }, deletedAt: null })).map(
          (user) => [user.id, user.email] as const,
        ),
      )
    : new Map<string, string>();
  let created = 0;
  for (const userId of users) {
    if (seen.has(userId)) continue;
    if (note.channels.includes('in-app') && !off.has(`${userId}\u0000in-app`)) {
      // The id is made here, so that the event names it without a flush for each row.
      const id = uuid7();
      // The class comes from the metadata, so its type is not known here; the columns are those of `Notification`.
      // oxlint-disable-next-line typescript/no-unsafe-type-assertion
      em.create(classOf(em, Notification.name), {
        id,
        userId,
        title: note.title,
        body: note.body,
        level: note.level,
        category: note.category,
        link: note.link,
        data: note.data,
        dedupeKey: note.dedupeKey,
        expiresAt: note.expiresAt,
      } as never);
      created += 1;
      emitEvent(em, {
        name: 'notifications.created',
        payload: { id, userId, level: note.level, category: note.category },
        record: { entity: Notification.name, id },
      });
    }
    const address = emails.get(userId);
    if (wantsMail && address !== undefined && !off.has(`${userId}\u0000mail`)) {
      const lines = [note.body, note.link].filter((line): line is string => line !== null);
      emitEvent(em, {
        name: MAIL_JOB,
        payload: mail.prepare({ to: address, subject: note.title, text: lines.join('\n\n') || note.title }),
      });
    }
  }
  return created;
}

export function createNotifier(input: {
  readonly db: Database;
  readonly mail: Mail;
  readonly retentionDays: number;
}): Notifier {
  const { db, mail } = input;
  const notifier: Notifier = {
    async send(sent) {
      const note = checked(sent);
      const target = sent.to;
      return inTransaction(db, async (em) => {
        let users: string[];
        if (typeof target === 'string') users = usersOf([target]);
        else if (isList(target)) users = usersOf(target);
        else {
          const roleTarget = target;
          const tenant = (roleTarget.tenantId ?? requestContext.get()?.tenantId ?? NIL_TENANT).toLowerCase();
          const role = await em.findOne(AuthRole, { tenant, name: roleTarget.role });
          if (role === null) {
            throw new HttpError(
              'NOTIFICATIONS_ROLE_UNKNOWN',
              404,
              `The tenant has no role ${roleTarget.role}.`,
              'Check the name of the role and the tenant.',
            );
          }
          users = (await em.find(AuthUserRole, { tenant, roleId: role.id })).map((row) => row.userId);
          if (users.length > MAX_DIRECT) {
            const { to: _to, ...rest } = sent;
            emitEvent(em, { name: EXPAND_EVENT, payload: { roleId: role.id, tenant, notification: rest } });
            recordAudit(em, {
              action: 'notifications.notification.sent',
              entity: Notification.name,
              data: { role: roleTarget.role, queued: true, category: note.category },
            });
            await em.flush();
            return { created: 0, queued: true };
          }
        }
        const created = await deliver(em, mail, users, note);
        recordAudit(em, {
          action: 'notifications.notification.sent',
          entity: Notification.name,
          data: { count: created, category: note.category, channels: note.channels },
        });
        await em.flush();
        return { created, queued: false };
      });
    },
  };
  bound.current = { db, mail, retentionDays: input.retentionDays, notifier };
  return notifier;
}
