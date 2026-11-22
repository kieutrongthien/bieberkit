/**
 * BieberKit
 *
 * @file        packages/data/src/build/standalone.test.ts
 * @description Tests of the standalone Ajv validators and fast-json-stringify serializers that are emitted at build (SCH-06, PERF-06, API-01).
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

import { mkdirSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { DataError } from '../errors.ts';
import { defineEntity, f } from '../schema/index.ts';
import { toJsonSchema } from '../schema/json-schema.ts';
import { normalizeInput } from '../schema/normalize.ts';
import { Asset, Customer, User } from '../testing/sample-entities.ts';
import { createAjv } from './ajv.ts';
import { emitStandalone, rewriteRequires, writeStandalone } from './emit.ts';
import { loadStandalone } from './standalone.ts';
import type { StandaloneRuntime } from './standalone.ts';

// The generated code asks for the runtime by its package name. Tests run from the sources, so they name the source file.
const RUNTIME = fileURLToPath(new URL('../runtime.ts', import.meta.url));
const ROOT = join(fileURLToPath(new URL('../..', import.meta.url)), '.tmp');
mkdirSync(ROOT, { recursive: true });
const DEFS = [Customer, Asset, User];
const OWNER = '0190f6b2-7c4e-7000-8000-0123456789ab';
const base = { code: 'C-001', name: 'Lê', ownerId: OWNER };

let directory = '';
let runtime: StandaloneRuntime;

beforeAll(async () => {
  directory = mkdtempSync(join(ROOT, 'standalone-'));
  await writeStandalone(DEFS, directory, { runtime: RUNTIME });
  runtime = await loadStandalone(directory);
});
afterAll(() => rmSync(directory, { recursive: true, force: true }));

function failureOf(run: () => unknown): unknown {
  try {
    run();
  } catch (error) {
    return error;
  }
  throw new Error('Expected the call to fail.');
}

describe('emitStandalone', () => {
  it('SCH-06 gives the same bytes and the same hash for the same entities, in any order', () => {
    const one = emitStandalone(DEFS);
    const two = emitStandalone(DEFS.toReversed());
    expect(two.validators).toBe(one.validators);
    expect(two.serializers).toBe(one.serializers);
    expect(two.manifest).toEqual(one.manifest);
    expect(one.manifest.hash).toMatch(/^[0-9a-f]{64}$/);
  });

  it('SCH-06 gives another hash when an entity changes', () => {
    const changed = defineEntity({
      name: 'users.User',
      table: 'users',
      fields: { id: f.id(), name: f.string({ min: 1, max: 99 }) },
    });
    expect(emitStandalone([Customer, Asset, changed]).manifest.hash).not.toBe(emitStandalone(DEFS).manifest.hash);
  });

  it('SCH-06 the generated code asks for the runtime of this package and for nothing else', () => {
    const files = emitStandalone(DEFS);
    for (const text of [files.validators, files.serializers]) {
      const wanted = new Set([...text.matchAll(/require\((["'])([^"']+)\1\)/g)].map((match) => match[2]));
      expect([...wanted]).toEqual(['@bieberkit/data/runtime']);
    }
  });

  it('SCH-06 names the entities and the format in the manifest', () => {
    expect(emitStandalone(DEFS).manifest).toMatchObject({
      version: 1,
      entities: ['crm.Customer', 'inventory.Asset', 'users.User'],
    });
  });
});

describe('rewriteRequires', () => {
  it('SCH-06 points a known helper at the runtime, keeping what follows it', () => {
    const out = rewriteRequires(
      'const u = require("ajv/dist/runtime/ucs2length").default; const s = require(\'fast-json-stringify/lib/serializer\');',
      'rt',
    );
    expect(out).toBe('const u = require("rt").ucs2length.default; const s = require("rt").serializer;');
  });

  it('SCH-06 stops the build for a helper that the runtime does not have', () => {
    const error = failureOf(() => rewriteRequires('require("left-pad")', 'rt'));
    expect(error).toBeInstanceOf(DataError);
    expect(error).toMatchObject({ code: 'DATA_STANDALONE_UNSUPPORTED' });
    expect(error instanceof Error ? error.message : '').toContain('left-pad');
  });
});

describe('the standalone validators', () => {
  const fixtures: [string, 'create' | 'update', unknown][] = [
    ['the smallest create', 'create', base],
    [
      'every kind of field',
      'create',
      {
        ...base,
        email: 'a@b.co',
        tier: 'gold',
        credit: '12.30',
        balance: { amount: '12500', currency: 'VND' },
        note: 'ghi chú',
        active: false,
        since: '2026-11-22',
        lastSeen: '2026-11-22T10:00:00Z',
        visits: 3,
      },
    ],
    ['a missing required field', 'create', { code: 'C', name: 'x' }],
    ['an unknown field', 'create', { ...base, nope: 1 }],
    ['a bad tier', 'create', { ...base, tier: 'platinum' }],
    ['a bad e-mail', 'create', { ...base, email: 'not-an-email' }],
    ['a bad decimal', 'create', { ...base, credit: '12.345' }],
    ['a bad date', 'create', { ...base, since: '2026-13-40' }],
    ['a negative whole number', 'create', { ...base, visits: -1 }],
    ['a name that is too long', 'create', { ...base, name: 'x'.repeat(201) }],
    ['200 emoji in a name of 200', 'create', { ...base, name: '😀'.repeat(200) }],
    ['201 emoji in a name of 200', 'create', { ...base, name: '😀'.repeat(201) }],
    ['a code that is not text', 'create', { ...base, code: 7 }],
    ['an owner that is not a UUID', 'create', { ...base, ownerId: 'x' }],
    ['a null for an optional field', 'create', { ...base, note: null }],
    ['a null for a required field', 'create', { ...base, name: null }],
    ['an update of one field', 'update', { name: 'New' }],
    ['an empty update', 'update', {}],
    ['an update of an unknown field', 'update', { id: OWNER }],
    ['a body that is not an object', 'update', 'text'],
  ];

  it.each(fixtures)('SCH-06 the standalone verdict equals the verdict of Ajv: %s', (_name, mode, input) => {
    const ajv = createAjv();
    const compiled = ajv.compile(toJsonSchema(Customer, mode));
    const expected = compiled(normalizeInput(input));
    expect(runtime.validate('crm.Customer', mode, input).ok).toBe(expected);
  });

  it('SCH-05 returns the normalized value, so decomposed text arrives composed', () => {
    const result = runtime.validate('crm.Customer', 'create', { ...base, name: 'Lê'.normalize('NFD') });
    expect(result).toEqual({ ok: true, value: { ...base, name: 'Lê'.normalize('NFC') } });
  });

  it('SCH-06 reports the place and the rule of each problem', () => {
    const result = runtime.validate('crm.Customer', 'create', {
      code: 'C',
      name: '',
      tier: 'x',
      balance: { amount: 'abc', currency: 'VND' },
      extra: 1,
    });
    expect(result.ok).toBe(false);
    const issues = result.ok ? [] : result.issues;
    const where = (path: string) => issues.filter((issue) => issue.path === path).map((issue) => issue.keyword);
    expect(where('ownerId')).toContain('required');
    expect(where('name')).toContain('minLength');
    expect(where('tier')).toContain('enum');
    expect(where('extra')).toContain('additionalProperties');
    expect(where('balance.amount').length).toBeGreaterThan(0);
    for (const issue of issues) expect(issue.message).not.toBe('');
  });

  it('SCH-06 a body that is not an object has an issue at the root', () => {
    const result = runtime.validate('crm.Customer', 'update', 'text');
    expect(result).toMatchObject({ ok: false, issues: [{ path: '', keyword: 'type' }] });
  });

  it('SCH-06 each entity has its own validators', () => {
    expect(runtime.validate('users.User', 'create', { name: 'Ann' }).ok).toBe(true);
    expect(runtime.validate('users.User', 'create', { name: 'Ann', code: 'x' }).ok).toBe(false);
  });

  it('SCH-06 an entity or a mode that is not in the build is refused', () => {
    expect(failureOf(() => runtime.validate('crm.Nope', 'create', {}))).toMatchObject({
      code: 'DATA_STANDALONE_UNKNOWN',
    });
    // @ts-expect-error read is not a mode of a validator
    expect(failureOf(() => runtime.validate('crm.Customer', 'read', {}))).toMatchObject({
      code: 'DATA_STANDALONE_UNKNOWN',
    });
  });
});

describe('the standalone serializers', () => {
  const row = {
    id: '0190f6b2-7c4e-7000-8000-0123456789ab',
    version: 3,
    createdAt: '2026-11-22T10:00:00.000Z',
    updatedAt: '2026-11-22T10:00:00.000Z',
    createdBy: null,
    updatedBy: null,
    deletedAt: null,
    code: 'C-001',
    name: 'Nguyễn Văn A',
    tier: 'gold',
    active: true,
    visits: 2,
    score: 7,
    number: 'CUS-00001',
    status: 'new',
    ownerId: OWNER,
    email: null,
    credit: '12.30',
    balance: { amount: '12500', currency: 'VND' },
    note: null,
    since: '2026-11-22',
    lastSeen: null,
  };

  it('API-01 writes the fields of the read schema, with Vietnamese text intact', () => {
    const parsed: unknown = JSON.parse(runtime.serialize('crm.Customer', row));
    expect(parsed).toMatchObject({
      code: 'C-001',
      name: 'Nguyễn Văn A',
      credit: '12.30',
      balance: { amount: '12500', currency: 'VND' },
    });
  });

  it('API-01 never writes a field that the read schema does not name', () => {
    const leaky = {
      ...row,
      passwordHash: 'LEAK',
      tenantId: 'LEAK',
      nameCmp: 'LEAK',
      internal: { a: 1 },
    };
    const text = runtime.serialize('crm.Customer', leaky);
    expect(text).not.toContain('LEAK');
    expect(text).not.toContain('internal');
  });

  it('API-01 refuses a row that has an unexpected key inside a value, instead of writing it', () => {
    const nested = { ...row, balance: { amount: '1', currency: 'VND', secret: 'LEAK' } };
    expect(() => runtime.serialize('crm.Customer', nested)).toThrow(/does not match/);
  });

  it('PERF-06 writes a list of rows as one array', () => {
    const parsed: unknown[] = JSON.parse(
      runtime.serializeMany('crm.Customer', [row, { ...row, code: 'C-002', passwordHash: 'LEAK' }]),
    );
    expect(parsed).toHaveLength(2);
    expect(JSON.stringify(parsed)).not.toContain('LEAK');
    expect(JSON.parse(runtime.serializeMany('crm.Customer', []))).toEqual([]);
  });

  it('API-01 an unknown entity is refused', () => {
    expect(failureOf(() => runtime.serialize('crm.Nope', {}))).toMatchObject({ code: 'DATA_STANDALONE_UNKNOWN' });
  });
});

describe('a stale build', () => {
  it('SCH-06 passes when the entities are the ones that were built, in any order', () => {
    expect(() => runtime.assertCurrent(DEFS)).not.toThrow();
    expect(() => runtime.assertCurrent(DEFS.toReversed())).not.toThrow();
  });

  it('SCH-06 is refused when an entity changed, or one was added or left out', () => {
    const changed = defineEntity({
      name: 'users.User',
      table: 'users',
      fields: { id: f.id(), name: f.string({ min: 1, max: 99 }) },
    });
    for (const defs of [
      [Customer, Asset, changed],
      [Customer, Asset],
      [...DEFS, changed],
    ]) {
      expect(failureOf(() => runtime.assertCurrent(defs))).toMatchObject({ code: 'DATA_STANDALONE_STALE' });
    }
  });
});

describe('writeStandalone and loadStandalone', () => {
  it('SCH-06 writes the three files, and the manifest is what emit gave', () => {
    const manifest: unknown = JSON.parse(readFileSync(join(directory, 'standalone.json'), 'utf8'));
    expect(manifest).toEqual(emitStandalone(DEFS).manifest);
    expect(readFileSync(join(directory, 'validators.cjs'), 'utf8')).toContain('crm.Customer:create');
    expect(readFileSync(join(directory, 'serializers.cjs'), 'utf8')).toContain('crm.Customer:read');
  });

  it('SCH-06 a directory without a build says so', async () => {
    const empty = mkdtempSync(join(ROOT, 'empty-'));
    try {
      await expect(loadStandalone(empty)).rejects.toMatchObject({ code: 'DATA_STANDALONE_UNKNOWN' });
    } finally {
      rmSync(empty, { recursive: true, force: true });
    }
  });
});
