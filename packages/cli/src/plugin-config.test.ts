/**
 * BieberKit
 *
 * @file        packages/cli/src/plugin-config.test.ts
 * @description Tests of the editor of the plugins list: names are read, added and removed in each style of list, and the rest of the file is left as it was (section 5.2).
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
import { addPlugin, pluginNames, removePlugin } from './plugin-config.ts';

const wrap = (list: string): string =>
  `import { defineConfig } from '@bieberkit/core';\n// plugins: ['@x/commented']\nexport default defineConfig({\n  name: 'a',\n  plugins: ${list},\n  other: ['keep'],\n});\n`;

describe('section 5.2 the plugins list of the config', () => {
  it('5.2 reads the names, of a name and of [name, options], and not a comment or another list', () => {
    expect(pluginNames(wrap("['a', [\"b\", { depth: 2 }], 'c']"))).toEqual(['a', 'b', 'c']);
    expect(pluginNames(wrap('[]'))).toEqual([]);
    expect(pluginNames(wrap("[\n    'a',\n    ['b', { list: [1, 2] }],\n  ]"))).toEqual(['a', 'b']);
  });

  it('5.2 adds to an empty list, a one-line list and a list with a line for each plugin, in its own style', () => {
    expect(addPlugin(wrap('[]'), '@x/p')).toBe(wrap("[\n    '@x/p',\n  ]"));
    expect(addPlugin(wrap("['a', 'b']"), '@x/p')).toBe(wrap("['a', 'b', '@x/p']"));
    expect(addPlugin(wrap("[\n    'a',\n    'b',\n  ]"), '@x/p')).toBe(wrap("[\n    'a',\n    'b',\n    '@x/p',\n  ]"));
    expect(addPlugin(wrap("[\n    'a',\n    'b'\n  ]"), '@x/p')).toBe(wrap("[\n    'a',\n    'b',\n    '@x/p',\n  ]"));
  });

  it('5.2 removes an entry with its comma and its line, and a plugin with options, and leaves the rest alone', () => {
    expect(removePlugin(wrap("['a', 'b', 'c']"), 'b')).toBe(wrap("['a', 'c']"));
    expect(removePlugin(wrap("[\n    'a',\n    'b',\n  ]"), 'a')).toBe(wrap("[\n    'b',\n  ]"));
    expect(removePlugin(wrap("[\n    'a',\n    ['b', { depth: 2 }],\n    'c',\n  ]"), 'b')).toBe(
      wrap("[\n    'a',\n    'c',\n  ]"),
    );
    expect(removePlugin(wrap("['a']"), 'a')).toBe(wrap('[]'));
    expect(removePlugin(wrap("['a']"), 'ghost')).toBe(wrap("['a']"));
  });

  it('5.2 adding and then removing gives back the file', () => {
    for (const list of ['[]', "['a']", "[\n    'a',\n  ]"])
      expect(removePlugin(addPlugin(wrap(list), '@x/p'), '@x/p')).toBe(wrap(list));
  });

  it('5.2 a file with no plugins list is BK_CONFIG_UNEDITABLE, with what to do by hand', () => {
    expect(() => addPlugin('export default {};\n', 'x')).toThrow(/plugins: \[/);
    expect(() => pluginNames('const plugins = foo;')).toThrow(/plugins list/);
  });
});
