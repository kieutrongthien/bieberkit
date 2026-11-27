/**
 * BieberKit
 *
 * @file        packages/tokens/src/chrome.test.ts
 * @description Tests of the identity colors: the frame and the accent of the theme, the colors derived from them and their contrast (UI-23).
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
  chromeOf,
  compileAntdTheme,
  contrastRatio,
  cssVariables,
  DEFAULT_THEME,
  mixColors,
  parseTheme,
  readTheme,
} from './index.ts';
import type { ThemeColors } from './index.ts';

const reads = (colors: ThemeColors): string[] => {
  const chrome = chromeOf(colors);
  const pairs: readonly (readonly [string, string, string])[] = [
    ['frameStrong on frame', chrome.frameStrong, colors.frame],
    ['frameText on frame', chrome.frameText, colors.frame],
    ['frameMuted on frame', chrome.frameMuted, colors.frame],
    ['ink on tint', chrome.ink, chrome.tint],
  ];
  return pairs.filter(([, text, under]) => contrastRatio(text, under) < 4.5).map(([name]) => name);
};

describe('UI-23 the identity of the default theme', () => {
  it('UI-23 the default is the palette of BieberKit, light and dark', () => {
    expect(DEFAULT_THEME.colors).toEqual({
      primary: '#4f46e5',
      success: '#237804',
      warning: '#ad4e00',
      danger: '#cf1322',
      info: '#4f46e5',
      background: '#ffffff',
      surface: '#f4f5fb',
      text: '#0b1020',
      border: '#d8dbee',
      frame: '#0b1020',
      accent: '#22d3ee',
    });
    expect(DEFAULT_THEME.dark).toEqual({
      primary: '#8b93ff',
      success: '#73d13d',
      warning: '#ffc53d',
      danger: '#ff7875',
      info: '#8b93ff',
      background: '#151a2e',
      surface: '#0e1222',
      text: '#eceef9',
      border: '#363d63',
      frame: '#070a16',
      accent: '#22d3ee',
    });
    expect(DEFAULT_THEME.radius).toBe(10);
    expect(DEFAULT_THEME.fonts.sans.startsWith('"Be Vietnam Pro", ')).toBe(true);
  });

  it('UI-23 the texts of the frame and of a tint read at level AA in both default palettes', () => {
    expect(reads(DEFAULT_THEME.colors)).toEqual([]);
    expect(reads(DEFAULT_THEME.dark)).toEqual([]);
  });

  it('UI-23 they read on any frame: a pale primary, a light frame and a middle gray', () => {
    expect(reads(parseTheme({ colors: { primary: '#ffee00' } }).colors)).toEqual([]);
    expect(reads(parseTheme({ colors: { frame: '#fafafa' } }).colors)).toEqual([]);
    expect(reads(parseTheme({ colors: { frame: '#777777' } }).colors)).toEqual([]);
    expect(chromeOf(parseTheme({ colors: { frame: '#fafafa' } }).colors).frameStrong).toBe('#000000');
  });
});

describe('UI-23 the frame follows the brand color', () => {
  it('UI-23 a primary and no frame gives a frame that is a dark tone of it, in both palettes', () => {
    const theme = parseTheme({ colors: { primary: '#0b625c' } });
    // 30% of the color and the rest black, and 18% for the dark palette.
    expect(theme.colors.frame).toBe('#031d1c');
    expect(theme.dark.frame).toBe('#021211');
  });

  it('UI-23 a frame of the config wins, and each palette can say its own', () => {
    const theme = parseTheme({
      colors: { primary: '#0b625c', frame: '#111111' },
      dark: { colors: { frame: '#222222' } },
    });
    expect(theme.colors.frame).toBe('#111111');
    expect(theme.dark.frame).toBe('#222222');
    expect(parseTheme({ colors: { frame: '#111111' } }).dark.frame).toBe('#111111');
  });

  it('UI-23 a theme with no primary keeps the frame of BieberKit', () => {
    expect(parseTheme({ radius: 4 }).colors.frame).toBe(DEFAULT_THEME.colors.frame);
    expect(parseTheme({ radius: 4 }).dark.frame).toBe(DEFAULT_THEME.dark.frame);
  });
});

describe('UI-23 the surfaces of Ant Design', () => {
  it('UI-23 a card is the background of the theme in both palettes, and what floats over it in the dark is a little lighter', () => {
    const light = compileAntdTheme(DEFAULT_THEME, 'light').token;
    const dark = compileAntdTheme(DEFAULT_THEME, 'dark').token;
    expect(light['colorBgContainer']).toBe(DEFAULT_THEME.colors.background);
    expect(light['colorBgElevated']).toBe(DEFAULT_THEME.colors.background);
    expect(dark['colorBgContainer']).toBe(DEFAULT_THEME.dark.background);
    expect(dark['colorBgElevated']).toBe(mixColors(DEFAULT_THEME.dark.text, DEFAULT_THEME.dark.background, 0.05));
  });
});

describe('UI-23 the variables of the page', () => {
  it('UI-23 the derived colors are variables, and they change with the palette', () => {
    const css = cssVariables(DEFAULT_THEME);
    for (const name of ['frame-strong', 'frame-text', 'frame-muted', 'frame-raised', 'tint', 'ink'])
      expect(css.match(new RegExp(`--bk-chrome-${name}:`, 'g'))).toHaveLength(3);
    expect(css).toContain(`--bk-chrome-ink: ${chromeOf(DEFAULT_THEME.colors).ink};`);
    expect(css).toContain(`--bk-chrome-ink: ${chromeOf(DEFAULT_THEME.dark).ink};`);
    expect(css).toContain('--bk-color-frame: #0b1020;');
    expect(css).toContain('--bk-color-accent: #22d3ee;');
  });

  it('UI-23 the new colors travel to the page and back', () => {
    const theme = parseTheme({ colors: { accent: '#ff8800' } });
    expect(readTheme(JSON.stringify(theme))).toEqual(theme);
  });
});
