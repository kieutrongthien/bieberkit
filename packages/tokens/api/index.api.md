<!--
  BieberKit

  @file        packages/tokens/api/index.api.md
  @description API report of @bieberkit/tokens: its public surface, checked in CI and reviewed in pull requests.
  @author      Bieber Kieu <kieutrongthien@gmail.com>
  @generated   pnpm api:update
  @copyright   Copyright (c) 2026 Bieber Kieu
  @license     Apache-2.0

  Licensed under the Apache License, Version 2.0 (the "License");
  you may not use this file except in compliance with the License.
  You may obtain a copy of the License at

      http://www.apache.org/licenses/LICENSE-2.0

  Unless required by applicable law or agreed to in writing, software
  distributed under the License is distributed on an "AS IS" BASIS,
  WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
  See the License for the specific language governing permissions and
  limitations under the License.

  SPDX-License-Identifier: Apache-2.0
-->

# API report: @bieberkit/tokens

Generated from the built declaration files by `pnpm api:update`. Do not edit by hand. A change here is a change to the public API and needs a changeset (spec section 22.3).

```ts
export declare const FONT_STACK: {
  readonly sans: string;
  readonly mono: string;
};
interface ThemeColors {
  primary: string;
  success: string;
  warning: string;
  danger: string;
  info: string;
  background: string;
  surface: string;
  text: string;
  border: string;
  frame: string;
  accent: string;
}
type DarkMode = "auto" | "light" | "dark";
interface ThemeInput {
  readonly colors?: Partial<ThemeColors>;
  readonly dark?: {
    readonly colors?: Partial<ThemeColors>;
  };
  readonly radius?: number;
  readonly spacing?: number;
  readonly fonts?: {
    readonly sans?: string;
    readonly mono?: string;
  };
  readonly darkMode?: DarkMode;
}
interface Theme {
  readonly colors: ThemeColors;
  readonly dark: ThemeColors;
  readonly radius: number;
  readonly spacing: number;
  readonly fonts: {
    readonly sans: string;
    readonly mono: string;
  };
  readonly darkMode: DarkMode;
}
export declare const DEFAULT_THEME: Theme;
export declare const COLOR_KEYS: readonly (keyof ThemeColors)[];
export declare function parseTheme(input: unknown): Theme;
export declare const themeSection: {
  readonly key: "theme";
  readonly parser: {
    parse(input: unknown): ThemeInput | undefined;
  };
};
export declare function readTheme(text: string | null | undefined): Theme;
export declare function modeOf(theme: Theme, systemPrefersDark: boolean): "light" | "dark";
interface AntdTheme {
  readonly algorithm: "default" | "dark";
  readonly token: Readonly<Record<string, string | number>>;
}
export declare function compileAntdTheme(theme: Theme, mode: "light" | "dark"): AntdTheme;
export declare function cssVariables(theme: Theme): string;
export declare function tailwindTheme(_theme: Theme): string;
export declare function luminanceOf(hex: string): number;
export declare function contrastRatio(a: string, b: string): number;
export declare function mixColors(a: string, b: string, weight: number): string;
interface Chrome {
  readonly frameStrong: string;
  readonly frameText: string;
  readonly frameMuted: string;
  readonly frameRaised: string;
  readonly tint: string;
  readonly ink: string;
}
export declare function chromeOf(colors: ThemeColors): Chrome;
export declare const packageName = "@bieberkit/tokens";
export type { AntdTheme, Chrome, DarkMode, Theme, ThemeColors, ThemeInput };
```
