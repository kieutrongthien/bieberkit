/**
 * BieberKit
 *
 * @file        tools/api-report.ts
 * @description Writes and checks the committed API report of every package (spec section 22.3, step 4).
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

// Usage: node tools/api-report.ts                          check the committed reports against the built output
//        node tools/api-report.ts --write                  rewrite them (pnpm api:update)
//        node tools/api-report.ts --changeset-since <ref>  fail when a report changed since <ref> and no changeset was added
// Run `pnpm build` first. The reports live in packages/<name>/api/<entry>.api.md. Exit code 1 on a difference.

import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { changesetRule, normalize, render, reportFileName } from './lib/api-report.ts';

const ROOT = resolve(import.meta.dirname, '..');
const PACKAGES = join(ROOT, 'packages');
const WRITE = process.argv.includes('--write');
const sinceAt = process.argv.indexOf('--changeset-since');
if (sinceAt !== -1) {
  const ref = process.argv[sinceAt + 1];
  if (ref === undefined || ref.startsWith('--')) {
    process.stdout.write('--changeset-since needs a git ref, for example origin/main.\n');
    process.exit(2);
  }
  const diff = execFileSync('git', ['diff', '--name-status', `${ref}...HEAD`], { cwd: ROOT, encoding: 'utf8' });
  const result = changesetRule(diff.split('\n').filter((l) => l !== ''));
  if (result.needed && !result.present) {
    process.stdout.write(
      `API report changed since ${ref} but no changeset was added:\n${result.reports.map((r) => `    ${r}`).join('\n')}\nFix: run pnpm changeset and commit the file in .changeset/. Standard: spec section 22.3, step 4.\n`,
    );
    process.exit(1);
  }
  process.stdout.write(
    `check:changeset ok (${result.needed ? 'API report changed, changeset present' : 'no API report changed'})\n`,
  );
  process.exit(0);
}

interface Expected {
  repoPath: string;
  abs: string;
  text: string;
}

const expected: Expected[] = [];
const stale: string[] = [];
let withoutDist = 0;
for (const dir of readdirSync(PACKAGES).toSorted()) {
  const pkgJson = join(PACKAGES, dir, 'package.json');
  if (!existsSync(pkgJson)) continue;
  const parsed: unknown = JSON.parse(readFileSync(pkgJson, 'utf8'));
  const name = typeof parsed === 'object' && parsed !== null && 'name' in parsed ? String(parsed.name) : dir;
  const dist = join(PACKAGES, dir, 'dist');
  const dtsFiles = existsSync(dist)
    ? readdirSync(dist)
        .filter((f) => f.endsWith('.d.ts'))
        .toSorted()
    : [];
  if (dtsFiles.length === 0) withoutDist++;
  const wanted = new Set<string>();
  for (const f of dtsFiles) {
    const file = reportFileName(f);
    wanted.add(file);
    const repoPath = `packages/${dir}/api/${file}`;
    const declarations = normalize(readFileSync(join(dist, f), 'utf8'));
    expected.push({ repoPath, abs: join(ROOT, repoPath), text: render({ packageName: name, repoPath, declarations }) });
  }
  const apiDir = join(PACKAGES, dir, 'api');
  if (existsSync(apiDir))
    for (const f of readdirSync(apiDir))
      if (f.endsWith('.api.md') && !wanted.has(f)) stale.push(`packages/${dir}/api/${f}`);
}

if (withoutDist > 0) {
  process.stdout.write(`${withoutDist} package(s) have no built declaration files. Fix: run pnpm build first.\n`);
  process.exit(1);
}

if (WRITE) {
  for (const e of expected) {
    mkdirSync(join(e.abs, '..'), { recursive: true });
    writeFileSync(e.abs, e.text);
  }
  process.stdout.write(
    `api:update wrote ${expected.length} report(s)${stale.length ? `; stale files to delete by hand: ${stale.join(', ')}` : ''}\n`,
  );
  process.exit(0);
}

let problems = 0;
for (const e of expected) {
  const current = existsSync(e.abs) ? readFileSync(e.abs, 'utf8') : null;
  if (current === e.text) continue;
  problems++;
  if (current === null) {
    process.stdout.write(`${e.repoPath}  missing\n`);
    continue;
  }
  const before = new Set(current.split('\n'));
  const after = new Set(e.text.split('\n'));
  const removed = current
    .split('\n')
    .filter((l) => !after.has(l))
    .slice(0, 6);
  const added = e.text
    .split('\n')
    .filter((l) => !before.has(l))
    .slice(0, 6);
  process.stdout.write(
    `${e.repoPath}  differs from the built output\n${removed.map((l) => `    - ${l}`).join('\n')}\n${added.map((l) => `    + ${l}`).join('\n')}\n`,
  );
}
for (const s of stale) {
  problems++;
  process.stdout.write(`${s}  has no matching declaration file\n`);
}
if (problems > 0) {
  process.stdout.write(
    `\n${problems} API report problem(s). Fix: run pnpm build and pnpm api:update, commit the reports, and add a changeset (pnpm changeset). Standard: spec section 22.3.\n`,
  );
  process.exit(1);
}
process.stdout.write(`check:api ok (${expected.length} reports)\n`);
