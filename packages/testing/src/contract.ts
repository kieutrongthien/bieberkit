/**
 * BieberKit
 *
 * @file        packages/testing/src/contract.ts
 * @description Generates the validation and pagination tests of every entity of a module from its definition, so that a project gets them without writing one (TST-02, section 21).
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

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { ModuleDef } from '@bieberkit/core';
import { uuid7 } from '@bieberkit/data';
import type { EntityDef } from '@bieberkit/data';
import { apiFields } from '@bieberkit/data/schema';
import { entityPath } from '@bieberkit/http';
import { createTestApp } from './app.ts';
import type { TestApp } from './app.ts';
import { invalidCasesOf, REFUSED_PAGES } from './cases.ts';
import type { Client, Reply } from './client.ts';
import type { OpenDatabase } from './database.ts';

export interface EntityContractOptions {
  readonly modules: readonly ModuleDef[];
  /** Makes the database. Defaults to SQLite in memory. */
  readonly open?: OpenDatabase;
  /** Values for the fields that no sample can fill (`f.custom`), by entity name and then by field name. */
  readonly values?: Readonly<Record<string, Readonly<Record<string, unknown>>>>;
  /** Only these entities. Defaults to every entity of the modules that has an API. */
  readonly only?: readonly string[];
}

const codeOf = (reply: Reply): unknown => reply.body['code'];

/** A body that is valid for the entity, with an id that looks right for each relation (validation comes before any lookup). */
function validBody(
  app: TestApp,
  entity: EntityDef<string>,
  extra: Readonly<Record<string, unknown>>,
): Record<string, unknown> {
  const body = app.factory(entity).build(extra);
  for (const field of apiFields(entity)) {
    if (field.def.kind === 'belongsTo' && field.def.optional !== true && body[field.key] === undefined)
      body[field.key] = uuid7();
  }
  return body;
}

const need = <T>(value: T | undefined): T => {
  if (value === undefined) throw new Error('The app of the contract tests is not ready.');
  return value;
};

/** An app for a group of tests: made before them, closed after, with a caller that may do everything. */
function useApp(options: EntityContractOptions): { app: () => TestApp; admin: () => Client } {
  let app: TestApp | undefined;
  let admin: Client | undefined;
  beforeAll(async () => {
    app = await createTestApp({
      modules: options.modules,
      ...(options.open === undefined ? {} : { open: options.open }),
    });
    admin = await app.actingAs(app.newUser(), ['admin']);
  });
  afterAll(async () => {
    await app?.close();
  });
  return { app: () => need(app), admin: () => need(admin) };
}

/** The relation keys of a row, to give them to the rows that follow so that they share its parents. */
function parentsOf(entity: EntityDef<string>, row: Readonly<Record<string, unknown>>): Record<string, unknown> {
  const parents: Record<string, unknown> = {};
  for (const field of apiFields(entity)) {
    if (field.def.kind === 'belongsTo' && row[field.key] !== undefined) parents[field.key] = row[field.key];
  }
  return parents;
}

const entitiesOf = (options: EntityContractOptions): EntityDef<string>[] =>
  options.modules
    .flatMap((module) => {
      const found: unknown = module.contributions['entities'];
      // The package of the key declared its type, `readonly EntityDef[]`.
      // oxlint-disable-next-line typescript/no-unsafe-type-assertion
      return Array.isArray(found) ? (found as EntityDef<string>[]) : [];
    })
    .filter((entity) => options.only === undefined || options.only.includes(entity.name));

/**
 * Registers the tests that every entity with an API must pass: the validation of what a client sends (each field refuses what its
 * definition forbids, a body with an unknown field or without a required one is refused, and what the server fills cannot be set) and
 * the limits of a list (the page size, the cursor, the depth of a page). The permission tests are `permissionMatrix` of
 * `@bieberkit/auth/testing`.
 */
export function describeEntityContracts(options: EntityContractOptions): void {
  const entities = entitiesOf(options);

  for (const entity of entities.filter((candidate) => candidate.api.create === true)) {
    describe(`${entity.name} validation of a create`, () => {
      const { app, admin } = useApp(options);
      const given = options.values?.[entity.name] ?? {};
      const base = entityPath(entity);
      it('VAL-01 takes a body that is valid for the entity, so that each refusal below is the fault of its change', async () => {
        const first = await app().factory(entity).create(given);
        const reply = await admin().post(
          base,
          app()
            .factory(entity)
            .build({ ...given, ...parentsOf(entity, first) }),
        );
        expect(reply.status).toBe(201);
      });
      it('VAL-02 refuses a field that the entity does not have', async () => {
        const reply = await admin().post(base, { ...validBody(app(), entity, given), notAField: 1 });
        expect([reply.status, codeOf(reply)]).toEqual([400, 'HTTP_VALIDATION_FAILED']);
      });
      for (const field of apiFields(entity)) {
        for (const invalid of invalidCasesOf(field)) {
          it(`VAL-03 ${entity.name}.${invalid.name}`, async () => {
            const body = validBody(app(), entity, given);
            if ('omit' in invalid.change) delete body[invalid.key];
            else body[invalid.key] = invalid.change.value;
            const reply = await admin().post(base, body);
            expect([reply.status, codeOf(reply)]).toEqual([400, 'HTTP_VALIDATION_FAILED']);
          });
        }
      }
    });
  }

  for (const entity of entities.filter((candidate) => candidate.api.update === true)) {
    describe(`${entity.name} validation of an update`, () => {
      const { app, admin } = useApp(options);
      const given = options.values?.[entity.name] ?? {};
      const base = entityPath(entity);
      it('VAL-04 refuses an update with nothing in it, and a field that the entity does not have', async () => {
        const row = await app().factory(entity).create(given);
        const url = `${base}/${String(row['id'])}`;
        const empty = await admin().patch(url, {}, Number(row['version']));
        const unknown = await admin().patch(url, { notAField: 1 }, Number(row['version']));
        expect([empty.status, codeOf(empty)]).toEqual([400, 'HTTP_VALIDATION_FAILED']);
        expect([unknown.status, codeOf(unknown)]).toEqual([400, 'HTTP_VALIDATION_FAILED']);
      });
      for (const field of apiFields(entity)) {
        // A change that is a value: leaving a field out is a valid update, so only the values are refused.
        for (const invalid of invalidCasesOf(field).filter((one) => 'value' in one.change)) {
          it(`VAL-05 ${entity.name}.${invalid.name}`, async () => {
            const row = await app().factory(entity).create(given);
            const value = 'value' in invalid.change ? invalid.change.value : undefined;
            const reply = await admin().patch(
              `${base}/${String(row['id'])}`,
              { [invalid.key]: value },
              Number(row['version']),
            );
            expect([reply.status, codeOf(reply)]).toEqual([400, 'HTTP_VALIDATION_FAILED']);
          });
        }
      }
    });
  }

  for (const entity of entities.filter((candidate) => candidate.api.list === true)) {
    describe(`${entity.name} limits of a list`, () => {
      const { app, admin } = useApp(options);
      const given = options.values?.[entity.name] ?? {};
      const base = entityPath(entity);
      const rows = 28;
      beforeAll(async () => {
        const factory = app().factory(entity);
        const first = await factory.create(given);
        // The other rows share the parents of the first, so that 28 rows do not make 28 parents.
        await factory.createMany(rows - 1, { ...given, ...parentsOf(entity, first) });
      });
      it('PAGE-01 gives at most the default page size, and a cursor when there is more', async () => {
        const reply = await admin().get(base);
        const meta = Object(reply.body['meta']);
        expect(Array.isArray(reply.body['data']) ? reply.body['data'].length : -1).toBe(25);
        expect(meta.pageSize).toBe(25);
        expect(typeof meta.nextCursor).toBe('string');
      });
      it('PAGE-02 follows the cursor to the last row without a gap or a repeat', async () => {
        const counted = await admin().get(`${base}?pageSize=1&withTotal=true`);
        const total = Number(Object(counted.body['meta']).total);
        expect(total).toBeGreaterThanOrEqual(rows);
        const seen: string[] = [];
        let cursor: string | undefined;
        for (let guard = 0; guard < 30; guard += 1) {
          const reply = await admin().get(
            `${base}?pageSize=10${cursor === undefined ? '' : `&cursor=${encodeURIComponent(cursor)}`}`,
          );
          const data = Array.isArray(reply.body['data']) ? reply.body['data'] : [];
          for (const row of data) seen.push(String(Object(row).id));
          const next: unknown = Object(reply.body['meta']).nextCursor;
          if (typeof next !== 'string') break;
          cursor = next;
        }
        expect(seen).toHaveLength(total);
        expect(new Set(seen).size).toBe(total);
      });
      it('PAGE-03 cuts a page size above the maximum to the maximum', async () => {
        const reply = await admin().get(`${base}?pageSize=100000`);
        expect([reply.status, Object(reply.body['meta']).pageSize]).toEqual([200, 100]);
      });
      for (const refused of REFUSED_PAGES) {
        it(`PAGE-04 refuses ${refused.name}`, async () => {
          const reply = await admin().get(`${base}?${refused.query}`);
          expect([reply.status, codeOf(reply)]).toEqual([400, refused.code]);
        });
      }
    });
  }
}
