/**
 * BieberKit
 *
 * @file        plugins/settings/src/service.ts
 * @description The settings service: declared keys only, typed and cached reads with fallback, validated writes and resets audited in their transaction, secrets that never leave, and tenant values over global ones (SET-01 to SET-07).
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

import { requestContext } from '@bieberkit/core';
import type { SettingDef } from '@bieberkit/core';
import type { Cache } from '@bieberkit/cache';
import { decodeCursor, encodeCursor, pageSize, uuid7 } from '@bieberkit/data';
import { recordAudit, runInTransaction, runInUnitOfWork } from '@bieberkit/data/orm';
import type { Database } from '@bieberkit/data/orm';
import { HttpError } from '@bieberkit/http';

const ENTITY = 'settings.Setting';
const NIL = '00000000-0000-0000-0000-000000000000';
const TAG = 'settings';
const TTL_MS = 5 * 60_000;
const MASK = '********';

/** What a client sees of a setting: its declaration, its value (masked for a secret) and whether a stored value is in use. */
export interface SettingView {
  readonly key: string;
  readonly type: string;
  readonly label: Readonly<Record<string, string>>;
  readonly description?: Readonly<Record<string, string>>;
  readonly group?: string;
  readonly scope: string;
  readonly public: boolean;
  readonly secret: boolean;
  readonly values?: readonly string[];
  readonly default: unknown;
  readonly value: unknown;
  readonly hasValue: boolean;
}

export interface SettingsPage {
  readonly data: readonly SettingView[];
  readonly nextCursor: string | null;
  readonly pageSize: number;
}

export interface Where {
  /** The tenant of the request. None, or the nil tenant, is the global scope. */
  readonly tenantId?: string | undefined;
}

export interface Change extends Where {
  /** Who changes it, for the audit entry; `null` is the system. */
  readonly actorId: string | null;
}

export interface SettingsService {
  /** Every declaration, sorted by key. */
  readonly declarations: readonly SettingDef[];
  /** The value for code: the tenant value, then the global value, then the default (SET-04, SET-05). A secret is given in clear here. */
  get<T>(setting: SettingDef<T>, where?: Where): Promise<T>;
  set(setting: SettingDef | string, value: unknown, change: Change): Promise<void>;
  reset(setting: SettingDef | string, change: Change): Promise<void>;
  view(setting: SettingDef | string, where?: Where): Promise<SettingView>;
  list(where: Where & { readonly pageSize?: unknown; readonly cursor?: string }): Promise<SettingsPage>;
  /** The `public` settings, for the login screen and the site (SET-07). */
  publicValues(where?: Where): Promise<{ readonly key: string; readonly value: unknown }[]>;
}

interface Stored {
  readonly id: string;
  readonly value: unknown;
}

const unknownKey = (key: string): never => {
  throw new HttpError(
    'SETTINGS_UNKNOWN_KEY',
    404,
    `No setting ${key} is declared.`,
    'Declare it with defineSetting in a module, or check the key.',
  );
};

const tenantOf = (where: Where | undefined): string | undefined => {
  const tenant = where?.tenantId?.toLowerCase();
  return tenant === undefined || tenant === NIL ? undefined : tenant;
};

/** The scopes that a read looks at, nearest first. */
const scopesOf = (def: SettingDef, where: Where | undefined): string[] => {
  const tenant = tenantOf(where);
  return def.scope === 'tenant' && tenant !== undefined ? [tenant, NIL] : [NIL];
};

function asActor<T>(actorId: string | null, run: () => Promise<T>): Promise<T> {
  const current = requestContext.get();
  const context = { ...current, requestId: current?.requestId ?? uuid7() };
  if (actorId === null) delete context.userId;
  else context.userId = actorId;
  return requestContext.run(context, run);
}

const field = (row: object, name: string): unknown => Reflect.get(row, name);

/** The unit of work of `runInUnitOfWork`, without importing the ORM into a plugin. */
type EntityManager = Parameters<Parameters<typeof runInUnitOfWork>[1]>[0];

const entityOf = (em: EntityManager) => em.getMetadata().getByClassName(ENTITY).class;
function decode(def: SettingDef, row: object): unknown {
  const text = field(row, def.secret ? 'secretValue' : 'value');
  return typeof text === 'string' ? JSON.parse(text) : undefined;
}
/** The scope that a write goes to. A global setting is not changed from inside a tenant (SET-04). */
function writeScope(def: SettingDef, where: Where): string {
  const tenant = tenantOf(where);
  if (tenant === undefined) return NIL;
  if (def.scope === 'tenant') return tenant;
  throw new HttpError(
    'SETTINGS_SCOPE_REFUSED',
    403,
    `${def.key} is the same for every tenant, so it is not changed from inside one.`,
    'Change it without a tenant, as a system administrator.',
  );
}
function checked(def: SettingDef, value: unknown): unknown {
  try {
    return def.check(value);
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    throw new HttpError('SETTINGS_INVALID_VALUE', 422, reason, 'Send a value of the type that the setting declares.');
  }
}
const auditData = (def: SettingDef, old: unknown, next: unknown): Record<string, unknown> =>
  def.secret ? { key: def.key } : { key: def.key, old: old ?? null, new: next ?? null };

async function rowOf(em: EntityManager, scope: string, key: string): Promise<object | null> {
  const row: unknown = await em.findOne(entityOf(em), { scope, key });
  return typeof row === 'object' && row !== null ? row : null;
}

export function createSettingsService(input: {
  readonly db: Database;
  readonly cache: Cache;
  readonly declarations: readonly SettingDef[];
}): SettingsService {
  const { db, cache } = input;
  const byKey = new Map<string, SettingDef>();
  for (const def of input.declarations) {
    if (byKey.has(def.key)) {
      throw new HttpError(
        'SETTINGS_DUPLICATE_KEY',
        500,
        `The setting ${def.key} is declared twice.`,
        'Declare each setting in one module only.',
      );
    }
    byKey.set(def.key, def);
  }
  // Code point order, the same that the cursor compares with.
  const declarations = [...byKey.values()].toSorted((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));

  const defOf = (setting: SettingDef | string): SettingDef => {
    const key = typeof setting === 'string' ? setting : setting.key;
    return byKey.get(key) ?? unknownKey(key);
  };

  /** The stored value of one scope, from the database. */
  async function load(def: SettingDef, scope: string): Promise<Stored | null> {
    return runInUnitOfWork(db, async (em) => {
      const row = await rowOf(em, scope, def.key);
      if (row === null) return null;
      const value = decode(def, row);
      return value === undefined ? null : { id: String(field(row, 'id')), value };
    });
  }

  /**
   * The stored value of one scope, through the cache when the setting is not secret: a secret is never put in the cache. When the
   * cache fails, the database answers (SET-05).
   */
  async function stored(def: SettingDef, scope: string): Promise<Stored | null> {
    if (def.secret) return load(def, scope);
    let text: string;
    try {
      // The entry is JSON text, the empty text when there is no stored value: the cache keeps JSON values only.
      text = await cache.tags([TAG]).remember(`settings:${scope}:${def.key}`, TTL_MS, async () => {
        const found = await load(def, scope);
        return found === null ? '' : JSON.stringify(found);
      });
    } catch {
      return load(def, scope);
    }
    if (text === '') return null;
    const parsed: unknown = JSON.parse(text);
    return { id: String(field(Object(parsed), 'id')), value: field(Object(parsed), 'value') };
  }

  async function effective(def: SettingDef, where: Where | undefined): Promise<Stored | null> {
    for (const scope of scopesOf(def, where)) {
      const found = await stored(def, scope);
      if (found !== null) return found;
    }
    return null;
  }

  const service: SettingsService = {
    declarations,

    async get<T>(setting: SettingDef<T>, where?: Where): Promise<T> {
      const def = defOf(setting);
      try {
        const found = await effective(def, where);
        // The declaration checked the value when it was written; the cast restores the type of the declaration (SET-05).
        // oxlint-disable-next-line typescript/no-unsafe-type-assertion
        return (found === null ? setting.default : found.value) as T;
      } catch {
        return setting.default;
      }
    },

    async set(setting, value, change) {
      const def = defOf(setting);
      const next = checked(def, value);
      const scope = writeScope(def, change);
      const text = JSON.stringify(next);
      await asActor(change.actorId, () =>
        runInTransaction(db, async (em) => {
          const row = await rowOf(em, scope, def.key);
          const old = row === null ? undefined : decode(def, row);
          const columns = def.secret ? { secretValue: text, value: null } : { value: text, secretValue: null };
          if (row === null) {
            // The class comes from the metadata, so its type is not known here; the columns are those of `Setting`.
            // oxlint-disable-next-line typescript/no-unsafe-type-assertion
            em.create(entityOf(em), { scope, key: def.key, ...columns } as never);
          } else {
            for (const [name, column] of Object.entries(columns)) Reflect.set(row, name, column);
          }
          await em.flush();
          recordAudit(em, {
            action: 'settings.setting.updated',
            entity: ENTITY,
            ...(row === null ? {} : { recordId: String(field(row, 'id')) }),
            data: auditData(def, old, next),
          });
          await em.flush();
          cache.tags([TAG]).flushAfterCommit();
        }),
      );
    },

    async reset(setting, change) {
      const def = defOf(setting);
      const scope = writeScope(def, change);
      await asActor(change.actorId, () =>
        runInTransaction(db, async (em) => {
          const row = await rowOf(em, scope, def.key);
          if (row === null) return;
          const old = decode(def, row);
          em.remove(row);
          recordAudit(em, {
            action: 'settings.setting.reset',
            entity: ENTITY,
            recordId: String(field(row, 'id')),
            data: auditData(def, old, null),
          });
          await em.flush();
          cache.tags([TAG]).flushAfterCommit();
        }),
      );
    },

    async view(setting, where) {
      const def = defOf(setting);
      const found = await effective(def, where);
      const value = found === null ? def.default : found.value;
      return {
        key: def.key,
        type: def.type,
        label: def.label,
        ...(def.description === undefined ? {} : { description: def.description }),
        ...(def.group === undefined ? {} : { group: def.group }),
        scope: def.scope,
        public: def.public,
        secret: def.secret,
        ...(def.values === undefined ? {} : { values: def.values }),
        default: def.secret ? MASK : def.default,
        value: def.secret ? (found === null ? null : MASK) : value,
        hasValue: found !== null,
      };
    },

    async list(where) {
      const size = pageSize(where.pageSize);
      const after =
        where.cursor === undefined || where.cursor === '' ? undefined : String(decodeCursor(where.cursor)[0]);
      const rest = declarations.filter((def) => after === undefined || def.key > after);
      const page = rest.slice(0, size);
      const data = await Promise.all(page.map((def) => service.view(def, where)));
      const last = page.at(-1);
      return {
        data,
        nextCursor: rest.length > size && last !== undefined ? encodeCursor([last.key]) : null,
        pageSize: size,
      };
    },

    async publicValues(where) {
      const shown = declarations.filter((def) => def.public);
      return Promise.all(shown.map(async (def) => ({ key: def.key, value: await service.get(def, where) })));
    },
  };
  return service;
}
