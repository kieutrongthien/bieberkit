/**
 * BieberKit
 *
 * @file        packages/tokens/src/theme.test.ts
 * @description Tests of the brand tokens: the theme that the config declares, and what it compiles to for Ant Design, CSS variables and Tailwind (TOK-01 to TOK-03, UI-06).
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
import {
  compileAntdTheme,
  contrastRatio,
  mixColors,
  cssVariables,
  DEFAULT_THEME,
  FONT_STACK,
  modeOf,
  parseTheme,
  readTheme,
  tailwindTheme,
  themeSection,
} from './index.ts';

const message = (run: () => unknown): string => {
  try {
    run();
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  }
  throw new Error('It did not throw.');
};

describe('TOK-01 the theme of the config', () => {
  it('TOK-01 an absent theme is the default, and a part of it keeps the rest of the default', () => {
    expect(parseTheme(undefined)).toEqual(DEFAULT_THEME);
    const theme = parseTheme({ colors: { primary: '#0a7' }, radius: 10 });
    expect(theme.colors.primary).toBe('#0a7');
    expect(theme.colors.danger).toBe(DEFAULT_THEME.colors.danger);
    expect(theme.radius).toBe(10);
    expect(theme.spacing).toBe(DEFAULT_THEME.spacing);
    expect(theme.darkMode).toBe('auto');
  });

  it('TOK-01 the dark palette is the default dark one, and the colors of `dark` replace it color by color', () => {
    const theme = parseTheme({ dark: { colors: { background: '#000000' } } });
    expect(theme.dark.background).toBe('#000000');
    expect(theme.dark.text).toBe(DEFAULT_THEME.dark.text);
    expect(theme.colors.background).toBe(DEFAULT_THEME.colors.background);
  });

  it('TOK-01 every problem is reported together, with the key that it is about', () => {
    const text = message(() =>
      parseTheme({ colors: { primary: 'blue', danger: '#12' }, radius: -1, spacing: 99, darkMode: 'night', nope: 1 }),
    );
    for (const key of ['colors.primary', 'colors.danger', 'radius', 'spacing', 'darkMode', 'nope'])
      expect(text).toContain(key);
  });

  it('TOK-01 a color is a hex of 3 or 6 digits, and a font is a list that names at least one family', () => {
    expect(parseTheme({ colors: { primary: '#ABCDEF' } }).colors.primary).toBe('#ABCDEF');
    expect(message(() => parseTheme({ colors: { primary: 'rgb(0,0,0)' } }))).toContain('colors.primary');
    expect(message(() => parseTheme({ fonts: { sans: '' } }))).toContain('fonts.sans');
    expect(message(() => parseTheme({ fonts: { sans: 'x; background: url(//evil)' } }))).toContain('fonts.sans');
  });

  it('TOK-01 the config section is named theme and parses with the same function', () => {
    expect(themeSection.key).toBe('theme');
    expect(themeSection.parser.parse({ radius: 4 })).toMatchObject({ radius: 4 });
  });
});

describe('TOK-03 the font stack', () => {
  it('TOK-03 covers Latin, Vietnamese and Chinese, and ends in a generic family', () => {
    const families = FONT_STACK.sans.split(',').map((family) => family.trim().replaceAll('"', ''));
    expect(families).toEqual(expect.arrayContaining(['Segoe UI', 'Roboto', 'Noto Sans']));
    expect(families).toEqual(expect.arrayContaining(['PingFang SC', 'Microsoft YaHei', 'Noto Sans CJK SC']));
    expect(families).toContain('sans-serif');
    expect(FONT_STACK.mono).toContain('monospace');
  });

  it('TOK-03 the default theme uses the stack, and a font of the config goes in front of it', () => {
    expect(DEFAULT_THEME.fonts.sans).toBe(FONT_STACK.sans);
    const theme = parseTheme({ fonts: { sans: '"Be Vietnam Pro", Inter' } });
    expect(theme.fonts.sans.startsWith('"Be Vietnam Pro", Inter, ')).toBe(true);
    expect(theme.fonts.sans.endsWith(FONT_STACK.sans)).toBe(true);
  });
});

describe('TOK-02 the compilers', () => {
  const theme = parseTheme({
    colors: { primary: '#0a7' },
    radius: 10,
    spacing: 5,
    dark: { colors: { primary: '#4ec' } },
  });

  it('TOK-02 the Ant Design theme carries the colors, the radius, the font and the unit, and the algorithm of the mode', () => {
    const light = compileAntdTheme(theme, 'light');
    expect(light).toMatchObject({
      algorithm: 'default',
      token: {
        colorPrimary: '#0a7',
        colorError: theme.colors.danger,
        borderRadius: 10,
        sizeUnit: 5,
        fontFamily: theme.fonts.sans,
        fontFamilyCode: theme.fonts.mono,
      },
    });
    const dark = compileAntdTheme(theme, 'dark');
    expect(dark).toMatchObject({
      algorithm: 'dark',
      token: { colorPrimary: '#4ec', colorBgBase: theme.dark.background },
    });
  });

  it('TOK-02 the CSS variables name every token once, with the dark ones under the attribute and the media query', () => {
    const css = cssVariables(theme);
    expect(css).toContain(':root {');
    expect(css).toContain('--bk-color-primary: #0a7;');
    expect(css).toContain('--bk-radius: 10px;');
    expect(css).toContain('--bk-spacing: 5px;');
    expect(css).toContain(`--bk-font-sans: ${theme.fonts.sans};`);
    expect(css).toContain(':root[data-theme="dark"] {');
    expect(css).toContain('--bk-color-primary: #4ec;');
    expect(css).toContain('@media (prefers-color-scheme: dark)');
    expect(css.match(/--bk-color-primary:/g)).toHaveLength(3);
  });

  it('TOK-02 a theme that is always light or always dark has no media query, and the other palette is not in the :root', () => {
    expect(cssVariables(parseTheme({ darkMode: 'light' }))).not.toContain('prefers-color-scheme');
    const dark = cssVariables(parseTheme({ darkMode: 'dark' }));
    expect(dark).not.toContain('prefers-color-scheme');
    expect(dark.split('}')[0]).toContain(`--bk-color-background: ${DEFAULT_THEME.dark.background};`);
  });

  it('TOK-02 the Tailwind theme points at the CSS variables, so both stay on brand with one configuration', () => {
    const css = tailwindTheme(theme);
    expect(css).toContain('@theme {');
    expect(css).toContain('--color-primary: var(--bk-color-primary);');
    expect(css).toContain('--radius: var(--bk-radius);');
    expect(css).toContain('--font-sans: var(--bk-font-sans);');
  });

  it('TOK-02 the same theme gives the same text, and a value cannot break out of its declaration', () => {
    expect(cssVariables(theme)).toBe(
      cssVariables(
        parseTheme({ colors: { primary: '#0a7' }, radius: 10, spacing: 5, dark: { colors: { primary: '#4ec' } } }),
      ),
    );
    expect(cssVariables(theme)).not.toMatch(/[<>]/);
  });
});

describe('UI-06 the theme in the page', () => {
  it('UI-06 a theme that the server wrote is read back as it was', () => {
    const theme = parseTheme({ colors: { primary: '#0a7' }, radius: 9, darkMode: 'dark' });
    expect(readTheme(JSON.stringify(theme))).toEqual(theme);
  });

  it('UI-06 a missing, broken or wrong theme is the default, so the admin always opens', () => {
    for (const text of [
      undefined,
      null,
      '',
      '{',
      '[]',
      '{"radius":3}',
      JSON.stringify({ ...DEFAULT_THEME, radius: 'big' }),
    ])
      expect(readTheme(text)).toEqual(DEFAULT_THEME);
    const badColor = { ...DEFAULT_THEME, colors: { ...DEFAULT_THEME.colors, primary: 'red' } };
    expect(readTheme(JSON.stringify(badColor))).toEqual(DEFAULT_THEME);
  });

  it('UI-06 the mode follows the system for auto, and is fixed otherwise', () => {
    expect(modeOf(parseTheme({}), true)).toBe('dark');
    expect(modeOf(parseTheme({}), false)).toBe('light');
    expect(modeOf(parseTheme({ darkMode: 'light' }), true)).toBe('light');
    expect(modeOf(parseTheme({ darkMode: 'dark' }), false)).toBe('dark');
  });
});

describe('UI-07 the default theme meets level AA', () => {
  it('UI-07 the contrast ratio is the one of WCAG: white on black is 21, a color on itself is 1', () => {
    expect(contrastRatio('#ffffff', '#000000')).toBeCloseTo(21, 5);
    expect(contrastRatio('#777', '#777')).toBe(1);
    expect(contrastRatio('#fff', '#000')).toBeCloseTo(21, 5);
  });

  it('UI-07 the colors of the default theme read on the background of the light palette, and white reads on each of them', () => {
    const { colors } = DEFAULT_THEME;
    for (const key of ['primary', 'success', 'warning', 'danger', 'info', 'text'] as const) {
      expect(contrastRatio(colors[key], colors.background), `${key} on the background`).toBeGreaterThanOrEqual(4.5);
    }
    for (const key of ['primary', 'success', 'warning', 'danger', 'info'] as const) {
      expect(contrastRatio('#ffffff', colors[key]), `white on ${key}`).toBeGreaterThanOrEqual(4.5);
    }
  });

  it('UI-07 a mix is the weight of the first color and the rest of the second', () => {
    expect(mixColors('#000000', '#ffffff', 0.5)).toBe('#808080');
    expect(mixColors('#fff', '#000', 1)).toBe('#ffffff');
    expect(mixColors('#fff', '#000', 0)).toBe('#000000');
  });

  it('UI-07 the placeholder and the description that Ant Design draws read on the background, in both palettes', () => {
    for (const mode of ['light', 'dark'] as const) {
      const token = compileAntdTheme(DEFAULT_THEME, mode).token;
      const background = mode === 'dark' ? DEFAULT_THEME.dark.background : DEFAULT_THEME.colors.background;
      for (const key of ['colorTextPlaceholder', 'colorTextDescription', 'colorTextTertiary', 'colorTextSecondary']) {
        expect(contrastRatio(String(token[key]), background), `${key} in ${mode}`).toBeGreaterThanOrEqual(4.5);
      }
    }
  });

  it('UI-07 the dark palette reads on its own background, and the text of a button on its fill', () => {
    const { dark } = DEFAULT_THEME;
    for (const key of ['primary', 'success', 'warning', 'danger', 'info', 'text'] as const) {
      expect(contrastRatio(dark[key], dark.background), `${key} on the dark background`).toBeGreaterThanOrEqual(4.5);
    }
    for (const key of ['primary', 'success', 'warning', 'danger', 'info'] as const) {
      expect(contrastRatio('#141414', dark[key]), `dark text on ${key}`).toBeGreaterThanOrEqual(4.5);
    }
  });
});
