/**
 * BieberKit
 *
 * @file        packages/data/src/schema/bundle.test.ts
 * @description The client bundle test: entity definitions with custom fields stay small, and no ORM, Ajv or whole validator library is pulled in (SCH-07, SCH-08).
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

import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { gzipSync } from 'node:zlib';
import { rolldown } from 'rolldown';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const PACKAGE = resolve(import.meta.dirname, '..', '..');
const SRC = join(PACKAGE, 'src');

let dir = '';

beforeAll(() => {
  mkdirSync(join(PACKAGE, '.tmp'), { recursive: true });
  dir = mkdtempSync(join(PACKAGE, '.tmp', 'bundle-'));
});

afterAll(() => {
  rmSync(dir, { recursive: true, force: true });
});

/** 20 entities with a custom field whose `zod` is a schema value, compiled to Zod Mini, as a client would do. */
const entry = (extra: string): string => `
import * as z from 'zod/mini';
import { defineEntity, f } from '${join(SRC, 'schema', 'index.ts')}';
import { toZodMini } from '${join(SRC, 'schema', 'zod-mini.ts')}';

const entities = Array.from({ length: 20 }, (_, i) =>
  defineEntity({
    name: 'bench.E' + i,
    table: 'bench_e' + i,
    fields: {
      id: f.id(),
      a: f.string({ max: 50 }),
      b: f.email().optional(),
      c: f.custom({ column: { type: 'varchar', length: 8 }, jsonSchema: { type: 'string' }, zod: z.string(), tsType: 'string' }),
      d: f.money({ currency: 'USD' }),
    },
  }),
);
(globalThis as Record<string, unknown>)['schemas'] = entities.map((entity) => toZodMini(entity, 'create'));
${extra}
`;

async function bundle(name: string, source: string): Promise<{ text: string; gzip: number }> {
  const file = join(dir, `${name}.ts`);
  writeFileSync(file, source);
  const build = await rolldown({
    input: file,
    platform: 'browser',
    logLevel: 'silent',
    resolve: { conditionNames: ['@bieberkit/source', 'import', 'default'] },
  });
  const { output } = await build.generate({ format: 'esm', minify: true });
  await build.close();
  const text = output.map((chunk) => ('code' in chunk ? chunk.code : '')).join('\n');
  return { text, gzip: gzipSync(text).length };
}

describe('SCH-07 client bundle', () => {
  it('20 entities with a custom field and their Zod Mini schemas stay under 20 KB gzipped (ADR 0009 measured 9 KB)', async () => {
    const { gzip } = await bundle('values', entry(''));
    expect(gzip).toBeLessThan(20_000);
  });

  it('pulls in no ORM, no Ajv and no database driver (SCH-08)', async () => {
    const { text: withComments } = await bundle('forbidden', entry(''));
    // The file headers are kept as legal comments, and they mention Ajv in prose, so only the code is searched.
    const text = withComments.replace(/\/\*[\s\S]*?\*\//g, '');
    for (const name of ['mikro-orm', 'MikroORM', 'better-sqlite3', 'kysely', 'Ajv', 'ajv-formats'])
      expect(text).not.toContain(name);
  });

  it('the limit has power: handing the whole Zod namespace to the entity code, as a callback would, is several times bigger', async () => {
    const values = await bundle('values-again', entry(''));
    const callback = await bundle('callback', entry("(globalThis as Record<string, unknown>)['z'] = z;"));
    expect(callback.gzip).toBeGreaterThan(values.gzip * 3);
    expect(callback.gzip).toBeGreaterThan(20_000);
  });
});
