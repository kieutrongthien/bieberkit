/**
 * BieberKit
 *
 * @file        packages/cli/src/make.test.ts
 * @description Tests of make:module, make:entity and make:job: the files that they write pass the rules of check, are registered in their module, and load as part of the application (section 5.2, section 7.4).
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

import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { runCli } from './run.ts';
import { makeProject } from './testing/project.ts';
import type { Fixture } from './testing/project.ts';

const fixtures: Fixture[] = [];
afterEach(() => {
  for (const fixture of fixtures.splice(0)) fixture.cleanup();
});
const project = (): Fixture => {
  const made = makeProject();
  fixtures.push(made);
  return made;
};

async function run(root: string, argv: string[]) {
  const out: string[] = [];
  const err: string[] = [];
  const code = await runCli(argv, { stdout: (text) => out.push(text), stderr: (text) => err.push(text), cwd: root });
  const parsed: unknown = argv.includes('--json') ? JSON.parse(out[0] ?? '{}') : undefined;
  const json = typeof parsed === 'object' && parsed !== null ? Object.fromEntries(Object.entries(parsed)) : {};
  return { code, out: out.join(''), err: err.join(''), json, data: Object(json['data']), error: Object(json['error']) };
}

const read = (root: string, path: string): string => readFileSync(join(root, path), 'utf8');
const MODULE = 'apps/server/src/modules/crm/module.ts';

describe('section 5.2 make:module', () => {
  it('5.2 writes the module with the header of the project and the markers that the other recipes use', async () => {
    const { root } = project();
    const { code, data } = await run(root, ['make:module', 'crm', '--json']);
    expect([code, data.files]).toEqual([0, [MODULE]]);
    const text = read(root, MODULE);
    expect(text).toContain('@file        apps/server/src/modules/crm/module.ts');
    expect(text).toContain('@author      Test <test@example.com>');
    expect(text).toMatch(/@copyright   Copyright \(c\) \d{4} Test\n/);
    expect(text).toContain("name: 'crm'");
    for (const marker of ['bieberkit:imports', 'bieberkit:entities', 'bieberkit:jobs']) expect(text).toContain(marker);
  });

  it('5.2 refuses a name that is not a module name with a usage error, and a module that exists', async () => {
    const { root } = project();
    expect((await run(root, ['make:module', 'Crm', '--json'])).error.code).toBe('BK_MAKE_NAME_INVALID');
    expect((await run(root, ['make:module', 'Crm'])).code).toBe(2);
    await run(root, ['make:module', 'crm']);
    const again = await run(root, ['make:module', 'crm', '--json']);
    expect([again.code, again.error.code]).toEqual([1, 'BK_MAKE_EXISTS']);
  });
});

describe('section 5.2 make:entity', () => {
  it('5.2 writes the entity, registers it, and the application then has its routes', async () => {
    const { root } = project();
    await run(root, ['make:module', 'crm']);
    const { code, data } = await run(root, ['make:entity', 'crm.SalesOrder', '--tenant', '--json']);
    expect([code, data.files]).toEqual([0, ['apps/server/src/modules/crm/entities/sales-order.ts', MODULE]]);
    const entity = read(root, 'apps/server/src/modules/crm/entities/sales-order.ts');
    expect(entity).toContain("name: 'crm.SalesOrder'");
    expect(entity).toContain("table: 'crm_sales_orders'");
    expect(entity).toContain('tenant: true');
    const module = read(root, MODULE);
    expect(module).toContain("import { SalesOrder } from './entities/sales-order.ts';");
    expect(module).toMatch(/entities: \[\n {4}SalesOrder,\n {4}\/\/ bieberkit:entities/);
    const routes = await run(root, ['routes']);
    expect(routes.out).toContain('/api/v1/crm/sales-orders');
  });

  it('5.2 registers a second entity next to the first, keeping the markers', async () => {
    const { root } = project();
    await run(root, ['make:module', 'crm']);
    await run(root, ['make:entity', 'crm.Deal']);
    await run(root, ['make:entity', 'crm.Contact']);
    const module = read(root, MODULE);
    expect(module).toMatch(/entities: \[\n {4}Deal,\n {4}Contact,\n {4}\/\/ bieberkit:entities/);
    expect(module.match(/bieberkit:imports/g)).toHaveLength(1);
    expect((await run(root, ['routes', '--json'])).data.routes.length).toBeGreaterThan(8);
  });

  it('5.2 the files that it writes pass bieberkit check, and generate works on them', async () => {
    const { root } = project();
    await run(root, ['make:module', 'crm']);
    await run(root, ['make:entity', 'crm.Deal']);
    await run(root, ['make:job', 'crm.send-welcome']);
    expect((await run(root, ['generate'])).code).toBe(0);
    const checked = await run(root, ['check', '--json']);
    expect(checked.data.violations).toEqual([]);
    expect(checked.code).toBe(0);
    expect(existsSync(join(root, '.bieberkit/schemas/crm.Deal.create.json'))).toBe(true);
  });

  it('5.2 says what is wrong: a name that is not <module>.<Name>, a module that does not exist, a name in lower case', async () => {
    const { root } = project();
    expect((await run(root, ['make:entity', 'Deal', '--json'])).error.code).toBe('BK_MAKE_NAME_INVALID');
    expect((await run(root, ['make:entity', 'crm.deal', '--json'])).error.code).toBe('BK_MAKE_NAME_INVALID');
    const missing = await run(root, ['make:entity', 'crm.Deal', '--json']);
    expect([missing.code, missing.error.code, missing.error.fix]).toEqual([
      1,
      'BK_MAKE_MODULE_MISSING',
      'Run: bieberkit make:module crm',
    ]);
  });

  it('5.2 a module whose marker was edited away still gets the file, and the error gives the lines to add by hand', async () => {
    const { root } = project();
    await run(root, ['make:module', 'crm']);
    writeFileSync(join(root, MODULE), read(root, MODULE).replace('// bieberkit:entities', ''));
    const { code, error } = await run(root, ['make:entity', 'crm.Deal', '--json']);
    expect([code, error.code]).toEqual([1, 'BK_MAKE_UNREGISTERED']);
    expect(error.fix).toContain("import { Deal } from './entities/deal.ts'");
    expect(existsSync(join(root, 'apps/server/src/modules/crm/entities/deal.ts'))).toBe(true);
  });
});

describe('section 5.2 make:job', () => {
  it('5.2 writes a job with the name of the module, and registers it in jobs', async () => {
    const { root } = project();
    await run(root, ['make:module', 'crm']);
    const { code, data } = await run(root, ['make:job', 'crm.send-welcome', '--json']);
    expect([code, data.files]).toEqual([0, ['apps/server/src/modules/crm/jobs/send-welcome.ts', MODULE]]);
    const job = read(root, 'apps/server/src/modules/crm/jobs/send-welcome.ts');
    expect(job).toContain("name: 'crm.send-welcome'");
    expect(job).toContain('export const sendWelcome');
    expect(read(root, MODULE)).toMatch(/jobs: \[\n {4}sendWelcome,\n {4}\/\/ bieberkit:jobs/);
  });

  it('5.2 a job name with a capital letter is a usage error', async () => {
    const { root } = project();
    await run(root, ['make:module', 'crm']);
    expect((await run(root, ['make:job', 'crm.SendWelcome'])).code).toBe(2);
  });
});
