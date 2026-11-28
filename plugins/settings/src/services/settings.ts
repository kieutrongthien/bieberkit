/**
 * BieberKit
 *
 * @file        plugins/settings/src/services/settings.ts
 * @description The settings service: typed reads and audited writes of the declared settings, with export and import (SET-01 to SET-08).
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

import { HttpError } from '@bieberkit/http';
import { requestContext } from '@bieberkit/core';
import type { SettingDef } from '@bieberkit/core';
import { decodeCursor, encodeCursor, pageSize, uuid7 } from '@bieberkit/data';
import { recordAudit, runInTransaction, runInUnitOfWork } from '@bieberkit/data/orm';
import type { Database } from '@bieberkit/data/orm';
import type { Cache } from '@bieberkit/cache';
import type { ExportedSetting, ImportReport, SettingsService, Where } from './types.ts';

const ENTITY = 'settings.Setting';

const NIL = '00000000-0000-0000-0000-000000000000';

const TAG = 'settings';

const TTL_MS = 5 * 60_000;

const MASK = '********';

const REQUIRED_FOR_ALL = 'security.mfa.required-for-all';

const REQUIRED_SINCE = 'security.mfa.required-since';

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

/** The scope that a caller may write this setting in, or `undefined` when it is not changed from there (SET-04). */
function writableScope(def: SettingDef, where: Where | undefined): string | undefined {
  const tenant = tenantOf(where);
  if (tenant === undefined) return NIL;
  return def.scope === 'tenant' ? tenant : undefined;
}

function lockout(def: SettingDef): never {
  throw new HttpError(
    'SETTINGS_SELF_LOCKOUT',
    409,
    `This value of ${def.key} would lock you out.`,
    'Change it from an address on the list, or enrol a second factor first.',
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
      try {
        return await service.getStrict(setting, where);
      } catch (error) {
        if (error instanceof HttpError) throw error;
        return setting.default;
      }
    },

    async getStrict<T>(setting: SettingDef<T>, where?: Where): Promise<T> {
      const def = defOf(setting);
      const found = await effective(def, where);
      // The declaration checked the value when it was written; the cast restores the type of the declaration (SET-05).
      // oxlint-disable-next-line typescript/no-unsafe-type-assertion
      return (found === null ? setting.default : found.value) as T;
    },

    async set(setting, value, change) {
      const def = defOf(setting);
      const next = checked(def, value);
      const scope = writeScope(def, change);
      if (change.actor !== undefined && def.guard?.(next, change.actor) === true) lockout(def);
      const text = JSON.stringify(next);
      let previous: unknown;
      await asActor(change.actorId, () =>
        runInTransaction(db, async (em) => {
          const row = await rowOf(em, scope, def.key);
          const old = row === null ? undefined : decode(def, row);
          previous = old;
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
      // The grace period of the second factor counts from the day the rule was turned on (POL-02).
      if (def.key === REQUIRED_FOR_ALL && byKey.has(REQUIRED_SINCE) && (next === true) !== (previous === true))
        await service.set(REQUIRED_SINCE, next === true ? new Date().toISOString() : '', {
          tenantId: change.tenantId,
          actorId: change.actorId,
        });
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

    async exportStored(where) {
      const settings: ExportedSetting[] = [];
      for (const def of declarations) {
        const scope = writableScope(def, where);
        if (scope === undefined) continue;
        const found = await load(def, scope);
        if (found === null) continue;
        settings.push(def.secret ? { key: def.key, secret: true } : { key: def.key, value: found.value });
      }
      return { version: 1, scope: tenantOf(where) === undefined ? 'global' : 'tenant', settings };
    },

    async importStored(entries, change, options = {}) {
      const dryRun = options.dryRun === true;
      const results: ImportReport['results'][number][] = [];
      const todo: { key: string; value: unknown }[] = [];
      for (const entry of entries) {
        const def = byKey.get(entry.key);
        if (def === undefined) {
          results.push({
            key: entry.key,
            result: 'invalid',
            code: 'SETTINGS_UNKNOWN_KEY',
            message: `No setting ${entry.key} is declared.`,
          });
          continue;
        }
        // A secret is never carried in a file, so an export has a hole where it was (OPS-03).
        if (def.secret) {
          results.push({
            key: def.key,
            result: 'skipped',
            code: 'SETTINGS_SECRET_SKIPPED',
            message: 'A secret is not imported.',
          });
          continue;
        }
        const scope = writableScope(def, change);
        if (scope === undefined) {
          results.push({
            key: def.key,
            result: 'invalid',
            code: 'SETTINGS_SCOPE_REFUSED',
            message: `${def.key} is not changed from here.`,
          });
          continue;
        }
        let next: unknown;
        try {
          next = def.check(entry.value);
        } catch (error) {
          results.push({
            key: def.key,
            result: 'invalid',
            code: 'SETTINGS_INVALID_VALUE',
            message: error instanceof Error ? error.message : String(error),
          });
          continue;
        }
        if (change.actor !== undefined && def.guard?.(next, change.actor) === true) {
          results.push({
            key: def.key,
            result: 'invalid',
            code: 'SETTINGS_SELF_LOCKOUT',
            message: `This value of ${def.key} would lock you out.`,
          });
          continue;
        }
        const current = await load(def, scope);
        if (current !== null && JSON.stringify(current.value) === JSON.stringify(next)) {
          results.push({ key: def.key, result: 'unchanged' });
          continue;
        }
        results.push({ key: def.key, result: current === null ? 'created' : 'updated' });
        todo.push({ key: def.key, value: next });
      }
      if (results.some((item) => item.result === 'invalid')) {
        throw new HttpError(
          'SETTINGS_IMPORT_INVALID',
          422,
          'The file has settings that cannot be applied, so none was.',
          'Fix the entries that say invalid, then send it again.',
          undefined,
          undefined,
          { results },
        );
      }
      if (!dryRun) for (const item of todo) await service.set(item.key, item.value, change);
      return { dryRun, results };
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
