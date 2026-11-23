/**
 * BieberKit
 *
 * @file        packages/http/src/meta.test.ts
 * @description Tests of /api/v1/_meta, the contract between the server and the admin: what the caller may see, and its published schema (META-01 to META-05, UI-02).
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

import { createAjv } from '@bieberkit/data/build';
import { describe, expect, it } from 'vitest';
import { Account, entityApp, Hidden, Note, Person } from './entity-app.ts';
import type { HttpServerOptions } from './server.ts';
import { META_SCHEMA, registerMeta } from './meta.ts';

interface Field {
  key: string;
  kind: string;
  widget: string;
  required: boolean;
  readOnly: boolean;
  default?: unknown;
  values?: string[];
  currency?: string;
  filterable: boolean;
  sortable: boolean;
  validation?: Record<string, unknown>;
  target?: { entity: string; path: string };
}
interface Entity {
  name: string;
  path: string;
  label: Record<string, string>;
  operations: Record<string, boolean>;
  can: Record<string, boolean>;
  features: string[];
  fields: Field[];
  form: string[];
  list: string[];
  title?: string;
  transitions: { name: string; from: string[]; to: string; permission: string; allowed: boolean; path: string }[];
}
interface Meta {
  schemaVersion: number;
  entities: Entity[];
  menu: unknown[];
  dashboards: unknown[];
  permissions: string[];
}

const DEFS = [Person, Account, Note, Hidden];

async function metaApp(options: HttpServerOptions = {}) {
  const app = await entityApp(options);
  registerMeta(app.server, DEFS);
  return app;
}

async function fetchMeta(options: HttpServerOptions = {}): Promise<Meta> {
  const app = await metaApp(options);
  const response = await app.server.inject({ method: 'GET', url: '/api/v1/_meta' });
  expect(response.statusCode).toBe(200);
  return JSON.parse(response.body);
}

const entity = (meta: Meta, name: string): Entity => {
  const found = meta.entities.find((item) => item.name === name);
  if (found === undefined) throw new Error(`No entity ${name}`);
  return found;
};
const field = (item: Entity, key: string): Field => {
  const found = item.fields.find((candidate) => candidate.key === key);
  if (found === undefined) throw new Error(`No field ${key}`);
  return found;
};

describe('META-01 the shape', () => {
  it('UI-02 is 401 for a caller who is not signed in', async () => {
    const app = await metaApp({ authenticator: { authenticate: async () => undefined } });
    expect((await app.server.inject({ method: 'GET', url: '/api/v1/_meta' })).statusCode).toBe(401);
  });

  it('META-01 carries a schemaVersion, and empty menus and dashboards until plugins fill them', async () => {
    const meta = await fetchMeta();
    expect(meta.schemaVersion).toBe(1);
    expect(meta.menu).toEqual([]);
    expect(meta.dashboards).toEqual([]);
  });

  it('META-05 the answer is valid against the published JSON Schema', async () => {
    const meta = await fetchMeta();
    const validate = createAjv().compile(META_SCHEMA);
    expect([validate(meta), validate.errors]).toEqual([true, null]);
  });

  it('META-05 the published schema refuses a different version', () => {
    const validate = createAjv().compile(META_SCHEMA);
    expect(validate({ schemaVersion: 2, entities: [], menu: [], dashboards: [], permissions: [] })).toBe(false);
  });
});

describe('META-02 what it describes', () => {
  it('META-02 lists the entities that have an API, with their path, label and operations, and not the others', async () => {
    const meta = await fetchMeta();
    expect(meta.entities.map((item) => item.name).toSorted((a, b) => a.localeCompare(b))).toEqual([
      'crm.Account',
      'crm.Note',
      'crm.Person',
    ]);
    const account = entity(meta, 'crm.Account');
    expect(account).toMatchObject({
      path: '/api/v1/crm/accounts',
      operations: { list: true, get: true, create: true, update: true, delete: true },
      softDelete: true,
    });
    expect(entity(meta, 'crm.Person').operations).toMatchObject({ create: true, update: false, delete: false });
  });

  it('META-02 describes a field with its kind, widget, default and values', async () => {
    const account = entity(await fetchMeta(), 'crm.Account');
    expect(field(account, 'tier')).toMatchObject({
      kind: 'oneOf',
      widget: 'select',
      required: false,
      readOnly: false,
      default: 'basic',
      values: ['basic', 'gold', 'vip'],
    });
    expect(field(account, 'email')).toMatchObject({ kind: 'email', widget: 'email', required: false });
    expect(field(account, 'code')).toMatchObject({ kind: 'string', widget: 'text', required: true });
    expect(field(account, 'balance')).toMatchObject({ kind: 'money', widget: 'money', currency: 'VND' });
    expect(field(account, 'ownerId')).toMatchObject({
      kind: 'belongsTo',
      widget: 'relation',
      target: { entity: 'crm.Person', path: '/api/v1/crm/people' },
    });
  });

  it('META-02 a field that the server fills is read only, and is not in the form', async () => {
    const account = entity(await fetchMeta(), 'crm.Account');
    for (const key of ['number', 'status'])
      expect(field(account, key)).toMatchObject({ readOnly: true, widget: 'readonly' });
    expect(account.form).toEqual(expect.arrayContaining(['code', 'name', 'tier']));
    expect(account.form).not.toContain('number');
    expect(account.form).not.toContain('status');
  });

  it('DATA-07 says which fields can be filtered and sorted by: the indexed ones', async () => {
    const account = entity(await fetchMeta(), 'crm.Account');
    expect(field(account, 'visits')).toMatchObject({ filterable: true, sortable: true });
    expect(field(account, 'tier')).toMatchObject({ filterable: true });
    expect(field(account, 'note')).toMatchObject({ filterable: false });
  });

  it('META-02 gives the validation of a field as JSON Schema', async () => {
    const account = entity(await fetchMeta(), 'crm.Account');
    expect(field(account, 'code').validation).toMatchObject({ type: 'string', maxLength: 20 });
    expect(field(account, 'visits').validation).toMatchObject({ type: 'integer', minimum: 0 });
  });

  it('META-02 lists the transitions with their permission and their path', async () => {
    const account = entity(await fetchMeta(), 'crm.Account');
    expect(account.transitions).toEqual([
      {
        name: 'open',
        from: ['new'],
        to: 'open',
        permission: 'crm.account.update',
        allowed: true,
        path: '/api/v1/crm/accounts/{id}/actions/open',
      },
      {
        name: 'close',
        from: ['open'],
        to: 'closed',
        permission: 'crm.account.close',
        allowed: true,
        path: '/api/v1/crm/accounts/{id}/actions/close',
      },
    ]);
    expect(entity(await fetchMeta(), 'crm.Note').transitions).toEqual([]);
  });

  it('META-02 takes the list and the title of the admin, and a default list otherwise', async () => {
    const meta = await fetchMeta();
    expect(entity(meta, 'crm.Note').list.length).toBeGreaterThan(0);
    expect(entity(meta, 'crm.Account').features).toEqual([]);
  });
});

describe('META-04 only what the caller may see', () => {
  it('META-04 leaves out an entity that the caller may not read', async () => {
    const meta = await fetchMeta({ authorizer: { can: async (_p, permission) => permission !== 'crm.note.read' } });
    expect(meta.entities.map((item) => item.name)).not.toContain('crm.Note');
    expect(meta.entities.map((item) => item.name)).toContain('crm.Account');
  });

  it('META-04 leaves out a field that the caller may not read, and marks one that may not be changed as read only', async () => {
    const hidden = await fetchMeta({
      authorizer: { can: async (_p, permission) => permission !== 'crm.account.read-note' },
    });
    expect(entity(hidden, 'crm.Account').fields.map((item) => item.key)).not.toContain('note');
    expect(entity(hidden, 'crm.Account').form).not.toContain('note');
    const fixed = await fetchMeta({
      authorizer: { can: async (_p, permission) => permission !== 'crm.account.edit-note' },
    });
    expect(field(entity(fixed, 'crm.Account'), 'note')).toMatchObject({ readOnly: true });
    expect(entity(fixed, 'crm.Account').form).not.toContain('note');
  });

  it('META-02 tells what the caller can do with each entity, and with each transition', async () => {
    const meta = await fetchMeta({
      authorizer: { can: async (_p, permission) => !['crm.account.delete', 'crm.account.close'].includes(permission) },
    });
    const account = entity(meta, 'crm.Account');
    expect(account.can).toEqual({ read: true, create: true, update: true, delete: false });
    expect(account.transitions.map((item) => [item.name, item.allowed])).toEqual([
      ['open', true],
      ['close', false],
    ]);
  });

  it('META-02 lists the permissions that the caller has, and none that it lacks', async () => {
    const meta = await fetchMeta({
      authorizer: {
        can: async (_p, permission) => permission.startsWith('crm.account.') && permission !== 'crm.account.close',
      },
    });
    expect(meta.permissions).toContain('crm.account.read');
    expect(meta.permissions).not.toContain('crm.account.close');
    expect(meta.permissions).not.toContain('crm.note.read');
  });

  it('META-04 has no row, no secret and no tenant in it', async () => {
    const app = await metaApp();
    await app.server.inject({
      method: 'POST',
      url: '/api/v1/crm/accounts',
      payload: { code: 'SECRETCODE', name: 'Private Name' },
    });
    const body = (await app.server.inject({ method: 'GET', url: '/api/v1/_meta' })).body;
    expect(body).not.toContain('SECRETCODE');
    expect(body).not.toContain('Private Name');
    expect(body).not.toMatch(/0190f6b2-7c4e-7000-8000-0000000000a1/);
  });

  it('META-04 a caller who may read nothing gets no entities', async () => {
    const meta = await fetchMeta({ authorizer: { can: async () => false } });
    expect(meta.entities).toEqual([]);
    expect(meta.permissions).toEqual([]);
  });
});

describe('META-03 caching', () => {
  it('META-03 has an ETag, and answers 304 for the same caller and permissions', async () => {
    const app = await metaApp();
    const first = await app.server.inject({ method: 'GET', url: '/api/v1/_meta' });
    const etag = String(first.headers['etag']);
    expect(
      (await app.server.inject({ method: 'GET', url: '/api/v1/_meta', headers: { 'if-none-match': etag } })).statusCode,
    ).toBe(304);
  });

  it('META-03 another set of permissions is another tag', async () => {
    const full = await metaApp();
    const limited = await metaApp({ authorizer: { can: async (_p, permission) => permission !== 'crm.note.read' } });
    const one = await full.server.inject({ method: 'GET', url: '/api/v1/_meta' });
    const two = await limited.server.inject({ method: 'GET', url: '/api/v1/_meta' });
    expect(one.headers['etag']).not.toBe(two.headers['etag']);
  });

  it('META-03 is the same bytes every time for the same caller', async () => {
    const app = await metaApp();
    const one = (await app.server.inject({ method: 'GET', url: '/api/v1/_meta' })).body;
    const two = (await app.server.inject({ method: 'GET', url: '/api/v1/_meta' })).body;
    expect(two).toBe(one);
  });
});

describe('PDP-01 the metadata says which fields hold personal data', () => {
  it('PDP-01 marks a field that is pii and a field that is encrypted, and leaves the others unmarked', async () => {
    const { defineEntity, f } = await import('@bieberkit/data');
    const { testServer } = await import('./testing.ts');
    const Person = defineEntity({
      name: 'crm.Contact',
      table: 'crm_contacts',
      api: { list: true, get: true },
      fields: {
        id: f.id(),
        taxId: f.string({ max: 20 }).optional().encrypted().pii(),
        nick: f.string({ max: 20 }).optional().pii(),
        note: f.text().optional().encrypted(),
        title: f.string({ max: 20 }),
      },
    });
    const { server } = testServer({
      authenticator: { authenticate: async () => ({ id: 'u', kind: 'user', via: 'token' }) },
      authorizer: { can: async () => true },
    });
    registerMeta(server, [Person]);
    const meta: Meta = JSON.parse((await server.inject({ method: 'GET', url: '/api/v1/_meta' })).body);
    const marked = (key: string): Record<string, unknown> => {
      const found = entity(meta, 'crm.Contact').fields.find((candidate) => candidate.key === key);
      return {
        pii: (found as { pii?: boolean } | undefined)?.pii,
        encrypted: (found as { encrypted?: boolean } | undefined)?.encrypted,
      };
    };
    expect(marked('taxId')).toEqual({ pii: true, encrypted: true });
    expect(marked('nick')).toEqual({ pii: true, encrypted: undefined });
    expect(marked('note')).toEqual({ pii: undefined, encrypted: true });
    expect(marked('title')).toEqual({ pii: undefined, encrypted: undefined });
    const validate = createAjv().compile(META_SCHEMA);
    expect([validate(meta), validate.errors]).toEqual([true, null]);
  });
});
