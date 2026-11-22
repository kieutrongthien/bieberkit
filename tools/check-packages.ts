/**
 * BieberKit
 *
 * @file        tools/check-packages.ts
 * @description Packs every package from inside the workspace and runs publint and attw on the tarballs.
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

// Usage: node tools/check-packages.ts
// Run `pnpm build` first. Packing must happen inside the workspace: outside it, `workspace:*` dependencies cannot be
// resolved (13 of 18 packages failed in the ADR 0014 spike). Tarballs go to a temporary directory.

import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { packageChecks } from './lib/packages.ts';

const ROOT = resolve(import.meta.dirname, '..');
const out = mkdtempSync(join(tmpdir(), 'bieberkit-pack-'));
let failures = 0;
try {
  execFileSync('pnpm', ['--filter', './packages/*', 'exec', 'pnpm', 'pack', '--pack-destination', out], {
    cwd: ROOT,
    stdio: ['ignore', 'ignore', 'inherit'],
  });
  const tarballs = readdirSync(out)
    .filter((f) => f.endsWith('.tgz'))
    .toSorted();
  for (const tgz of tarballs) {
    for (const check of packageChecks(join(out, tgz))) {
      const r = spawnSync('pnpm', ['exec', check.tool, ...check.args], { cwd: ROOT, encoding: 'utf8' });
      if (r.status !== 0) {
        failures++;
        process.stdout.write(
          `${tgz}  ${check.tool} failed\n${`${r.stdout}${r.stderr}`
            .split('\n')
            .slice(0, 8)
            .map((l) => `    ${l}`)
            .join('\n')}\n`,
        );
      }
    }
  }
  const isPrivate = (dir: string): boolean => {
    try {
      const parsed: unknown = JSON.parse(readFileSync(join(ROOT, 'packages', dir, 'package.json'), 'utf8'));
      return typeof parsed === 'object' && parsed !== null && 'private' in parsed && parsed.private === true;
    } catch {
      return false;
    }
  };
  const privateCount = readdirSync(join(ROOT, 'packages')).filter(isPrivate).length;
  if (failures > 0) {
    process.stdout.write(
      `\n${failures} package check(s) failed. Fix the package exports or types, then run pnpm build and this check again.\n`,
    );
    process.exitCode = 1;
  } else {
    process.stdout.write(
      `check:packages ok (${tarballs.length} tarballs; publint and attw --profile esm-only)${privateCount > 0 ? `. ${privateCount} package(s) still have private: true, which must go before the first release (ADR 0014)` : ''}\n`,
    );
  }
} finally {
  rmSync(out, { recursive: true, force: true });
}
