/**
 * BieberKit
 *
 * @file        packages/tokens/src/contrast.ts
 * @description The contrast ratio of two colors as WCAG 2.2 defines it, so that the default theme can be held to level AA by a test (UI-07, TOK-01).
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

const channel = (value: number): number => {
  const unit = value / 255;
  return unit <= 0.03928 ? unit / 12.92 : ((unit + 0.055) / 1.055) ** 2.4;
};

/** The three channels of a hex color of 3 or 6 digits, from 0 to 255. */
function rgbOf(hex: string): readonly number[] {
  const digits = hex.replace('#', '');
  const full =
    digits.length === 3
      ? digits
          .split('')
          .map((digit) => digit + digit)
          .join('')
      : digits;
  return [0, 2, 4].map((at) => Number.parseInt(full.slice(at, at + 2), 16));
}

/** The relative luminance of a hex color of 3 or 6 digits, from 0 (black) to 1 (white). */
export function luminanceOf(hex: string): number {
  const [red = 0, green = 0, blue = 0] = rgbOf(hex);
  return 0.2126 * channel(red) + 0.7152 * channel(green) + 0.0722 * channel(blue);
}

/** The contrast ratio of two colors, from 1 to 21. Level AA asks for 4.5 for text of a normal size. */
export function contrastRatio(a: string, b: string): number {
  const [light, dark] = [luminanceOf(a), luminanceOf(b)].toSorted((x, y) => y - x);
  return ((light ?? 0) + 0.05) / ((dark ?? 0) + 0.05);
}

const hexOf = (value: number): string => Math.round(value).toString(16).padStart(2, '0');

/** `weight` of `a` and the rest of `b`, as a hex color. A text that is not the full strength of the text color, such as a placeholder, is made this way. */
export function mixColors(a: string, b: string, weight: number): string {
  const [from, to] = [rgbOf(a), rgbOf(b)];
  return `#${[0, 1, 2].map((at) => hexOf((from[at] ?? 0) * weight + (to[at] ?? 0) * (1 - weight))).join('')}`;
}
