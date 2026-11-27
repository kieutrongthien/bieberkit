/**
 * BieberKit
 *
 * @file        packages/tokens/src/index.ts
 * @description Public entry point of @bieberkit/tokens.
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

export { compileAntdTheme, cssVariables, tailwindTheme } from './compile.ts';
export type { AntdTheme } from './compile.ts';
export { COLOR_KEYS, DEFAULT_THEME, FONT_STACK, modeOf, parseTheme, readTheme, themeSection } from './theme.ts';
export type { DarkMode, Theme, ThemeColors, ThemeInput } from './theme.ts';

/** npm name of this package. */
export const packageName = '@bieberkit/tokens';
