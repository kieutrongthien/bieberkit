/**
 * BieberKit
 *
 * @file        packages/cli/src/generate.test.ts
 * @description Tests of the generators and their commands on a throwaway project: routes, openapi, the generated files, the typed client, and the check of stale files (section 5.2, section 5.4, GEN-01 to GEN-03, API-07).
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

import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';
import { runCli } from './run.ts';
import { CRM_MODULE, makeProject } from './testing/project.ts';
import type { Fixture, FixtureOptions } from './testing/project.ts';

const fixtures: Fixture[] = [];
afterEach(() => {
  for (const fixture of fixtures.splice(0)) fixture.cleanup();
});

const MODULE = 'apps/server/src/modules/crm/module.ts';
const TYPE_ROOTS = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', 'node_modules', '@types');
const TSC = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', 'node_modules', '.bin', 'tsc');

function project(options: FixtureOptions = {}): Fixture {
  const made = makeProject({ files: { [MODULE]: CRM_MODULE }, ...options });
  fixtures.push(made);
  return made;
}

async function run(root: string, argv: string[]) {
  const out: string[] = [];
  const err: string[] = [];
  const code = await runCli(argv, { stdout: (text) => out.push(text), stderr: (text) => err.push(text), cwd: root });
  const parsed: unknown = argv.includes('--json') ? JSON.parse(out[0] ?? '{}') : undefined;
  const json = typeof parsed === 'object' && parsed !== null ? Object.fromEntries(Object.entries(parsed)) : {};
  return { code, out: out.join(''), err: err.join(''), json, data: Object(json['data']) };
}

describe('section 5.2 routes', () => {
  it('5.2 lists the routes of the entities and of the modules with their permission, or public', async () => {
    const { root } = project();
    const { code, out } = await run(root, ['routes']);
    expect(code).toBe(0);
    expect(out).toMatch(/GET\s+\/api\/v1\/crm\/people\s+crm\.person\.read/);
    expect(out).toContain('crm.person.read');
    expect(out).toContain('/api/v1/crm/ping');
    expect(out).toContain('public');
  });

  it('AI-03 --json gives the rows, sorted by path and method', async () => {
    const { root } = project();
    const { data } = await run(root, ['routes', '--json']);
    const routes: { method: string; url: string; access: string }[] = data.routes;
    expect(routes.map((route) => `${route.method} ${route.url}`)).toEqual([
      'GET /api/v1/crm/people',
      'POST /api/v1/crm/people',
      'DELETE /api/v1/crm/people/:id',
      'GET /api/v1/crm/people/:id',
      'PATCH /api/v1/crm/people/:id',
      'POST /api/v1/crm/people/bulk',
      'GET /api/v1/crm/ping',
    ]);
  });

  it('5.2 an application with no modules has no routes', async () => {
    const { root } = project({ files: {} });
    expect((await run(root, ['routes'])).out).toContain('no routes');
  });

  it('5.2 a module file that does not export a module is BK_MODULE_NOT_EXPORTED', async () => {
    const { root } = project({ files: { [MODULE]: 'export const x = 1;\n' } });
    expect((await run(root, ['routes', '--json'])).json).toMatchObject({ error: { code: 'BK_MODULE_NOT_EXPORTED' } });
  });
});

describe('section 5.2 openapi', () => {
  it('API-06 prints the document, with an operation for each route and the permission of each', async () => {
    const { root } = project();
    const { data } = await run(root, ['openapi', '--json']);
    expect(data).toMatchObject({ openapi: '3.1.0', info: { title: 'demo' } });
    expect(Object(data.paths)['/api/v1/crm/people']).toBeDefined();
    expect(Object(Object(Object(data.paths)['/api/v1/crm/people']).get)['x-permission']).toBe('crm.person.read');
  });

  it('GEN-03 gives the same bytes at every run, and --out writes the file', async () => {
    const { root } = project();
    const first = await run(root, ['openapi']);
    const second = await run(root, ['openapi']);
    expect(first.out).toBe(second.out);
    const written = await run(root, ['openapi', '--out', 'out/openapi.json', '--json']);
    expect(written.code).toBe(0);
    expect(`${readFileSync(join(root, 'out/openapi.json'), 'utf8').trimEnd()}\n`).toBe(`${first.out.trimEnd()}\n`);
  });
});

describe('GEN-01 the generated files', () => {
  it('GEN-02 generate writes the types, the schemas, the graph, the document and the client, and says which', async () => {
    const { root } = project();
    const { code, data } = await run(root, ['generate', '--json']);
    expect(code).toBe(0);
    expect(data.written.toSorted()).toEqual(
      [
        '.bieberkit/meta/plugins.json',
        '.bieberkit/openapi.json',
        '.bieberkit/oxlintrc.json',
        '.bieberkit/schemas/crm.Person.create.json',
        '.bieberkit/schemas/crm.Person.read.json',
        '.bieberkit/schemas/crm.Person.update.json',
        '.bieberkit/types/entities.d.ts',
        '.bieberkit/vitest.config.ts',
        '.bieberkit/vitest.setup.ts',
        'packages/client/package.json',
        'packages/client/src/index.ts',
      ].toSorted(),
    );
    expect(readFileSync(join(root, '.bieberkit/types/entities.d.ts'), 'utf8')).toContain("'crm.Person'");
    expect(JSON.parse(readFileSync(join(root, '.bieberkit/meta/plugins.json'), 'utf8'))).toMatchObject({
      entities: ['crm.Person'],
      modules: ['crm'],
    });
  });

  it('HDR-05 a generated file with comments carries the header, @generated and the command, and no year', async () => {
    const { root } = project();
    await run(root, ['generate']);
    const text = readFileSync(join(root, 'packages/client/src/index.ts'), 'utf8');
    expect(text.startsWith('/**\n * demo\n')).toBe(true);
    expect(text).toContain('@file        packages/client/src/index.ts');
    expect(text).toContain('@generated   bieberkit client:generate');
    expect(text).not.toMatch(/@copyright/);
  });

  it('GEN-03 a second run writes nothing, and a file that was edited is written again', async () => {
    const { root } = project();
    await run(root, ['generate']);
    const again = await run(root, ['generate', '--json']);
    expect(again.data.written).toEqual([]);
    writeFileSync(join(root, '.bieberkit/openapi.json'), '{}');
    expect((await run(root, ['generate', '--json'])).data.written).toEqual(['.bieberkit/openapi.json']);
  });

  it('GEN-01 --check writes nothing and exits with 3 when a file is missing or stale', async () => {
    const { root } = project();
    const missing = await run(root, ['client:generate', '--check', '--json']);
    expect([missing.code, missing.data.stale]).toEqual([
      3,
      ['packages/client/package.json', 'packages/client/src/index.ts'],
    ]);
    expect(existsSync(join(root, 'packages/client'))).toBe(false);
    await run(root, ['client:generate']);
    expect((await run(root, ['client:generate', '--check'])).code).toBe(0);
    writeFileSync(join(root, 'packages/client/src/index.ts'), 'edited\n');
    expect((await run(root, ['client:generate', '--check'])).code).toBe(3);
  });

  it('GEN-01 client:generate writes only the client', async () => {
    const { root } = project();
    await run(root, ['client:generate']);
    expect(existsSync(join(root, 'packages/client/src/index.ts'))).toBe(true);
    expect(existsSync(join(root, '.bieberkit'))).toBe(false);
  });
});

async function client(root: string, fetcher: typeof fetch) {
  await run(root, ['client:generate']);
  const loaded: unknown = await import(/* @vite-ignore */ join(root, 'packages/client/src/index.ts'));
  const create = Reflect.get(Object(loaded), 'createClient');
  if (typeof create !== 'function') throw new Error('The client has no createClient.');
  const made: Record<string, (input?: unknown) => Promise<unknown>> = create({
    baseUrl: 'https://api.test',
    fetch: fetcher,
    headers: () => ({ authorization: 'Bearer t' }),
  });
  return { api: made, ApiError: Reflect.get(Object(loaded), 'ApiError') };
}

describe('API-07 the typed client', () => {
  const calls: { url: string; init: RequestInit }[] = [];
  const answer =
    (status: number, body?: unknown): typeof fetch =>
    async (url, init) => {
      calls.push({ url: typeof url === 'string' ? url : url instanceof URL ? url.href : url.url, init: init ?? {} });
      return new Response(body === undefined ? null : JSON.stringify(body), { status });
    };

  it('API-07 has a function for each operation, which builds the path, the query, the headers and the body', async () => {
    calls.length = 0;
    const { root } = project();
    const { api } = await client(root, answer(200, { data: { id: 'a b' } }));
    expect(Object.keys(api).toSorted()).toEqual([
      'deleteCrmPeopleById',
      'getCrmPeople',
      'getCrmPeopleById',
      'getCrmPing',
      'patchCrmPeopleById',
      'postCrmPeople',
      'postCrmPeopleBulk',
    ]);
    await api['getCrmPeopleById']?.({ path: { id: 'a b' }, query: { include: 'x' } });
    await api['getCrmPeople']?.({ query: { pageSize: 5, filter: { name: { eq: 'Ann' } }, sort: 'name' } });
    await api['postCrmPeople']?.({ body: { name: 'Ann', email: 'a@b.vn' } });
    expect(calls[0]?.url).toBe('https://api.test/api/v1/crm/people/a%20b?include=x');
    expect(calls[1]?.url).toBe('https://api.test/api/v1/crm/people?pageSize=5&filter%5Bname%5D%5Beq%5D=Ann&sort=name');
    expect(calls[2]?.init).toMatchObject({ method: 'POST', body: '{"name":"Ann","email":"a@b.vn"}' });
    expect(Object(calls[2]?.init.headers)).toMatchObject({
      authorization: 'Bearer t',
      'content-type': 'application/json',
      accept: 'application/json',
    });
  });

  it('API-13 sends If-Match from the headers of the input, and takes a 204 as nothing', async () => {
    calls.length = 0;
    const { root } = project();
    const { api } = await client(root, answer(204));
    await expect(
      api['deleteCrmPeopleById']?.({ path: { id: 'x' }, headers: { 'If-Match': '3' } }),
    ).resolves.toBeUndefined();
    expect(Object(calls[0]?.init.headers)).toMatchObject({ 'If-Match': '3' });
  });

  it('MOD-17 an answer that is not a success is an ApiError with the status and the problem of the server', async () => {
    const { root } = project();
    const problem = {
      type: 'x',
      title: 'Bad',
      status: 400,
      detail: 'The request is not valid.',
      code: 'HTTP_VALIDATION_FAILED',
      traceId: 't',
    };
    const { api, ApiError } = await client(root, answer(400, problem));
    const failure = await (api['getCrmPeople']?.() ?? Promise.resolve()).catch((error: unknown) => error);
    expect(failure).toBeInstanceOf(ApiError);
    expect(failure).toMatchObject({
      status: 400,
      problem: { code: 'HTTP_VALIDATION_FAILED' },
      message: 'The request is not valid.',
    });
  });

  it('API-07 the generated file type checks under the strictest settings of the project', async () => {
    const { root } = project();
    await run(root, ['client:generate']);
    // The compiler of the repository, run on the file alone. It throws with the diagnostics when the file does not compile.
    expect(() =>
      execFileSync(
        TSC,
        [
          '--ignoreConfig',
          '--noEmit',
          '--declaration',
          '--strict',
          '--isolatedDeclarations',
          '--exactOptionalPropertyTypes',
          '--noUncheckedIndexedAccess',
          '--erasableSyntaxOnly',
          '--target',
          'esnext',
          '--module',
          'esnext',
          '--moduleResolution',
          'bundler',
          // The libraries of a project that create makes: no DOM, and the types of Node.js.
          '--lib',
          'esnext',
          '--types',
          'node',
          '--typeRoots',
          TYPE_ROOTS,
          '--skipLibCheck',
          join(root, 'packages/client/src/index.ts'),
        ],
        { stdio: 'pipe', encoding: 'utf8' },
      ),
    ).not.toThrow();
  });
});

describe('GEN-01 and API-02 in bieberkit check', () => {
  it('GEN-01 check generated fails with 3 while the client is missing or stale, and passes once it is current', async () => {
    const { root } = project();
    const before = await run(root, ['check', 'generated', '--json']);
    expect([before.code, before.data.violations.map((entry: { code: string }) => entry.code)]).toEqual([
      3,
      ['BK_GENERATED_STALE', 'BK_GENERATED_STALE'],
    ]);
    await run(root, ['generate']);
    expect((await run(root, ['check', 'generated'])).code).toBe(0);
    writeFileSync(join(root, 'packages/client/src/index.ts'), 'edited\n');
    expect((await run(root, ['check', 'generated'])).code).toBe(3);
  });

  it('API-02 check routes finds a route with neither a permission nor public', async () => {
    const odd = CRM_MODULE.replace('public: true,', '');
    const { root } = project({ files: { [MODULE]: odd } });
    const { code, data } = await run(root, ['check', 'routes', '--json']);
    expect(code).toBe(3);
    expect(data.violations[0]).toMatchObject({
      code: 'BK_ROUTE_NO_PERMISSION',
      message: expect.stringContaining('GET /api/v1/crm/ping'),
    });
    expect((await run(project().root, ['check', 'routes'])).code).toBe(0);
  });

  it('API-02 a project whose application cannot be loaded is one violation, not a crash of the whole check', async () => {
    const { root } = project({ files: { [MODULE]: 'throw new Error("boom");\n' } });
    const { code, data } = await run(root, ['check', 'routes', '--json']);
    expect(code).toBe(3);
    expect(data.violations[0]).toMatchObject({ code: 'BK_APP_UNLOADABLE' });
  });
});
