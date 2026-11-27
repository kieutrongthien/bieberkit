/**
 * BieberKit
 *
 * @file        packages/tokens/src/compile.ts
 * @description Compiles the theme into what each surface reads: an Ant Design theme for the admin, CSS variables and a Tailwind theme for the site (TOK-02).
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

import { COLOR_KEYS } from './theme.ts';
import type { Theme, ThemeColors } from './theme.ts';

/** The tokens of an Ant Design `ConfigProvider` theme. The adapter turns `algorithm` into the algorithm of the library. */
export interface AntdTheme {
  readonly algorithm: 'default' | 'dark';
  readonly token: Readonly<Record<string, string | number>>;
}

export function compileAntdTheme(theme: Theme, mode: 'light' | 'dark'): AntdTheme {
  const colors = mode === 'dark' ? theme.dark : theme.colors;
  return {
    algorithm: mode === 'dark' ? 'dark' : 'default',
    token: {
      colorPrimary: colors.primary,
      colorSuccess: colors.success,
      colorWarning: colors.warning,
      colorError: colors.danger,
      colorInfo: colors.info,
      colorBgBase: colors.background,
      colorBgLayout: colors.surface,
      colorTextBase: colors.text,
      colorBorder: colors.border,
      borderRadius: theme.radius,
      sizeUnit: theme.spacing,
      fontFamily: theme.fonts.sans,
      fontFamilyCode: theme.fonts.mono,
    },
  };
}

const colorLines = (colors: ThemeColors, indent: string): string[] =>
  COLOR_KEYS.map((key) => `${indent}--bk-color-${key}: ${colors[key]};`);

const block = (selector: string, lines: readonly string[]): string => `${selector} {\n${lines.join('\n')}\n}`;

/**
 * The CSS variables of the theme. The `:root` has the palette of the mode, and for `auto` the dark palette follows `data-theme="dark"`
 * and the system setting unless `data-theme="light"` says otherwise.
 */
export function cssVariables(theme: Theme): string {
  const shared = [
    `  --bk-radius: ${theme.radius}px;`,
    `  --bk-spacing: ${theme.spacing}px;`,
    `  --bk-font-sans: ${theme.fonts.sans};`,
    `  --bk-font-mono: ${theme.fonts.mono};`,
  ];
  const palette = theme.darkMode === 'dark' ? theme.dark : theme.colors;
  const parts = [block(':root', [...colorLines(palette, '  '), ...shared])];
  if (theme.darkMode === 'auto') {
    parts.push(block(':root[data-theme="dark"]', colorLines(theme.dark, '  ')));
    parts.push(
      `@media (prefers-color-scheme: dark) {\n${block('  :root:not([data-theme="light"])', colorLines(theme.dark, '    '))}\n}`,
    );
  }
  return `${parts.join('\n')}\n`;
}

/** A Tailwind theme that points at the CSS variables, so the site and the admin change together (TOK-02). */
// The theme is a parameter so that a later token that is not a variable of the CSS can be written here; today every value is a variable.
export function tailwindTheme(_theme: Theme): string {
  const colors = COLOR_KEYS.map((key) => `  --color-${key}: var(--bk-color-${key});`);
  return `${[
    '@theme {',
    ...colors,
    '  --radius: var(--bk-radius);',
    '  --spacing: var(--bk-spacing);',
    '  --font-sans: var(--bk-font-sans);',
    '  --font-mono: var(--bk-font-mono);',
    '}',
  ].join('\n')}\n`;
}
