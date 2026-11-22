/**
 * BieberKit
 *
 * @file        packages/core/src/config/env-file.test.ts
 * @description Tests for .env parsing and precedence (CFG-03, CFG-04).
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

import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { parseEnvFile, readEnvFile, withEnvFile } from './env-file.ts';

const dirs: string[] = [];
afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

function tempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), 'bk-env-'));
  dirs.push(dir);
  return dir;
}

describe('CFG-03 .env file', () => {
  it('CFG-03 parses KEY=value lines, quotes and comments', () => {
    const values = parseEnvFile('A=1\n# comment\nB="two words"\nC=\n');
    expect(values).toEqual({ A: '1', B: 'two words', C: '' });
  });

  it('CFG-03 real environment variables win over the file', () => {
    const merged = withEnvFile({ PORT: '9000' }, { PORT: '3000', NAME: 'from-file' });
    expect(merged['PORT']).toBe('9000');
    expect(merged['NAME']).toBe('from-file');
  });

  it('CFG-03 a real variable that is set, even to an empty string, wins over the file', () => {
    expect(withEnvFile({ PORT: '' }, { PORT: '3000' })['PORT']).toBe('');
    expect(withEnvFile({}, { PORT: '3000' })['PORT']).toBe('3000');
  });

  it('CFG-03 does not change the real source', () => {
    const real = { A: '1' };
    withEnvFile(real, { B: '2' });
    expect(real).toEqual({ A: '1' });
  });
});

describe('CFG-04 missing .env', () => {
  it('CFG-04 a missing file is not an error', () => {
    expect(readEnvFile(join(tempDir(), '.env'))).toEqual({});
  });

  it('CFG-04 reads an existing file', () => {
    const file = join(tempDir(), '.env');
    writeFileSync(file, 'KEY=value\n');
    expect(readEnvFile(file)).toEqual({ KEY: 'value' });
  });

  it('CFG-04 a file that exists but cannot be read is an error with the path', () => {
    expect(() => readEnvFile(tempDir())).toThrowError(expect.objectContaining({ code: 'CFG_ENV_FILE' }));
  });
});
