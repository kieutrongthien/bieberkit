/**
 * BieberKit
 *
 * @file        tools/lib/packages.ts
 * @description Builds the publint and attw commands that check a packed package.
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

// Used by tools/check-packages.ts. Erasable TypeScript only, so Node.js runs this file directly.

export interface PackageCheck {
  tool: 'publint' | 'attw';
  args: string[];
}

/**
 * The checks every packed tarball must pass (spec section 3). attw runs with the esm-only profile because
 * every BieberKit package is ESM only (ADR 0014), so its CommonJS and node10 resolution results are expected.
 */
export function packageChecks(tarball: string): PackageCheck[] {
  return [
    { tool: 'publint', args: ['run', tarball] },
    { tool: 'attw', args: ['--profile', 'esm-only', tarball] },
  ];
}
