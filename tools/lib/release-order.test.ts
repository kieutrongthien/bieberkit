/**
 * BieberKit
 *
 * @file        tools/lib/release-order.test.ts
 * @description Tests for the publish order and the tarball names of a release.
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
import { publishOrder, tarballName } from './release-order.ts';

const pkg = (name: string, version = '0.0.0') => ({ name, version });

describe('release order (ADR 0014)', () => {
  it('publishes the foundation first, then contracts, product and tools', () => {
    const order = publishOrder([
      pkg('create-bieberkit'),
      pkg('@bieberkit/admin-antd'),
      pkg('@bieberkit/http'),
      pkg('@bieberkit/core'),
      pkg('@bieberkit/mcp'),
    ]);
    expect(order.map((p) => p.name)).toEqual([
      '@bieberkit/core',
      '@bieberkit/http',
      '@bieberkit/admin-antd',
      '@bieberkit/mcp',
      'create-bieberkit',
    ]);
  });

  it('orders the packages of one layer by name, whatever the input order', () => {
    const a = publishOrder([pkg('@bieberkit/queue'), pkg('@bieberkit/auth'), pkg('@bieberkit/cache')]);
    const b = publishOrder([pkg('@bieberkit/cache'), pkg('@bieberkit/queue'), pkg('@bieberkit/auth')]);
    expect(a.map((p) => p.name)).toEqual(['@bieberkit/auth', '@bieberkit/cache', '@bieberkit/queue']);
    expect(b).toEqual(a);
  });

  it('refuses a package that has no layer, so a new package cannot be released unplaced', () => {
    expect(() => publishOrder([pkg('@bieberkit/unknown')])).toThrow(/@bieberkit\/unknown/);
  });

  it('names a tarball the way pnpm pack does', () => {
    expect(tarballName('@bieberkit/core', '0.0.0')).toBe('bieberkit-core-0.0.0.tgz');
    expect(tarballName('bieberkit', '1.2.3')).toBe('bieberkit-1.2.3.tgz');
    expect(tarballName('create-bieberkit', '1.2.3')).toBe('create-bieberkit-1.2.3.tgz');
  });

  it('carries the version and tarball name of every entry', () => {
    const [first] = publishOrder([pkg('@bieberkit/core', '1.4.0')]);
    expect(first).toEqual({ name: '@bieberkit/core', version: '1.4.0', file: 'bieberkit-core-1.4.0.tgz' });
  });
});
