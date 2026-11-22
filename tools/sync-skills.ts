/**
 * BieberKit
 *
 * @file        tools/sync-skills.ts
 * @description Mirrors .agents/skills into .claude/skills and checks the mirror.
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

// Mirrors agent skills from .agents/skills (Codex, Gemini CLI, Cursor and others) into
// .claude/skills (Claude Code). .agents/skills is the source. Only the @file line differs.
//
// Usage:
//   node tools/sync-skills.ts           write the mirror
//   node tools/sync-skills.ts --check   fail if the mirror is out of date (CI, pre-commit)

import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';

const ROOT = resolve(import.meta.dirname, '..');
const SOURCE = '.agents/skills';
const TARGET = '.claude/skills';
const CHECK = process.argv.includes('--check');

function list(dir: string, prefix = ''): string[] {
  const abs = join(ROOT, dir, prefix);
  if (!existsSync(abs)) return [];
  return readdirSync(abs, { withFileTypes: true }).flatMap((entry) => {
    const relPath = prefix === '' ? entry.name : `${prefix}/${entry.name}`;
    return entry.isDirectory() ? list(dir, relPath) : [relPath];
  });
}

function mirrored(text: string): string {
  return text.replace(`@file        ${SOURCE}/`, `@file        ${TARGET}/`);
}

function main(): void {
  const sourceFiles = list(SOURCE);
  const targetFiles = new Set(list(TARGET));
  const problems: string[] = [];

  for (const file of sourceFiles) {
    const want = mirrored(readFileSync(join(ROOT, SOURCE, file), 'utf8'));
    const targetPath = join(ROOT, TARGET, file);
    const have = existsSync(targetPath) ? readFileSync(targetPath, 'utf8') : null;
    targetFiles.delete(file);
    if (have === want) continue;
    if (CHECK) {
      problems.push(`${TARGET}/${file} differs from ${SOURCE}/${file}`);
    } else {
      mkdirSync(dirname(targetPath), { recursive: true });
      writeFileSync(targetPath, want);
    }
  }
  for (const extra of targetFiles) {
    if (CHECK) problems.push(`${TARGET}/${extra} has no source in ${SOURCE}`);
    else rmSync(join(ROOT, TARGET, extra));
  }

  if (problems.length > 0) {
    for (const p of problems) process.stderr.write(`SKL001  ${p}\n`);
    process.stderr.write('    Fix: edit .agents/skills only, then run pnpm sync:skills.\n');
    process.exitCode = 1;
    return;
  }
  process.stdout.write(
    CHECK ? `check:skills ok (${sourceFiles.length} files)\n` : `synced ${sourceFiles.length} skill files\n`,
  );
}

main();
