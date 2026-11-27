/**
 * BieberKit
 *
 * @file        packages/tokens/src/chrome.ts
 * @description The colors of the frame and of a tint that are derived from the theme, so that their texts read on any color a project chooses (UI-23, UI-07).
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

import { contrastRatio, mixColors } from './contrast.ts';
import type { ThemeColors } from './theme.ts';

/** The colors that a theme does not say and that follow from the ones that it does. */
export interface Chrome {
  /** White or black, the one that reads better on the frame: the chosen strong text. */
  readonly frameStrong: string;
  /** An entry of the menu on the frame. */
  readonly frameText: string;
  /** A group title or a second line on the frame. */
  readonly frameMuted: string;
  /** A hover or a divider on the frame. It carries no meaning by itself. */
  readonly frameRaised: string;
  /** A pale surface of the brand color, such as behind initials. */
  readonly tint: string;
  /** The text on a tint, and the chosen entry of the menu on the page. */
  readonly ink: string;
}

/** Level AA for a text of a normal size. */
const AA = 4.5;

const readable = (wanted: string, under: string, otherwise: string): string =>
  contrastRatio(wanted, under) >= AA ? wanted : otherwise;

export function chromeOf(colors: ThemeColors): Chrome {
  const strong =
    contrastRatio('#ffffff', colors.frame) >= contrastRatio('#000000', colors.frame) ? '#ffffff' : '#000000';
  const tint = mixColors(colors.primary, colors.background, 0.12);
  return {
    frameStrong: strong,
    frameText: readable(mixColors(strong, colors.frame, 0.82), colors.frame, strong),
    frameMuted: readable(mixColors(strong, colors.frame, 0.68), colors.frame, strong),
    frameRaised: mixColors(strong, colors.frame, 0.12),
    tint,
    ink: readable(mixColors(colors.primary, colors.text, 0.75), tint, colors.text),
  };
}
