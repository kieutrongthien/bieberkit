/**
 * BieberKit
 *
 * @file        packages/cli/src/oxlint.test.ts
 * @description Tests of the Oxlint plugin: Oxlint itself loads it, runs the rules of bieberkit check on a file, and reports their codes with the line (section 3, section 5.2).
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
import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';
import { runCli } from './run.ts';
import { CRM_MODULE, makeProject } from './testing/project.ts';
import type { Fixture } from './testing/project.ts';

const OXLINT = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', 'node_modules', '.bin', 'oxlint');
const fixtures: Fixture[] = [];
afterEach(() => {
  for (const fixture of fixtures.splice(0)) fixture.cleanup();
});

interface Diagnostic {
  code: string;
  message: string;
  filename: string;
  labels: { span: { line: number } }[];
}

async function lint(files: Record<string, string>): Promise<Diagnostic[]> {
  const fixture = makeProject({ files: { 'apps/server/src/modules/crm/module.ts': CRM_MODULE, ...files } });
  fixtures.push(fixture);
  expect(await runCli(['generate'], { stdout: () => undefined, stderr: () => undefined, cwd: fixture.root })).toBe(0);
  let output = '';
  try {
    output = execFileSync(OXLINT, ['-c', '.bieberkit/oxlintrc.json', '--format', 'json', ...Object.keys(files)], {
      cwd: fixture.root,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
  } catch (error) {
    // Oxlint exits with 1 when it finds an error, and its answer is on stdout.
    output = Reflect.get(Object(error), 'stdout');
  }
  const parsed: { diagnostics: Diagnostic[] } = JSON.parse(output);
  return parsed.diagnostics.filter((entry) => entry.code.startsWith('bieberkit('));
}

const HEADER = `/**
 * demo
 *
 * @file        apps/server/src/a.ts
 * @description Something.
 * @author      Test <test@example.com>
 * @copyright   Copyright (c) 2026 Test
 * @license     UNLICENSED
 */

`;

describe('section 3 the Oxlint plugin of the framework', () => {
  it('3 is generated with the project: the plugin, a rule for each check that reads one file, and the author and license of the project', async () => {
    const fixture = makeProject();
    fixtures.push(fixture);
    await runCli(['generate'], { stdout: () => undefined, stderr: () => undefined, cwd: fixture.root });
    const config = JSON.parse(
      (await import('node:fs')).readFileSync(join(fixture.root, '.bieberkit/oxlintrc.json'), 'utf8'),
    );
    expect(config.jsPlugins).toEqual(['bieberkit/oxlint']);
    expect(Object.keys(config.rules)).toEqual([
      'bieberkit/headers',
      'bieberkit/env-access',
      'bieberkit/boundaries',
      'bieberkit/orm',
      'bieberkit/sql',
      'bieberkit/transactions',
    ]);
    expect(config.rules['bieberkit/headers']).toEqual([
      'error',
      { root: '.', author: 'Test <test@example.com>', license: 'UNLICENSED' },
    ]);
  });

  it('5.2 Oxlint loads it and a file with no header, a read of the environment and a driver import is reported with the codes of check', async () => {
    const found = await lint({
      'apps/server/src/a.ts':
        "import { Queue } from 'bullmq';\nconst key = process.env['KEY'];\nexport { Queue, key };\n",
    });
    expect(found.map((entry) => entry.code).toSorted()).toEqual([
      'bieberkit(boundaries)',
      'bieberkit(env-access)',
      'bieberkit(headers)',
    ]);
    const byCode = Object.fromEntries(found.map((entry) => [entry.code, entry]));
    expect(byCode['bieberkit(boundaries)']?.message).toContain('BK_BOUNDARY_DRIVER');
    expect(byCode['bieberkit(boundaries)']?.labels[0]?.span.line).toBe(1);
    expect(byCode['bieberkit(env-access)']?.message).toContain('BK_ENV_ACCESS');
    expect(byCode['bieberkit(env-access)']?.labels[0]?.span.line).toBe(2);
    expect(byCode['bieberkit(headers)']?.message).toContain('BK_HEADER_MISSING');
  });

  it('5.2 a file that follows the rules has nothing reported, and a string built into a query and a call inside a transaction are', async () => {
    const clean = await lint({ 'apps/server/src/a.ts': `${HEADER}export const a = 1;\n` });
    expect(clean).toEqual([]);
    const body = `${HEADER}await db.execute(\`select * from t where id = \${id}\`);\nawait runInTransaction(db, async () => {\n  await http.fetch(url);\n});\n`;
    const found = await lint({ 'apps/server/src/a.ts': body });
    expect(found.map((entry) => entry.message.split(':')[0] ?? '').toSorted((a, b) => a.localeCompare(b))).toEqual([
      'BK_SQL_STRING_BUILT',
      'BK_TX_EXTERNAL_CALL',
    ]);
  });

  it('5.2 the answer of the plugin and the answer of bieberkit check are the same violations', async () => {
    const fixture = makeProject({
      files: {
        'apps/server/src/modules/crm/module.ts': CRM_MODULE,
        'apps/server/src/a.ts': "const key = process.env['KEY'];\n",
      },
    });
    fixtures.push(fixture);
    const out: string[] = [];
    await runCli(['check', '--json'], { stdout: (text) => out.push(text), stderr: () => undefined, cwd: fixture.root });
    const viaCheck: { file: string; code: string }[] = JSON.parse(out[0] ?? '{}').data.violations.filter(
      (entry: { file: string }) => entry.file === 'apps/server/src/a.ts',
    );
    await runCli(['generate'], { stdout: () => undefined, stderr: () => undefined, cwd: fixture.root });
    writeFileSync(join(fixture.root, 'unused'), '');
    const output = (() => {
      try {
        return execFileSync(OXLINT, ['-c', '.bieberkit/oxlintrc.json', '--format', 'json', 'apps/server/src/a.ts'], {
          cwd: fixture.root,
          encoding: 'utf8',
          stdio: ['ignore', 'pipe', 'pipe'],
        });
      } catch (error) {
        return String(Reflect.get(Object(error), 'stdout'));
      }
    })();
    const viaPlugin: Diagnostic[] = JSON.parse(output).diagnostics.filter((entry: Diagnostic) =>
      entry.code.startsWith('bieberkit('),
    );
    expect(
      viaPlugin.map((entry) => /BK_[A-Z_]+/.exec(entry.message)?.[0] ?? '').toSorted((a, b) => a.localeCompare(b)),
    ).toEqual(viaCheck.map((entry) => entry.code).toSorted((a, b) => a.localeCompare(b)));
  });
});
