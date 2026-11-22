/**
 * BieberKit
 *
 * @file        tools/lib/packages.test.ts
 * @description Tests for the commands that check packed packages with publint and attw.
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
import { packageChecks } from './packages.ts';

describe('package checks (spec section 3)', () => {
  const checks = packageChecks('/tmp/x/bieberkit-core-0.0.0.tgz');

  it('runs publint on the tarball', () => {
    const publint = checks.find((c) => c.tool === 'publint');
    expect(publint?.args).toEqual(['run', '/tmp/x/bieberkit-core-0.0.0.tgz']);
  });

  it('ADR 0014 runs attw with the esm-only profile, because every package is ESM only', () => {
    const attw = checks.find((c) => c.tool === 'attw');
    expect(attw?.args).toEqual(['--profile', 'esm-only', '/tmp/x/bieberkit-core-0.0.0.tgz']);
  });

  it('checks the tarball, not the source directory', () => {
    for (const c of checks) expect(c.args.at(-1)).toMatch(/\.tgz$/);
  });
});
