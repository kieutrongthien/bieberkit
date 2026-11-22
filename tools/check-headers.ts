/**
 * BieberKit
 *
 * @file        tools/check-headers.ts
 * @description Checks and fixes the mandatory file headers (HDR-01 to HDR-05).
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

// Checks and fixes the mandatory file headers (spec section 23, HDR-01 to HDR-05).
//
// Usage:
//   node tools/check-headers.ts                 check every tracked and untracked, non-ignored file
//   node tools/check-headers.ts --staged        check files staged for commit (pre-commit hook)
//   node tools/check-headers.ts --fix           insert missing headers and repair layout and paths
//   node tools/check-headers.ts --json          machine-readable output (AI-03)
//   node tools/check-headers.ts --claude-hook   read a Claude Code PostToolUse payload from stdin
//   node tools/check-headers.ts <files...>      check only these files

import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { isAbsolute, join, relative, resolve, sep } from 'node:path';
import {
  DOCS_LINK,
  PRIMARY_AUTHOR,
  extractFields,
  headerLines,
  kindOf,
  parseHeader,
  renderHeader,
  splitPreamble,
} from './lib/header.ts';

interface Violation {
  file: string;
  code: string;
  message: string;
  fix: string;
  fixable: boolean;
}

const ROOT = resolve(import.meta.dirname, '..');
const SKIP_DIRS = new Set(['node_modules', 'dist', '.git', '.turbo', 'coverage', '.bieberkit', 'build', '.codegraph']);
const args = process.argv.slice(2);
const flags = new Set(args.filter((a) => a.startsWith('--')));
const fileArgs = args.filter((a) => !a.startsWith('--'));
const FIX = flags.has('--fix');
const JSON_OUT = flags.has('--json');
const CURRENT_YEAR = new Date().getFullYear();

function toRel(p: string): string {
  const abs = isAbsolute(p) ? p : resolve(process.cwd(), p);
  return relative(ROOT, abs).split(sep).join('/');
}

function gitFiles(extra: readonly string[]): string[] | null {
  try {
    const out = execFileSync('git', ['ls-files', '-z', ...extra], {
      cwd: ROOT,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    });
    return out.split('\0').filter(Boolean);
  } catch {
    return null;
  }
}

function walk(dir: string, acc: string[] = []): string[] {
  for (const entry of readdirSync(join(ROOT, dir), { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (!SKIP_DIRS.has(entry.name)) walk(dir === '' ? entry.name : `${dir}/${entry.name}`, acc);
    } else if (entry.isFile()) {
      acc.push(dir === '' ? entry.name : `${dir}/${entry.name}`);
    }
  }
  return acc;
}

function listFiles(): string[] {
  if (fileArgs.length > 0) return fileArgs.map(toRel);
  if (flags.has('--staged')) {
    try {
      const out = execFileSync('git', ['diff', '--cached', '--name-only', '-z', '--diff-filter=ACMR'], {
        cwd: ROOT,
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'ignore'],
      });
      return out.split('\0').filter(Boolean);
    } catch {
      return [];
    }
  }
  const tracked = gitFiles(['--cached', '--others', '--exclude-standard']);
  return tracked ?? walk('');
}

function checkFile(rel: string): Violation[] {
  const abs = join(ROOT, rel);
  if (!existsSync(abs) || !statSync(abs).isFile()) return [];
  const kind = kindOf(rel);
  if (kind === 'exempt') return [];
  if (kind === 'unknown') {
    return [
      {
        file: rel,
        code: 'HDR006',
        message: 'No header rule for this file type.',
        fix: 'Add the extension or name to kindOf() in tools/lib/header.ts, or rename the file.',
        fixable: false,
      },
    ];
  }
  const text = readFileSync(abs, 'utf8');
  const { preamble, body } = splitPreamble(text, kind, rel);
  const parsed = parseHeader(body, kind);

  if (!parsed) {
    if (FIX) {
      const header = renderHeader(kind, { file: rel, description: '', year: CURRENT_YEAR, extraTags: [] });
      const rest = body.replace(/^\n+/, '');
      writeFileSync(abs, `${preamble}${header}\n${rest === '' ? '' : `\n${rest}`}`);
      return [describeEmpty(rel)];
    }
    return [
      {
        file: rel,
        code: 'HDR001',
        message: 'Missing file header.',
        fix: 'Run pnpm check:headers --fix, then write the @description.',
        fixable: true,
      },
    ];
  }

  const found = extractFields(parsed.lines);
  const violations: Violation[] = [];
  if (found.file !== rel) {
    violations.push({
      file: rel,
      code: 'HDR002',
      message: `@file is "${found.file}" but the file lives at "${rel}".`,
      fix: `Set @file to ${rel} (pnpm check:headers --fix does this).`,
      fixable: true,
    });
  }
  if (found.primaryAuthor !== PRIMARY_AUTHOR) {
    violations.push({
      file: rel,
      code: 'HDR004',
      message: 'The first @author line must be Bieber Kieu.',
      fix: `Make the first @author line "${PRIMARY_AUTHOR}" (pnpm check:headers --fix does this).`,
      fixable: true,
    });
  }
  const fields = {
    file: rel,
    description: found.description,
    year: found.year ?? CURRENT_YEAR,
    extraTags: found.extraTags,
  };
  const canonical = headerLines(fields);
  const afterHeader = body.slice(parsed.end);
  const layoutOk =
    canonical.length === parsed.lines.length &&
    canonical.every((line, i) => line === parsed.lines[i]?.trimEnd()) &&
    found.year !== null &&
    (afterHeader === '\n' || afterHeader === '' || afterHeader.startsWith('\n\n'));
  if (!layoutOk && violations.length === 0) {
    violations.push({
      file: rel,
      code: 'HDR005',
      message: 'Header layout differs from spec section 23 (field order, spacing, license text or year).',
      fix: 'Run pnpm check:headers --fix to rewrite it in the standard layout.',
      fixable: true,
    });
  }

  if (FIX && violations.some((v) => v.fixable)) {
    const header = renderHeader(kind, fields);
    const rest = afterHeader.replace(/^\n+/, '');
    writeFileSync(abs, `${preamble}${header}\n${rest === '' ? '' : `\n${rest}`}`);
    violations.length = 0;
  }
  if (found.description === '' || /^TODO\b/i.test(found.description)) {
    violations.push(describeEmpty(rel));
  }
  return violations;
}

function describeEmpty(rel: string): Violation {
  return {
    file: rel,
    code: 'HDR003',
    message: '@description is empty.',
    fix: 'Write one sentence that says what this file does.',
    fixable: false,
  };
}

function readStdin(): string {
  try {
    return readFileSync(0, 'utf8');
  } catch {
    return '';
  }
}

function claudeHook(): void {
  // Claude Code PostToolUse: exit 2 sends stderr back to the agent so it fixes the header itself.
  let filePath = '';
  try {
    const payload = JSON.parse(readStdin()) as { tool_input?: { file_path?: unknown } };
    filePath = typeof payload.tool_input?.file_path === 'string' ? payload.tool_input.file_path : '';
  } catch {
    return;
  }
  if (filePath === '') return;
  const rel = toRel(filePath);
  if (rel.startsWith('..') || rel.split('/').some((part) => SKIP_DIRS.has(part))) return;
  const violations = checkFile(rel);
  if (violations.length === 0) return;
  for (const v of violations) process.stderr.write(`${v.file} ${v.code} ${v.message} Fix: ${v.fix}\n`);
  process.stderr.write(`Header standard: ${DOCS_LINK}\n`);
  process.exit(2);
}

function main(): void {
  if (flags.has('--claude-hook')) {
    claudeHook();
    return;
  }
  const files = listFiles().filter((f) => !f.split('/').some((part) => SKIP_DIRS.has(part)));
  const violations = files.flatMap(checkFile);
  if (JSON_OUT) {
    process.stdout.write(
      `${JSON.stringify({ ok: violations.length === 0, checked: files.length, violations, docs: DOCS_LINK }, null, 2)}\n`,
    );
  } else if (violations.length === 0) {
    process.stdout.write(`check:headers ok (${files.length} files)\n`);
  } else {
    for (const v of violations) process.stderr.write(`${v.file}  ${v.code}  ${v.message}\n    Fix: ${v.fix}\n`);
    process.stderr.write(`\n${violations.length} header problem(s). Standard: ${DOCS_LINK}\n`);
  }
  if (violations.length > 0) process.exitCode = 1;
}

main();
