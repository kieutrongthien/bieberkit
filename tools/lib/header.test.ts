/**
 * BieberKit
 *
 * @file        tools/lib/header.test.ts
 * @description Tests for header rendering, parsing and file classification.
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

import { describe, expect, it } from 'vitest';
import { type CommentStyle, extractFields, kindOf, parseHeader, renderHeader, splitPreamble } from './header.ts';

const fields = { file: 'packages/core/src/kernel.ts', description: 'Boots the kernel.', year: 2026, extraTags: [] };

describe('file headers (spec section 23)', () => {
  const styles: CommentStyle[] = ['block', 'hash', 'html', 'sql'];

  for (const style of styles) {
    it(`HDR-02 renders and parses back the ${style} style`, () => {
      const parsed = parseHeader(`${renderHeader(style, fields)}\n\ncontent\n`, style);
      expect(parsed).not.toBeNull();
      const found = extractFields(parsed?.lines ?? []);
      expect(found.file).toBe(fields.file);
      expect(found.description).toBe(fields.description);
      expect(found.year).toBe(2026);
    });
  }

  it('HDR-01 keeps a shebang before the header', () => {
    const split = splitPreamble('#!/usr/bin/env node\nrest', 'block', 'packages/cli/src/bin.ts');
    expect(split.preamble).toBe('#!/usr/bin/env node\n');
    expect(split.body).toBe('rest');
  });

  it('HDR-01 keeps Markdown frontmatter before the header', () => {
    const split = splitPreamble('---\nname: x\n---\nrest', 'html', '.agents/skills/x/SKILL.md');
    expect(split.preamble).toBe('---\nname: x\n---\n');
  });

  it('HDR-01 allows blank lines between Markdown frontmatter and the header', () => {
    const text = `---\nname: x\n---\n\n\n${renderHeader('html', fields)}\n\ncontent\n`;
    const split = splitPreamble(text, 'html', '.agents/skills/x/SKILL.md');
    expect(split.preamble).toBe('---\nname: x\n---\n\n\n');
    expect(parseHeader(split.body, 'html')).not.toBeNull();
  });

  it('HDR-01 still finds no header when frontmatter is followed by other content', () => {
    const text = '---\nname: x\n---\n\n# Title\n';
    const split = splitPreamble(text, 'html', '.agents/skills/x/SKILL.md');
    expect(parseHeader(split.body, 'html')).toBeNull();
  });

  it('classifies exempt and unknown files', () => {
    expect(kindOf('package.json')).toBe('exempt');
    expect(kindOf('LICENSE')).toBe('exempt');
    expect(kindOf('.githooks/pre-commit')).toBe('hash');
    expect(kindOf('.git-blame-ignore-revs')).toBe('hash');
    expect(kindOf('notes.txt')).toBe('unknown');
  });
});
