/**
 * BieberKit
 *
 * @file        tools/lib/workflows.test.ts
 * @description Tests for the workflow checker that enforces the release rules SEC-15, SEC-16 and SEC-21.
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
import { checkWorkflow } from './workflows.ts';

const SHA = '3d3c42e5aac5ba805825da76410c181273ba90b1';

const RELEASE_OK = `
name: Release
on:
  push:
    tags: ['v[0-9]+.[0-9]+.[0-9]+']
permissions: {}
jobs:
  build:
    runs-on: ubuntu-latest
    permissions:
      contents: read
    steps:
      - uses: actions/checkout@${SHA} # v7.0.1
      - run: pnpm install --frozen-lockfile
      - run: pnpm build
  publish:
    needs: build
    runs-on: ubuntu-latest
    environment: release
    permissions:
      contents: read
      id-token: write
    steps:
      - uses: actions/download-artifact@${SHA} # v8.0.2
        with:
          name: tarballs
      - uses: actions/setup-node@${SHA} # v7.1.0
        with:
          node-version: '26'
      - run: |
          sha256sum --check SHA256SUMS
          npm view "$name@$version" version || npm publish "$tgz" --access public
`;

const rules = (text: string): string[] => checkWorkflow('release.yml', text).map((v) => v.rule);
const hasDetail = (text: string, part: string): boolean =>
  checkWorkflow('release.yml', text).some((v) => v.detail.includes(part));

describe('release workflow rules', () => {
  it('SEC-21 accepts a publish job that only downloads, sets up Node.js and publishes', () => {
    expect(checkWorkflow('release.yml', RELEASE_OK)).toEqual([]);
  });

  it('SEC-21 flags an install step in a job with id-token: write', () => {
    const text = RELEASE_OK.replace(
      '      - uses: actions/setup-node',
      '      - run: pnpm install\n      - uses: actions/setup-node',
    );
    expect(rules(text)).toEqual(['SEC-21']);
    expect(hasDetail(text, 'pnpm install')).toBe(true);
  });

  it('SEC-21 flags a build and a test step in a job with id-token: write', () => {
    const text = RELEASE_OK.replace(
      '      - run: |\n          sha256sum',
      '      - run: pnpm build\n      - run: pnpm test\n      - run: |\n          sha256sum',
    );
    expect(rules(text)).toEqual(['SEC-21', 'SEC-21']);
  });

  it('SEC-21 flags an action that is not on the allow list in a job with id-token: write', () => {
    const text = RELEASE_OK.replace(
      '      - uses: actions/setup-node',
      `      - uses: actions/checkout@${SHA}\n      - uses: actions/setup-node`,
    );
    expect(rules(text)).toEqual(['SEC-21']);
    expect(hasDetail(text, 'actions/checkout')).toBe(true);
  });

  it('SEC-21 treats permissions: write-all as holding id-token: write', () => {
    const text = RELEASE_OK.replace(
      '    permissions:\n      contents: read\n    steps:\n      - uses: actions/checkout',
      '    permissions: write-all\n    steps:\n      - uses: actions/checkout',
    );
    expect(rules(text)).toContain('SEC-21');
  });

  it('SEC-16 flags a cache in a job with id-token: write and in the release workflow', () => {
    const text = RELEASE_OK.replace(
      "          node-version: '26'",
      "          node-version: '26'\n          cache: true",
    );
    expect(rules(text)).toEqual(['SEC-16', 'SEC-16']);
  });

  it('SEC-16 flags actions/cache anywhere in a release workflow', () => {
    const text = RELEASE_OK.replace(
      '      - run: pnpm build',
      `      - uses: actions/cache@${SHA}\n      - run: pnpm build`,
    );
    expect(rules(text)).toContain('SEC-16');
    expect(hasDetail(text, 'cache')).toBe(true);
  });

  it('SEC-16 flags pull_request_target', () => {
    const text = RELEASE_OK.replace('on:\n  push:', 'on:\n  pull_request_target:\n  push:');
    expect(rules(text)).toEqual(['SEC-16']);
  });

  it('SEC-16 requires a protected environment on a job with id-token: write', () => {
    const text = RELEASE_OK.replace('    environment: release\n', '');
    expect(rules(text)).toEqual(['SEC-16']);
  });

  it('SEC-16 requires empty top-level permissions in the release workflow', () => {
    const text = RELEASE_OK.replace('permissions: {}', 'permissions:\n  contents: read');
    expect(rules(text)).toEqual(['SEC-16']);
  });

  it('SEC-15 flags registry-url, which makes setup-node set NODE_AUTH_TOKEN', () => {
    const text = RELEASE_OK.replace(
      "          node-version: '26'",
      "          node-version: '26'\n          registry-url: https://registry.npmjs.org",
    );
    expect(rules(text)).toEqual(['SEC-15']);
  });

  it('SEC-15 flags a long-lived npm token', () => {
    const text = RELEASE_OK.replace(
      '      - run: |\n          sha256sum',
      '      - env:\n          NODE_AUTH_TOKEN: ${{ secrets.NPM_TOKEN }}\n        run: |\n          sha256sum',
    );
    expect(rules(text)).toEqual(['SEC-15']);
  });

  it('a workflow that is not a release workflow may cache and install', () => {
    const ci = `
name: CI
on:
  pull_request:
permissions:
  contents: read
jobs:
  check:
    runs-on: ubuntu-latest
    steps:
      - uses: pnpm/setup@${SHA}
        with:
          cache: true
      - run: pnpm install --frozen-lockfile
`;
    expect(checkWorkflow('ci.yml', ci)).toEqual([]);
  });

  it('SEC-16 reports every violation of a deliberately wrong release workflow', () => {
    const wrong = `
name: Bad release
on:
  pull_request_target:
  push:
    tags: ['v*']
permissions: write-all
jobs:
  publish:
    runs-on: ubuntu-latest
    permissions:
      id-token: write
      contents: write
    steps:
      - uses: actions/checkout@v7
      - uses: pnpm/setup@v3
        with:
          cache: true
      - uses: actions/cache@v4
      - run: pnpm install
      - run: pnpm build
      - uses: actions/setup-node@v7
        with:
          registry-url: https://registry.npmjs.org
      - run: npm publish
        env:
          NODE_AUTH_TOKEN: \${{ secrets.NPM_TOKEN }}
`;
    const found = rules(wrong);
    expect(found.filter((r) => r === 'SEC-16').length).toBe(6);
    expect(found.filter((r) => r === 'SEC-21').length).toBe(5);
    expect(found.filter((r) => r === 'SEC-15').length).toBe(2);
    expect(found.length).toBe(13);
  });

  it('gives every violation a fix that says what to do', () => {
    const text = RELEASE_OK.replace('    environment: release\n', '');
    const [v] = checkWorkflow('release.yml', text);
    expect(v?.fix.length).toBeGreaterThan(20);
    expect(v?.file).toBe('release.yml');
  });
});
