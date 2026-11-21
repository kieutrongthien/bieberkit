/**
 * BieberKit
 *
 * @file        tools/lib/header.ts
 * @description Renders, parses and classifies the mandatory file header.
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

// Renders, parses and classifies the mandatory file header (spec section 23).
// Used by tools/check-headers.ts and tools/sync-skills.ts. Erasable TypeScript only,
// so Node.js runs this file directly.

import { basename, extname } from 'node:path';

export type CommentStyle = 'block' | 'hash' | 'html' | 'sql';
export type FileKind = CommentStyle | 'exempt' | 'unknown';

export const PRIMARY_AUTHOR = 'Bieber Kieu <kieutrongthien@gmail.com>';
export const SPDX_LINE = 'SPDX-License-Identifier: Apache-2.0';
export const DOCS_LINK = 'docs/spec/SPEC.md#23-licensing-and-mandatory-file-headers';

export const LICENSE_LINES: readonly string[] = [
  'Licensed under the Apache License, Version 2.0 (the "License");',
  'you may not use this file except in compliance with the License.',
  'You may obtain a copy of the License at',
  '',
  '    http://www.apache.org/licenses/LICENSE-2.0',
  '',
  'Unless required by applicable law or agreed to in writing, software',
  'distributed under the License is distributed on an "AS IS" BASIS,',
  'WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.',
  'See the License for the specific language governing permissions and',
  'limitations under the License.',
];

export interface HeaderFields {
  file: string;
  description: string;
  year: number;
  /** Extra tag lines between the primary author and the copyright, e.g. `@author ...`, `@generated ...`. */
  extraTags: readonly string[];
}

const BLOCK_EXT = new Set(['.ts', '.tsx', '.mts', '.cts', '.js', '.jsx', '.mjs', '.cjs', '.css']);
const HASH_EXT = new Set(['.yaml', '.yml', '.toml', '.sh']);
const HASH_NAMES = new Set([
  'Dockerfile',
  'CODEOWNERS',
  '.gitignore',
  '.gitattributes',
  '.dockerignore',
  '.editorconfig',
  '.npmrc',
  '.env.example',
]);
const HTML_EXT = new Set(['.md', '.mdx', '.html']);
const SQL_EXT = new Set(['.sql']);
const EXEMPT_NAMES = new Set(['LICENSE', 'NOTICE', 'pnpm-lock.yaml', '.node-version']);
const EXEMPT_EXT = new Set([
  '.json',
  '.jsonc',
  '.json5',
  '.lock',
  '.snap',
  '.svg',
  '.png',
  '.jpg',
  '.jpeg',
  '.gif',
  '.webp',
  '.avif',
  '.ico',
  '.woff',
  '.woff2',
  '.ttf',
  '.otf',
  '.pdf',
  '.zip',
  '.gz',
  '.tgz',
]);

/** Decides which comment style a repository file uses, from its repo-relative path. */
export function kindOf(relPath: string): FileKind {
  const name = basename(relPath);
  const ext = extname(name);
  if (EXEMPT_NAMES.has(name) || EXEMPT_EXT.has(ext)) return 'exempt';
  if (relPath.startsWith('.githooks/')) return 'hash';
  if (name === 'Dockerfile' || name.endsWith('.Dockerfile')) return 'hash';
  if (HASH_NAMES.has(name) || HASH_EXT.has(ext)) return 'hash';
  if (BLOCK_EXT.has(ext)) return 'block';
  if (HTML_EXT.has(ext)) return 'html';
  if (SQL_EXT.has(ext)) return 'sql';
  return 'unknown';
}

/** The header content lines, without comment markers. */
export function headerLines(fields: HeaderFields): string[] {
  return [
    'BieberKit',
    '',
    `@file        ${fields.file}`,
    `@description ${fields.description}`.trimEnd(),
    `@author      ${PRIMARY_AUTHOR}`,
    ...fields.extraTags,
    `@copyright   Copyright (c) ${fields.year} Bieber Kieu`,
    '@license     Apache-2.0',
    '',
    ...LICENSE_LINES,
    '',
    SPDX_LINE,
  ];
}

/** Renders the full header comment for a style, without a trailing newline. */
export function renderHeader(style: CommentStyle, fields: HeaderFields): string {
  const lines = headerLines(fields);
  switch (style) {
    case 'block':
      return ['/**', ...lines.map((l) => (l === '' ? ' *' : ` * ${l}`)), ' */'].join('\n');
    case 'hash':
      return lines.map((l) => (l === '' ? '#' : `# ${l}`)).join('\n');
    case 'sql':
      return lines.map((l) => (l === '' ? '--' : `-- ${l}`)).join('\n');
    case 'html':
      return ['<!--', ...lines.map((l) => (l === '' ? '' : `  ${l}`)), '-->'].join('\n');
  }
}

export interface SplitFile {
  /** Text that must stay before the header: shebang, Dockerfile syntax line, Markdown frontmatter. */
  preamble: string;
  body: string;
}

/** Separates the lines that HDR-01 allows before the header. */
export function splitPreamble(text: string, style: CommentStyle, relPath: string): SplitFile {
  if (text.startsWith('#!')) {
    const end = text.indexOf('\n');
    return end === -1
      ? { preamble: `${text}\n`, body: '' }
      : { preamble: text.slice(0, end + 1), body: text.slice(end + 1) };
  }
  if (style === 'hash' && basename(relPath).includes('Dockerfile') && /^# ?syntax=/.test(text)) {
    const end = text.indexOf('\n');
    return { preamble: text.slice(0, end + 1), body: text.slice(end + 1) };
  }
  if (style === 'html' && text.startsWith('---\n')) {
    const close = text.indexOf('\n---\n', 3);
    if (close !== -1) {
      return { preamble: text.slice(0, close + 5), body: text.slice(close + 5) };
    }
  }
  return { preamble: '', body: text };
}

export interface ParsedHeader {
  lines: string[];
  /** Index in `body` just after the header comment (before the following newline). */
  end: number;
}

/** Reads the header comment at the start of `body`. Returns null when the body does not start with one. */
export function parseHeader(body: string, style: CommentStyle): ParsedHeader | null {
  if (style === 'block') {
    if (!body.startsWith('/**')) return null;
    const close = body.indexOf('*/');
    if (close === -1) return null;
    const inner = body.slice(3, close).split('\n').slice(1, -1);
    return { lines: inner.map((l) => l.replace(/^ \*( |$)/, '')), end: close + 2 };
  }
  if (style === 'html') {
    if (!body.startsWith('<!--')) return null;
    const close = body.indexOf('-->');
    if (close === -1) return null;
    const inner = body.slice(4, close).split('\n').slice(1, -1);
    return { lines: inner.map((l) => l.replace(/^ {2}/, '')), end: close + 3 };
  }
  const marker = style === 'hash' ? '#' : '--';
  const prefix = new RegExp(`^${marker === '#' ? '#' : '--'}( |$)`);
  if (!body.startsWith(marker)) return null;
  const lines: string[] = [];
  let offset = 0;
  for (const raw of body.split('\n')) {
    if (!prefix.test(raw)) break;
    lines.push(raw.replace(prefix, ''));
    offset += raw.length + 1;
    if (raw.includes(SPDX_LINE)) return { lines, end: offset - 1 };
  }
  return lines.includes('BieberKit') ? { lines, end: Math.max(0, offset - 1) } : null;
}

/** Pulls the variable fields out of parsed header lines. Missing fields come back empty. */
export function extractFields(lines: readonly string[]): {
  file: string;
  description: string;
  year: number | null;
  primaryAuthor: string;
  extraTags: string[];
} {
  let file = '';
  let description = '';
  let year: number | null = null;
  let primaryAuthor = '';
  const extraTags: string[] = [];
  for (const line of lines) {
    const tag = /^@([a-z-]+)\s*(.*)$/.exec(line);
    if (!tag) continue;
    const [, key = '', value = ''] = tag;
    if (key === 'file') file = value.trim();
    else if (key === 'description') description = value.trim();
    else if (key === 'copyright') {
      const m = /Copyright \(c\) (\d{4}) Bieber Kieu/.exec(value);
      year = m?.[1] ? Number(m[1]) : null;
    } else if (key === 'author' && primaryAuthor === '') primaryAuthor = value.trim();
    else if (key === 'author' || key === 'generated' || key === 'modified-by') extraTags.push(line);
  }
  return { file, description, year, primaryAuthor, extraTags };
}
