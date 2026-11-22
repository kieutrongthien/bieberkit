/**
 * BieberKit
 *
 * @file        packages/auth/src/testing/matrix.ts
 * @description The permission matrix that is generated from the permissions block of an entity: default deny, masks, tenant isolation, conditions and the fail closed rule (section 21, ADR 0013).
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

import type { EntityDef } from '@bieberkit/data';
import { buildAbility } from '../ability.ts';
import type { ScopedPermission } from '../ability.ts';
import { shapeOf } from '../authorizer.ts';
import { buildPermissionRegistry } from '../registry.ts';

type Row = Record<string, unknown>;

export interface MatrixReply {
  readonly status: number;
  readonly body: Readonly<Record<string, unknown>>;
}

/** A caller with exactly the permissions that were asked for, in one tenant. */
export interface MatrixCaller {
  readonly id: string;
  get(url: string, headers?: Record<string, string>): Promise<MatrixReply>;
  post(url: string, payload?: object, headers?: Record<string, string>): Promise<MatrixReply>;
  patch(url: string, payload: object, version: number, headers?: Record<string, string>): Promise<MatrixReply>;
  delete(url: string, version: number, headers?: Record<string, string>): Promise<MatrixReply>;
  /** The same caller, acting in another tenant. */
  inTenant(tenant: string): MatrixCaller;
}

/** What the generated cases need from the project: a running API for the entity, and a way to make callers and rows. */
export interface MatrixHarness {
  readonly entity: EntityDef<string>;
  /** The path of the entity, such as `/api/v1/crm/deals`. */
  readonly path: string;
  /** Two tenants that are not the same. */
  readonly tenants: readonly [string, string];
  /** A new valid body for a create. Each call gives a body that does not clash with the others. */
  sample(extra?: Row): Row;
  /** A harmless valid change for an update. */
  edit(): Row;
  /** A valid value for a masked field. */
  valueOf(field: string): unknown;
  caller(permissions: readonly string[], options?: { tenant?: string; userId?: string }): Promise<MatrixCaller>;
  /** Makes rows of the entity in a tenant, behind every rule, and returns their ids. */
  seed(tenant: string, rows: readonly Row[]): Promise<string[]>;
  /** The value that the database holds, read behind every rule. */
  stored(id: string, field: string): Promise<unknown>;
}

export interface MatrixCase {
  readonly id: string;
  readonly title: string;
  /** Throws when the authorizer does something that the case does not allow. */
  run(harness: MatrixHarness): Promise<void>;
}

export interface MatrixOptions {
  /** The permissions that carry a condition, as the authorizer gets them. */
  readonly scoped?: Readonly<Record<string, ScopedPermission>>;
  /** Rows that satisfy and rows that break the condition of a scoped permission, for the cases that need rows. */
  readonly conditions?: readonly {
    readonly permission: string;
    inside(userId: string): Row;
    outside(userId: string): Row;
  }[];
}

class MatrixFailure extends Error {}

function check(condition: boolean, message: string): void {
  if (!condition) throw new MatrixFailure(message);
}

function status(label: string, reply: MatrixReply, ...wanted: number[]): void {
  check(
    wanted.includes(reply.status),
    `${label}: expected ${wanted.join(' or ')}, got ${reply.status} ${JSON.stringify(reply.body)}`,
  );
}

const idsOf = (reply: MatrixReply): string[] => {
  const data = reply.body['data'];
  return Array.isArray(data)
    ? data.map((row: unknown) => String(typeof row === 'object' && row !== null && 'id' in row ? row.id : ''))
    : [];
};

const rowsOf = (reply: MatrixReply): Row[] => {
  const data = reply.body['data'];
  return Array.isArray(data)
    ? data.map((row: unknown) =>
        typeof row === 'object' && row !== null ? Object.fromEntries(Object.entries(row)) : {},
      )
    : [];
};

/** Makes one row in a tenant (the first one by default), and returns its id. */
async function one(harness: MatrixHarness, tenant: string = harness.tenants[0]): Promise<string> {
  const [id] = await harness.seed(tenant, [harness.sample()]);
  if (id === undefined) throw new MatrixFailure('The harness made no row.');
  return id;
}

/** A refusal for an unsupported condition: 403 with its own code. */
function refused(label: string, reply: MatrixReply): void {
  status(label, reply, 403);
  check(reply.body['code'] === 'AUTHZ_UNSUPPORTED_CONDITION', `${label}: the code is ${String(reply.body['code'])}`);
}

/** The row of a get. */
const dataRow = (reply: MatrixReply): Row => {
  const data = reply.body['data'];
  return typeof data === 'object' && data !== null && !Array.isArray(data)
    ? Object.fromEntries(Object.entries(data))
    : {};
};

/** Generates the cases of ADR 0013 from the `permissions` block of an entity (section 21). */
export function permissionMatrix(entity: EntityDef<string>, options: MatrixOptions = {}): MatrixCase[] {
  const registry = buildPermissionRegistry([entity]);
  const nameOf = (action: 'read' | 'create' | 'update' | 'delete'): string => {
    const found = registry.entries.find((entry) => entry.action === action && entry.field === undefined);
    if (found === undefined) throw new MatrixFailure(`${entity.name} has no permission for ${action}.`);
    return found.permission;
  };
  const all = [...new Set(registry.entries.map((entry) => entry.permission))];
  const api = entity.api;
  const cases: MatrixCase[] = [];
  const add = (id: string, title: string, run: MatrixCase['run']): void => void cases.push({ id, title, run });

  add('default-deny', 'a caller with no permission is refused on every operation', async (harness) => {
    const id = await one(harness);
    const nobody = await harness.caller([]);
    const url = `${harness.path}/${id}`;
    if (api.list === true) status('list', await nobody.get(harness.path), 403);
    if (api.get === true) status('get', await nobody.get(url), 403);
    if (api.create === true) status('create', await nobody.post(harness.path, harness.sample()), 403);
    if (api.update === true) status('update', await nobody.patch(url, harness.edit(), 1), 403);
    if (api.delete === true) status('delete', await nobody.delete(url, 1), 403);
  });

  add('read-allowed', 'the read permission allows a list and a get', async (harness) => {
    const id = await one(harness);
    const reader = await harness.caller([nameOf('read')]);
    if (api.list === true) {
      const reply = await reader.get(harness.path);
      status('list', reply, 200);
      check(idsOf(reply).includes(id), 'the list does not have the row of the tenant');
    }
    if (api.get === true) status('get', await reader.get(`${harness.path}/${id}`), 200);
  });

  add(
    'read-does-not-grant-write',
    'the read permission does not allow a create, an update or a delete',
    async (harness) => {
      const id = await one(harness);
      const reader = await harness.caller([nameOf('read')]);
      const url = `${harness.path}/${id}`;
      if (api.create === true) status('create', await reader.post(harness.path, harness.sample()), 403);
      if (api.update === true) status('update', await reader.patch(url, harness.edit(), 1), 403);
      if (api.delete === true) {
        status('delete', await reader.delete(url, 1), 403);
        status('the row is still there', await (await harness.caller([nameOf('read')])).get(url), 200);
      }
    },
  );

  add(
    'other-permissions-do-not-grant-read',
    'every permission but the read one does not allow a read',
    async (harness) => {
      await one(harness);
      const caller = await harness.caller(all.filter((permission) => permission !== nameOf('read')));
      if (api.list === true) status('list', await caller.get(harness.path), 403);
    },
  );

  for (const [field, permission] of Object.entries(entity.permissions.fields ?? {})) {
    if (permission.read !== undefined) {
      const lift = permission.read;
      add(`mask-hidden:${field}`, `${field} is left out of a read without ${lift}`, async (harness) => {
        const [id] = await harness.seed(harness.tenants[0], [harness.sample({ [field]: harness.valueOf(field) })]);
        const reader = await harness.caller([nameOf('read')]);
        if (api.list === true) {
          const rows = rowsOf(await reader.get(harness.path));
          check(rows.length > 0 && rows.every((row) => !(field in row)), `a list shows ${field}`);
          status('asking for the field', await reader.get(`${harness.path}?fields=${field}`), 403);
        }
        if (api.get === true) {
          const reply = await reader.get(`${harness.path}/${id}`);
          check(!(field in dataRow(reply)), `a get shows ${field}`);
        }
      });
      add(`mask-shown:${field}`, `${field} is in a read with ${lift}`, async (harness) => {
        const value = harness.valueOf(field);
        const [id] = await harness.seed(harness.tenants[0], [harness.sample({ [field]: value })]);
        const reader = await harness.caller([nameOf('read'), lift]);
        if (api.get === true) {
          const reply = await reader.get(`${harness.path}/${id}`);
          status('get', reply, 200);
          check(dataRow(reply)[field] === value, `a get does not show ${field}`);
        }
      });
    }
    if (permission.update !== undefined) {
      const lift = permission.update;
      add(`mask-write-rejected:${field}`, `a write of ${field} is refused without ${lift}`, async (harness) => {
        const id = await one(harness);
        const before = await harness.stored(id, field);
        const writer = await harness.caller([nameOf('read'), nameOf('create'), nameOf('update')]);
        const value = harness.valueOf(field);
        if (api.update === true) {
          status('update', await writer.patch(`${harness.path}/${id}`, { [field]: value }, 1), 403);
          check((await harness.stored(id, field)) === before, `${field} changed`);
        }
        if (api.create === true)
          status('create', await writer.post(harness.path, harness.sample({ [field]: value })), 403);
      });
      add(`mask-write-accepted:${field}`, `a write of ${field} works with ${lift}`, async (harness) => {
        const id = await one(harness);
        const value = harness.valueOf(field);
        const writer = await harness.caller([nameOf('read'), nameOf('update'), lift]);
        if (api.update === true) {
          status('update', await writer.patch(`${harness.path}/${id}`, { [field]: value }, 1), 200);
          check((await harness.stored(id, field)) === value, `${field} was not written`);
        }
      });
    }
  }

  add('tenant-isolation-list', 'a list shows the rows of the tenant of the caller and no other', async (harness) => {
    const [a, b] = harness.tenants;
    const mine = await one(harness, a);
    const theirs = await one(harness, b);
    const caller = await harness.caller(all);
    if (api.list === true) {
      const ids = idsOf(await caller.get(harness.path));
      check(ids.includes(mine), 'the list does not have the row of the tenant');
      check(!ids.includes(theirs), 'the list has the row of another tenant');
    }
    if (api.get === true) status('get of another tenant', await caller.get(`${harness.path}/${theirs}`), 404);
  });

  add('tenant-isolation-roles', 'the roles of one tenant grant nothing in another', async (harness) => {
    const [a, b] = harness.tenants;
    await one(harness, a);
    const caller = await harness.caller(all, { tenant: a });
    if (api.list === true) status('list in the other tenant', await caller.inTenant(b).get(harness.path), 403);
  });

  add('tenant-isolation-update', 'an update or a delete does not reach a row of another tenant', async (harness) => {
    const [a, b] = harness.tenants;
    const theirs = await one(harness, b);
    const before = JSON.stringify(await harness.stored(theirs, 'version'));
    const caller = await harness.caller(all, { tenant: a });
    const url = `${harness.path}/${theirs}`;
    if (api.update === true) status('update', await caller.patch(url, harness.edit(), 1), 404);
    if (api.delete === true) status('delete', await caller.delete(url, 1), 404);
    check(JSON.stringify(await harness.stored(theirs, 'version')) === before, 'the row of the other tenant changed');
  });

  add(
    'update-empty-payload',
    'an update that names no masked field is refused without the update permission',
    async (harness) => {
      const id = await one(harness);
      const reader = await harness.caller([nameOf('read')]);
      if (api.update === true) status('update', await reader.patch(`${harness.path}/${id}`, harness.edit(), 1), 403);
    },
  );

  for (const condition of options.conditions ?? []) {
    const scoped = options.scoped?.[condition.permission];
    if (scoped === undefined) continue;
    add(
      `conditions:${condition.permission}`,
      `${condition.permission} reaches the rows that its condition names, and no others`,
      async (harness) => {
        const caller = await harness.caller([condition.permission]);
        const [inside, outside] = await harness.seed(harness.tenants[0], [
          harness.sample(condition.inside(caller.id)),
          harness.sample(condition.outside(caller.id)),
        ]);
        if (inside === undefined || outside === undefined) throw new MatrixFailure('The harness made too few rows.');
        if (scoped.action === 'read') {
          const ids = idsOf(await caller.get(harness.path));
          check(ids.includes(inside), 'the list does not have the row that the condition names');
          check(!ids.includes(outside), 'the list has a row that the condition does not name');
          status('get outside', await caller.get(`${harness.path}/${outside}`), 404);
        } else if (scoped.action === 'update') {
          status('update inside', await caller.patch(`${harness.path}/${inside}`, harness.edit(), 1), 200);
          status('update outside', await caller.patch(`${harness.path}/${outside}`, harness.edit(), 1), 404);
        } else if (scoped.action === 'delete') {
          status('delete inside', await caller.delete(`${harness.path}/${inside}`, 1), 204);
          status('delete outside', await caller.delete(`${harness.path}/${outside}`, 1), 404);
        } else if (scoped.action === 'create') {
          status('create inside', await caller.post(harness.path, harness.sample(condition.inside(caller.id))), 201);
          status('create outside', await caller.post(harness.path, harness.sample(condition.outside(caller.id))), 403);
        }
      },
    );
  }

  const shape = shapeOf(entity);
  for (const [permission, scoped] of Object.entries(options.scoped ?? {})) {
    if (scoped.subject !== entity.name) continue;
    const probe = buildAbility({
      registry,
      granted: new Set([permission]),
      scoped: options.scoped ?? {},
      user: { id: 'probe' },
    });
    if (probe.access(shape, scoped.action).reason !== 'unsupported-condition') continue;
    add(
      `unsupported-denies:${permission}`,
      `${permission} has a condition that the language does not have, and denies`,
      async (harness) => {
        const id = await one(harness);
        const caller = await harness.caller([permission]);
        const url = `${harness.path}/${id}`;
        if (scoped.action === 'read') refused('list', await caller.get(harness.path));
        else if (scoped.action === 'update') refused('update', await caller.patch(url, harness.edit(), 1));
        else if (scoped.action === 'delete') refused('delete', await caller.delete(url, 1));
        else if (scoped.action === 'create') refused('create', await caller.post(harness.path, harness.sample()));
      },
    );
  }

  return cases;
}
