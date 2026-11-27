/**
 * BieberKit
 *
 * @file        packages/tokens/src/theme.ts
 * @description The brand tokens that bieberkit.config.ts declares once: colors, radius, spacing, fonts and dark mode, with their defaults and their validation (TOK-01, TOK-03, UI-06).
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

/** The default font stacks. Latin, Vietnamese (letters with several marks) and Chinese each have a family that draws them (TOK-03). */
export const FONT_STACK: { readonly sans: string; readonly mono: string } = {
  sans: [
    '-apple-system',
    'BlinkMacSystemFont',
    '"Segoe UI"',
    'Roboto',
    '"Helvetica Neue"',
    'Arial',
    '"Noto Sans"',
    '"PingFang SC"',
    '"Hiragino Sans GB"',
    '"Microsoft YaHei"',
    '"Noto Sans CJK SC"',
    '"Noto Sans SC"',
    'sans-serif',
    '"Apple Color Emoji"',
    '"Segoe UI Emoji"',
  ].join(', '),
  mono: [
    'ui-monospace',
    'SFMono-Regular',
    'Menlo',
    'Consolas',
    '"Liberation Mono"',
    '"Noto Sans Mono CJK SC"',
    'monospace',
  ].join(', '),
};

export interface ThemeColors {
  /** The brand color: buttons, links, focus. */
  primary: string;
  success: string;
  warning: string;
  danger: string;
  info: string;
  background: string;
  /** A panel or a page behind the cards. */
  surface: string;
  text: string;
  border: string;
}

export type DarkMode = 'auto' | 'light' | 'dark';

/** What `bieberkit.config.ts` may say. Everything is optional. */
export interface ThemeInput {
  readonly colors?: Partial<ThemeColors>;
  /** Replaces colors of the dark palette. The brand colors of the dark palette are those of `colors` unless this says otherwise. */
  readonly dark?: { readonly colors?: Partial<ThemeColors> };
  /** The radius of a control, in px, 0 to 24. */
  readonly radius?: number;
  /** The base unit of the spacing, in px, 2 to 8. */
  readonly spacing?: number;
  /** A font family list that goes in front of the default stack. */
  readonly fonts?: { readonly sans?: string; readonly mono?: string };
  /** `auto` follows the system, `light` and `dark` are fixed. */
  readonly darkMode?: DarkMode;
}

/** The theme with every token filled. */
export interface Theme {
  readonly colors: ThemeColors;
  readonly dark: ThemeColors;
  readonly radius: number;
  readonly spacing: number;
  readonly fonts: { readonly sans: string; readonly mono: string };
  readonly darkMode: DarkMode;
}

const LIGHT: ThemeColors = {
  primary: '#1677ff',
  success: '#52c41a',
  warning: '#faad14',
  danger: '#ff4d4f',
  info: '#1677ff',
  background: '#ffffff',
  surface: '#f5f5f5',
  text: '#1f1f1f',
  border: '#d9d9d9',
};

const DARK_NEUTRALS = { background: '#141414', surface: '#1f1f1f', text: '#f0f0f0', border: '#424242' } as const;

export const DEFAULT_THEME: Theme = {
  colors: LIGHT,
  dark: { ...LIGHT, ...DARK_NEUTRALS },
  radius: 6,
  spacing: 4,
  fonts: { sans: FONT_STACK.sans, mono: FONT_STACK.mono },
  darkMode: 'auto',
};

/** The colors of a theme, in the order that the compilers write them. */
export const COLOR_KEYS: readonly (keyof ThemeColors)[] = [
  'primary',
  'success',
  'warning',
  'danger',
  'info',
  'background',
  'surface',
  'text',
  'border',
];
const colorKeyOf = (key: string): keyof ThemeColors | undefined => COLOR_KEYS.find((name) => name === key);
const HEX = /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;
const FONT = /^[\w\s"',.-]+$/;
const DARK_MODES: readonly DarkMode[] = ['auto', 'light', 'dark'];
const isDarkMode = (value: unknown): value is DarkMode => DARK_MODES.some((mode) => mode === value);
const TOP_KEYS = ['colors', 'dark', 'radius', 'spacing', 'fonts', 'darkMode'];

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

function colorsOf(input: unknown, path: string, base: ThemeColors, problems: string[]): ThemeColors {
  if (input === undefined) return base;
  if (!isRecord(input)) {
    problems.push(`${path}: must be an object of colors.`);
    return base;
  }
  const out: ThemeColors = { ...base };
  for (const [key, value] of Object.entries(input)) {
    const name = colorKeyOf(key);
    if (name === undefined) problems.push(`${path}.${key}: is not a color of the theme (${COLOR_KEYS.join(', ')}).`);
    else if (typeof value !== 'string' || !HEX.test(value))
      problems.push(`${path}.${key}: "${String(value)}" is not a hex color such as #1677ff.`);
    else out[name] = value;
  }
  return out;
}

function fontOf(input: unknown, key: 'sans' | 'mono', problems: string[]): string {
  const fallback = FONT_STACK[key];
  if (input === undefined) return fallback;
  if (typeof input !== 'string' || input.trim() === '' || !FONT.test(input)) {
    problems.push(`fonts.${key}: must be a list of font families such as "Inter", "Be Vietnam Pro".`);
    return fallback;
  }
  return `${input.trim()}, ${fallback}`;
}

function numberOf(input: unknown, key: string, min: number, max: number, fallback: number, problems: string[]): number {
  if (input === undefined) return fallback;
  if (typeof input !== 'number' || !Number.isFinite(input) || input < min || input > max) {
    problems.push(`${key}: must be a number from ${min} to ${max}.`);
    return fallback;
  }
  return input;
}

/** Checks the `theme` of the config and fills what it leaves out. Every problem is reported together (CFG-09). */
export function parseTheme(input: unknown): Theme {
  if (input === undefined) return DEFAULT_THEME;
  const problems: string[] = [];
  if (!isRecord(input)) throw new Error('theme: must be an object.');
  for (const key of Object.keys(input))
    if (!TOP_KEYS.includes(key)) problems.push(`${key}: is not a key of the theme (${TOP_KEYS.join(', ')}).`);
  const colors = colorsOf(input['colors'], 'colors', DEFAULT_THEME.colors, problems);
  const darkInput = input['dark'];
  if (darkInput !== undefined && !isRecord(darkInput)) problems.push('dark: must be an object.');
  // The brand colors of the dark palette are the brand colors of the theme; its neutrals are the dark ones.
  const darkBase: ThemeColors = { ...colors, ...DARK_NEUTRALS };
  const dark = colorsOf(isRecord(darkInput) ? darkInput['colors'] : undefined, 'dark.colors', darkBase, problems);
  const radius = numberOf(input['radius'], 'radius', 0, 24, DEFAULT_THEME.radius, problems);
  const spacing = numberOf(input['spacing'], 'spacing', 2, 8, DEFAULT_THEME.spacing, problems);
  const fontsInput = input['fonts'];
  if (fontsInput !== undefined && !isRecord(fontsInput)) problems.push('fonts: must be an object.');
  const fonts = isRecord(fontsInput) ? fontsInput : {};
  for (const key of Object.keys(fonts))
    if (key !== 'sans' && key !== 'mono') problems.push(`fonts.${key}: is not a font of the theme (sans, mono).`);
  const mode = input['darkMode'];
  if (mode !== undefined && !isDarkMode(mode)) problems.push(`darkMode: must be one of ${DARK_MODES.join(', ')}.`);
  const theme: Theme = {
    colors,
    dark,
    radius,
    spacing,
    fonts: { sans: fontOf(fonts['sans'], 'sans', problems), mono: fontOf(fonts['mono'], 'mono', problems) },
    darkMode: isDarkMode(mode) ? mode : DEFAULT_THEME.darkMode,
  };
  if (problems.length > 0) throw new Error(`The theme has ${problems.length} problem(s):\n${problems.join('\n')}`);
  return theme;
}

/**
 * The `theme` section of `bieberkit.config.ts`, in the shape that `validateConfig` of core takes. This package does not import core,
 * because the admin imports this one into the browser: the server declares the key in the config and passes this section.
 */
export const themeSection: {
  readonly key: 'theme';
  readonly parser: { parse(input: unknown): ThemeInput | undefined };
} = {
  key: 'theme',
  parser: {
    parse(input) {
      parseTheme(input);
      // `parseTheme` refused everything that is not a theme, so what is left has the shape of one.
      // oxlint-disable-next-line typescript/no-unsafe-type-assertion
      return input === undefined ? undefined : (input as ThemeInput);
    },
  },
};

const isColors = (value: unknown): value is ThemeColors =>
  isRecord(value) &&
  COLOR_KEYS.every((key) => {
    const color = value[key];
    return typeof color === 'string' && HEX.test(color);
  });

const isTheme = (value: unknown): value is Theme =>
  isRecord(value) &&
  isColors(value['colors']) &&
  isColors(value['dark']) &&
  typeof value['radius'] === 'number' &&
  typeof value['spacing'] === 'number' &&
  isRecord(value['fonts']) &&
  typeof value['fonts']['sans'] === 'string' &&
  typeof value['fonts']['mono'] === 'string' &&
  isDarkMode(value['darkMode']);

/**
 * The theme that the server wrote in the page (the JSON of a resolved `Theme`). Anything that is not one, or is not JSON, is the
 * default theme: the admin must open, however the page was changed on its way.
 */
export function readTheme(text: string | null | undefined): Theme {
  if (text === null || text === undefined || text === '') return DEFAULT_THEME;
  try {
    const found: unknown = JSON.parse(text);
    return isTheme(found) ? found : DEFAULT_THEME;
  } catch {
    return DEFAULT_THEME;
  }
}

/** Which palette to draw: a fixed mode of the theme, or the system setting for `auto`. */
export function modeOf(theme: Theme, systemPrefersDark: boolean): 'light' | 'dark' {
  if (theme.darkMode === 'auto') return systemPrefersDark ? 'dark' : 'light';
  return theme.darkMode;
}
