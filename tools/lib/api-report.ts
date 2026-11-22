/**
 * BieberKit
 *
 * @file        tools/lib/api-report.ts
 * @description Normalizes built declaration files and renders the committed API report of a package.
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

// The API report is the public surface of a package: its built .d.ts text without comments, blank
// lines or import order. Used by tools/api-report.ts. Erasable TypeScript only, so Node.js runs this file directly.

import { renderHeader } from './header.ts';

type State = 'code' | 'string' | 'block' | 'line';

/** Removes comments (outside string literals), so a documentation change is not an API change. */
function stripComments(text: string): string {
  let out = '';
  let state: State = 'code';
  let quote = '';
  for (let i = 0; i < text.length; i++) {
    const c = text[i] ?? '';
    const next = text[i + 1] ?? '';
    if (state === 'code') {
      if (c === '"' || c === "'" || c === '`') {
        state = 'string';
        quote = c;
        out += c;
      } else if (c === '/' && next === '*') {
        state = 'block';
        i++;
      } else if (c === '/' && next === '/') {
        state = 'line';
        i++;
      } else {
        out += c;
      }
    } else if (state === 'string') {
      out += c;
      if (c === '\\') {
        out += next;
        i++;
      } else if (c === quote) {
        state = 'code';
      }
    } else if (state === 'block') {
      if (c === '*' && next === '/') {
        state = 'code';
        i++;
      }
    } else if (c === '\n') {
      state = 'code';
      out += c;
    }
  }
  return out;
}

const isSingleLineImport = (line: string): boolean => line.startsWith('import ') && line.endsWith(';');

/** The text that goes into the report. Same surface in, same text out. */
export function normalize(dts: string): string {
  const lines = stripComments(dts)
    .split('\n')
    .map((l) => l.trimEnd())
    .filter((l) => l.trim() !== '');
  const out: string[] = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i] ?? '';
    if (isSingleLineImport(line)) {
      const run: string[] = [];
      while (i < lines.length && isSingleLineImport(lines[i] ?? '')) {
        run.push(lines[i] ?? '');
        i++;
      }
      out.push(...run.toSorted());
    } else {
      out.push(line);
      i++;
    }
  }
  return out.length === 0 ? '' : `${out.join('\n')}\n`;
}

/**
 * `index.d.ts` becomes `index.api.md`. A shared chunk that the bundler named with a content hash, such as
 * `define-entity-fSi6hSbi.d.ts`, loses the hash, so its report keeps its name when the code changes.
 */
export function reportFileName(dtsFile: string): string {
  const name = dtsFile.replace(/\.d\.ts$/, '').replace(/-(?=[\w-]{0,7}[A-Z0-9])[\w-]{8}$/, '');
  return `${name}.api.md`;
}

export interface RenderInput {
  packageName: string;
  /** Repo-relative path of the report file, for the header. */
  repoPath: string;
  /** Output of `normalize`. */
  declarations: string;
}

/** The whole committed file: header, a short note, and the declarations in a code block. */
export function render(input: RenderInput): string {
  const header = renderHeader('html', {
    file: input.repoPath,
    description: `API report of ${input.packageName}: its public surface, checked in CI and reviewed in pull requests.`,
    year: 2026,
    extraTags: ['@generated   pnpm api:update'],
  });
  return `${header}\n\n# API report: ${input.packageName}\n\nGenerated from the built declaration files by \`pnpm api:update\`. Do not edit by hand. A change here is a change to the public API and needs a changeset (spec section 22.3).\n\n\`\`\`ts\n${input.declarations}\`\`\`\n`;
}

export interface ChangesetRuleResult {
  /** An existing API report was modified or deleted. */
  needed: boolean;
  /** The change adds or edits a changeset file. */
  present: boolean;
  reports: string[];
}

const REPORT = /^packages\/[^/]+\/api\/[^/]+\.api\.md$/;
const CHANGESET = /^\.changeset\/(?!README\.md$)[^/]+\.md$/;

/**
 * Spec 22.3, step 4: a change to an existing API report needs a changeset. `changeset status` ignores private
 * packages, so this reads `git diff --name-status` itself. A report that is only added is a package's first one and needs none.
 */
export function changesetRule(nameStatusLines: readonly string[]): ChangesetRuleResult {
  const reports: string[] = [];
  let present = false;
  for (const line of nameStatusLines) {
    const parts = line.split('\t');
    const status = parts[0] ?? '';
    const path = parts[parts.length - 1] ?? '';
    if (REPORT.test(path) && (status.startsWith('M') || status.startsWith('D') || status.startsWith('R')))
      reports.push(path);
    if (CHANGESET.test(path) && !status.startsWith('D')) present = true;
  }
  return { needed: reports.length > 0, present, reports };
}
