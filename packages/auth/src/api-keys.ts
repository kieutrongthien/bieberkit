/**
 * BieberKit
 *
 * @file        packages/auth/src/api-keys.ts
 * @description API keys for machine clients: made by code, shown once, stored hashed, scoped to permission strings and one tenant, expiring and revocable (AUTH-07, DATA-19).
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

import { isUuid } from '@bieberkit/data';
import { emitEvent, recordAudit, runInTransaction } from '@bieberkit/data/orm';
import type { Database } from '@bieberkit/data/orm';
import type { Principal } from '@bieberkit/http';
import { HttpError } from '@bieberkit/http';
import type { AuthInstance } from './better-auth.ts';
import { authError } from './errors.ts';
import { AuthApiKey, AuthUser } from './tables.ts';
import { requireEnabledUser } from './user-status.ts';

export const API_KEY_PREFIX = 'bk_';
const DAY = 86_400;
const MAX_PERMISSIONS = 500;

export interface ApiKeyInput {
  /** The user who owns the key. The key is deleted with him. */
  readonly userId: string;
  /** The tenant that the key works in. A project with no tenants leaves it out. */
  readonly tenantId?: string;
  readonly name: string;
  /** The permission strings of the key. They are all it has: the roles of its owner give it nothing. */
  readonly permissions: readonly string[];
  /** 1 to 365 whole days. Defaults to 90. */
  readonly expiresInDays?: number;
}

export interface CreatedApiKey {
  readonly id: string;
  /** The key. It is shown here and nowhere else, because only its hash is stored. */
  readonly key: string;
  /** When the key stops working, as an ISO instant. */
  readonly expiresAt: string;
}

const invalid = (message: string, fix: string): never => {
  throw authError('AUTH_APIKEY_INVALID', 400, message, fix);
};

function permissionsOf(list: readonly string[]): string[] {
  const out = [...new Set(list.map((permission) => permission.trim()))];
  if (out.length === 0)
    invalid('A key needs at least one permission.', 'Name the permissions that the machine client needs.');
  if (out.length > MAX_PERMISSIONS)
    invalid(`A key has at most ${MAX_PERMISSIONS} permissions.`, 'Make more than one key.');
  if (out.some((permission) => permission === '' || permission.length > 200))
    invalid('A permission has 1 to 200 characters.', 'Name the permission like crm.deal.read.');
  return out.toSorted((a, b) => a.localeCompare(b));
}

const endpoint = (auth: AuthInstance, name: string): ((input: unknown) => Promise<unknown>) => {
  const found: unknown = Reflect.get(auth.api, name);
  if (typeof found !== 'function') {
    throw authError('AUTH_CONFIG_INVALID', 500, 'API keys are not turned on.', 'Give createAuth the option apiKeys.');
  }
  return async (input) => found.call(auth.api, input);
};

const recordOf = (value: unknown): Record<string, unknown> =>
  typeof value === 'object' && value !== null ? Object.fromEntries(Object.entries(value)) : {};

/**
 * Makes a key for a user (AUTH-07). It checks what it is given, and writes the key, its audit entry and its outbox event in one
 * transaction. The permissions and the tenant go into the metadata of the key, so they are what code decided and not what a
 * client sent: the routes of Better Auth for keys are not served (`registerAuthRoutes`).
 */
export async function createApiKey(auth: AuthInstance, db: Database, input: ApiKeyInput): Promise<CreatedApiKey> {
  const name = input.name.trim();
  if (name === '' || name.length > 255)
    invalid('The name of a key has 1 to 255 characters.', 'Say what the key is for.');
  const permissions = permissionsOf(input.permissions);
  const tenantId = input.tenantId?.toLowerCase();
  if (tenantId !== undefined && !isUuid(tenantId)) invalid('The tenant is not a UUID.', 'Use the UUID of the tenant.');
  if (!isUuid(input.userId)) invalid('The user is not a UUID.', 'Use the id of the user who owns the key.');
  const days = input.expiresInDays ?? 90;
  if (!Number.isInteger(days) || days < 1 || days > 365)
    invalid('A key lasts 1 to 365 whole days.', 'Use a number of days from 1 to 365.');
  const create = endpoint(auth, 'createApiKey');
  return runInTransaction(db, async (em) => {
    if ((await em.count(AuthUser, { id: input.userId.toLowerCase() })) === 0)
      invalid('The user does not exist.', 'Use the id of a user.');
    const made = recordOf(
      await create({
        body: {
          name,
          userId: input.userId.toLowerCase(),
          prefix: API_KEY_PREFIX,
          expiresIn: days * DAY,
          metadata: { permissions, ...(tenantId === undefined ? {} : { tenantId }) },
        },
      }),
    );
    const id = String(made['id']);
    const expiresAt = new Date(String(made['expiresAt'])).toISOString();
    const data = {
      name,
      permissions,
      expiresAt,
      userId: input.userId.toLowerCase(),
      ...(tenantId === undefined ? {} : { tenantId }),
    };
    recordAudit(em, {
      action: 'auth.apikey.created',
      entity: 'authApiKey',
      recordId: id,
      ...(tenantId === undefined ? {} : { tenantId }),
      data,
    });
    emitEvent(em, { name: 'auth.apikey.created', payload: { id, ...data }, record: { entity: 'authApiKey', id } });
    await em.flush();
    return { id, key: String(made['key']), expiresAt };
  });
}

/** Revokes a key at once. */
export async function revokeApiKey(db: Database, input: { readonly id: string }): Promise<void> {
  await runInTransaction(db, async (em) => {
    const found = isUuid(input.id) ? await em.findOne(AuthApiKey, { id: input.id }) : null;
    if (found === null) {
      throw authError('AUTH_APIKEY_NOT_FOUND', 404, 'The key does not exist.', 'Check the id of the key.');
    }
    const data = { name: found.name ?? null, userId: found.referenceId };
    recordAudit(em, { action: 'auth.apikey.revoked', entity: 'authApiKey', recordId: input.id, data });
    emitEvent(em, {
      name: 'auth.apikey.revoked',
      payload: { id: input.id, ...data },
      record: { entity: 'authApiKey', id: input.id },
    });
    await em.nativeDelete(AuthApiKey, { id: input.id });
    await em.flush();
  });
}

/** The key that a request carries: `X-API-Key`, or a bearer token that has the prefix of our keys. */
export function keyOf(headers: Readonly<Record<string, string | string[] | undefined>>): string | undefined {
  const direct = headers['x-api-key'];
  const given = Array.isArray(direct) ? direct[0] : direct;
  if (given !== undefined && given !== '') return given;
  const header = headers['authorization'];
  const bearer = (Array.isArray(header) ? header[0] : header)?.match(/^Bearer\s+(\S+)$/i)?.[1];
  return bearer?.startsWith(API_KEY_PREFIX) === true ? bearer : undefined;
}

/** The principal of a key, or `undefined` for a key that is wrong, expired, revoked or switched off. A key over its limit is 429. */
export async function principalOfKey(auth: AuthInstance, key: string): Promise<Principal | undefined> {
  const verified = recordOf(await endpoint(auth, 'verifyApiKey')({ body: { key } }));
  const error = recordOf(verified['error']);
  if (error['code'] === 'RATE_LIMITED') {
    const details = recordOf(error['details']);
    const wait = Math.max(1, Math.ceil(Number(details['tryAgainIn'] ?? 1000) / 1000));
    throw new HttpError('HTTP_TOO_MANY_REQUESTS', 429, 'This key is over its limit.', 'Wait, then call again.', {
      'retry-after': String(wait),
    });
  }
  if (verified['valid'] !== true) return undefined;
  const found = recordOf(verified['key']);
  if (typeof found['referenceId'] !== 'string' || !(await requireEnabledUser(auth, found['referenceId'])))
    return undefined;
  const metadata = recordOf(typeof found['metadata'] === 'string' ? safeParse(found['metadata']) : found['metadata']);
  const grants = Array.isArray(metadata['permissions'])
    ? metadata['permissions'].filter((item) => typeof item === 'string')
    : [];
  const tenantId = typeof metadata['tenantId'] === 'string' ? metadata['tenantId'] : undefined;
  return {
    id: String(found['id']),
    kind: 'apiKey',
    via: 'token',
    grants,
    ...(tenantId === undefined ? {} : { tenantId }),
  };
}

function safeParse(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}
