/**
 * BieberKit
 *
 * @file        packages/cli/src/check/code.test.ts
 * @description Tests of the reader of source text: comments and strings are hidden, templates keep their code, and offsets and lines do not move (section 5.2).
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
import { closingParen, lineAt, maskCode } from './code.ts';
import { importsOf } from './imports.ts';

describe('section 5.2 reading code without a parser', () => {
  it('5.2 hides comments and strings, and keeps every offset and line where it was', () => {
    const source = 'const a = \'process.env\'; // process.env\n/* process.env\n */ const b = "x";\nprocess.env;';
    const masked = maskCode(source);
    expect(masked).toHaveLength(source.length);
    expect(masked.split('\n')).toHaveLength(source.split('\n').length);
    expect(masked.match(/process\.env/g)).toHaveLength(1);
    expect(masked.indexOf('process.env')).toBe(source.lastIndexOf('process.env'));
  });

  it('5.2 keeps strings when asked, and still hides comments', () => {
    const masked = maskCode("fetch('http://x') // fetch('y')", { keepStrings: true });
    expect(masked).toContain("'http://x'");
    expect(masked).not.toContain("'y'");
  });

  it('5.2 the text of a template is hidden and the code inside ${ } is kept, also with braces and nested templates', () => {
    const masked = maskCode('const s = `text fetch( ${ call({ a: `inner ${ deep() } text` }) } more fetch(`; after();');
    expect(masked).not.toContain('text fetch(');
    expect(masked).toContain('call(');
    expect(masked).toContain('deep()');
    expect(masked).toContain('after()');
  });

  it('5.2 an escaped quote does not end a string, and a regex-like slash is not a comment start', () => {
    const masked = maskCode("const a = 'it\\'s fetch('; const b = 4 / 2; fetch();");
    expect(masked.match(/fetch\(/g)).toHaveLength(1);
  });

  it('5.2 finds the line of an offset and the end of a call', () => {
    const source = 'a\nb\nrun(x, (y) => z(y))\nc';
    expect(lineAt(source, source.indexOf('run'))).toBe(3);
    const open = source.indexOf('(');
    expect(source.slice(open, closingParen(source, open) + 1)).toBe('(x, (y) => z(y))');
    expect(closingParen('(((', 0)).toBe(-1);
  });
});

describe('section 5.2 reading imports', () => {
  it('5.2 finds import, export from, dynamic import and require, and not the ones in comments or strings', () => {
    const source = [
      "import a from 'one';",
      "import type { B } from 'two';",
      "import * as c from 'three';",
      "import 'four';",
      "export { d } from 'five';",
      "export * from 'six';",
      "const e = await import('seven');",
      "const f = require('eight');",
      "// import x from 'nope';",
      'const s = "import y from \'nope\'";',
    ].join('\n');
    expect(importsOf(source).map((entry) => entry.specifier)).toEqual([
      'one',
      'two',
      'three',
      'four',
      'five',
      'six',
      'seven',
      'eight',
    ]);
    expect(importsOf(source)[2]?.line).toBe(3);
  });
});
