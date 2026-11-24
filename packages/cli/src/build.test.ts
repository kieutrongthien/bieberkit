/**
 * BieberKit
 *
 * @file        packages/cli/src/build.test.ts
 * @description Tests of bieberkit build: it regenerates from scratch, checks the types, emits the standalone validators and serializers and the document of the API, and fails with the step that failed (section 5.2, GEN-02, SCH-06).
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

import { existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { createRunner } from 'create-bieberkit/kit';
import { buildCommand } from './commands/build.ts';
import type { BuildDeps } from './commands/build.ts';
import type { Child, Spawn } from './processes.ts';
import { CRM_MODULE, makeProject } from './testing/project.ts';
import type { Fixture } from './testing/project.ts';

const fixtures: Fixture[] = [];
afterEach(() => {
  for (const fixture of fixtures.splice(0)) fixture.cleanup();
});

const project = (): Fixture => {
  const made = makeProject({ files: { 'apps/server/src/modules/crm/module.ts': CRM_MODULE } });
  fixtures.push(made);
  return made;
};

function fake(code = 0): { deps: BuildDeps; calls: { file: string; args: readonly string[]; cwd: string }[] } {
  const calls: { file: string; args: readonly string[]; cwd: string }[] = [];
  const spawn: Spawn = (file, args, options) => {
    calls.push({ file, args, cwd: options.cwd });
    const child: Child = { exit: Promise.resolve(code), kill: () => undefined };
    return child;
  };
  return { deps: { spawn }, calls };
}

async function run(root: string, deps: BuildDeps, argv: string[]) {
  const runner = createRunner({ name: 'bieberkit', version: '0.0.0', commands: [buildCommand(deps)] });
  const out: string[] = [];
  const err: string[] = [];
  const code = await runner(argv, { stdout: (t) => out.push(t), stderr: (t) => err.push(t), cwd: root });
  const parsed: unknown = argv.includes('--json') ? JSON.parse(out[0] ?? '{}') : {};
  return {
    code,
    out: out.join(''),
    err: err.join(''),
    data: Object(Reflect.get(Object(parsed), 'data')),
    error: Object(Reflect.get(Object(parsed), 'error')),
  };
}

describe('section 5.2 build', () => {
  it('GEN-02 regenerates from scratch, so a generated file that a person deleted or changed comes back', async () => {
    const { root } = project();
    const { deps } = fake();
    writeFileSync(join(root, 'tsconfig.json'), '{}');
    await run(root, deps, ['build']);
    const client = join(root, 'packages/client/src/index.ts');
    expect(existsSync(client)).toBe(true);
    writeFileSync(client, '// edited by hand\n');
    rmSync(join(root, '.bieberkit'), { recursive: true, force: true });
    await run(root, deps, ['build']);
    expect(readFileSync(client, 'utf8')).not.toContain('edited by hand');
    expect(existsSync(join(root, '.bieberkit/openapi.json'))).toBe(true);
  });

  it('SCH-06 writes the standalone validators and serializers of the entities next to the server, with their manifest', async () => {
    const { root } = project();
    const { code, data } = await run(root, fake().deps, ['build', '--json']);
    expect(code).toBe(0);
    for (const file of ['validators.cjs', 'serializers.cjs', 'standalone.json'])
      expect(existsSync(join(root, 'apps/server/dist/standalone', file))).toBe(true);
    expect(data['standalone']).toMatchObject({ entities: ['crm.Person'] });
    expect(data['steps']).toEqual(['generate', 'standalone']);
  });

  it('5.2 checks the types with the TypeScript of the project when it has a tsconfig, and says so as a step', async () => {
    const { root } = project();
    writeFileSync(join(root, 'tsconfig.json'), '{}');
    const { deps, calls } = fake();
    const { data } = await run(root, deps, ['build', '--json']);
    expect(calls).toEqual([{ file: 'pnpm', args: ['exec', 'tsc', '--noEmit', '-p', 'tsconfig.json'], cwd: root }]);
    expect(data['steps']).toEqual(['generate', 'typecheck', 'standalone']);
  });

  it('5.2 a failed type check stops the build before the standalone files and says which step failed', async () => {
    const { root } = project();
    writeFileSync(join(root, 'tsconfig.json'), '{}');
    const { code, error } = await run(root, fake(2).deps, ['build', '--json']);
    expect(code).toBe(1);
    expect(error['code']).toBe('BK_BUILD_TYPECHECK');
    expect(existsSync(join(root, 'apps/server/dist/standalone'))).toBe(false);
  });

  it('5.2 --no-typecheck skips the type check', async () => {
    const { root } = project();
    writeFileSync(join(root, 'tsconfig.json'), '{}');
    const { deps, calls } = fake();
    await run(root, deps, ['build', '--no-typecheck']);
    expect(calls).toEqual([]);
  });
});
