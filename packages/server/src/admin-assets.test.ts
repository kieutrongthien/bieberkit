/**
 * BieberKit
 *
 * @file        packages/server/src/admin-assets.test.ts
 * @description Tests of the hashed files that the admin keeps for 24 hours after a deploy, so that a tab that is open survives a rolling deploy (UI-22).
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

import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, utimesSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { retainAssets, RETAIN_MS } from './admin-assets.ts';

const folders: string[] = [];
afterEach(() => {
  for (const folder of folders.splice(0)) rmSync(folder, { recursive: true, force: true });
});

const NOW = Date.parse('2026-11-27T12:00:00.000Z');
const HOUR = 3_600_000;

/** A build of the admin: the page, and hashed files in `assets/`. */
function build(files: Readonly<Record<string, string>>): string {
  const folder = mkdtempSync(join(tmpdir(), 'bk-admin-build-'));
  folders.push(folder);
  mkdirSync(join(folder, 'assets'), { recursive: true });
  writeFileSync(join(folder, 'index.html'), '<html></html>');
  for (const [name, text] of Object.entries(files)) writeFileSync(join(folder, 'assets', name), text);
  return folder;
}

function retained(): string {
  const folder = mkdtempSync(join(tmpdir(), 'bk-admin-retained-'));
  folders.push(folder);
  return join(folder, 'admin-assets');
}

const has = (folder: string, name: string): boolean => existsSync(join(folder, 'assets', name));

describe('UI-22 the hashed files of the releases that went before', () => {
  it('UI-22 the files of a release are kept, and the page is not, because the page is the release itself', () => {
    const keep = retained();
    retainAssets({ source: build({ 'index-aaa.js': 'one' }), retained: keep, now: NOW });
    expect(readFileSync(join(keep, 'assets', 'index-aaa.js'), 'utf8')).toBe('one');
    expect(existsSync(join(keep, 'index.html'))).toBe(false);
  });

  it('UI-22 the files of the release before stay for 24 hours after the new release starts, and not for longer', () => {
    const keep = retained();
    retainAssets({ source: build({ 'index-aaa.js': 'one', 'chunk-111.js': 'c1' }), retained: keep, now: NOW });
    const second = build({ 'index-bbb.js': 'two', 'chunk-111.js': 'c1' });

    // The second release starts a day and a half after the first one did.
    const deploy = NOW + 36 * HOUR;
    const done = retainAssets({ source: second, retained: keep, now: deploy });
    expect(has(keep, 'index-aaa.js')).toBe(true);
    expect(has(keep, 'index-bbb.js')).toBe(true);
    expect(done.superseded).toEqual(['index-aaa.js']);

    // A restart 23 hours later still has them, and one 25 hours after the deploy does not.
    retainAssets({ source: second, retained: keep, now: deploy + 23 * HOUR });
    expect(has(keep, 'index-aaa.js')).toBe(true);
    const later = retainAssets({ source: second, retained: keep, now: deploy + 25 * HOUR });
    expect(has(keep, 'index-aaa.js')).toBe(false);
    expect(later.removed).toEqual(['index-aaa.js']);
  });

  it('UI-22 a file that the release uses is never removed, however old, and one that two releases share is kept as long as one needs it', () => {
    const keep = retained();
    const first = build({ 'chunk-111.js': 'c1', 'index-aaa.js': 'one' });
    retainAssets({ source: first, retained: keep, now: NOW });
    const second = build({ 'chunk-111.js': 'c1', 'index-bbb.js': 'two' });
    retainAssets({ source: second, retained: keep, now: NOW + 100 * HOUR });
    expect(has(keep, 'chunk-111.js')).toBe(true);
    expect(has(keep, 'index-aaa.js')).toBe(true);
    retainAssets({ source: second, retained: keep, now: NOW + 200 * HOUR });
    expect(has(keep, 'chunk-111.js')).toBe(true);
    expect(has(keep, 'index-aaa.js')).toBe(false);
  });

  it('UI-22 a rollback brings the files of the older release back, and they are the release again', () => {
    const keep = retained();
    const first = build({ 'index-aaa.js': 'one' });
    const second = build({ 'index-bbb.js': 'two' });
    retainAssets({ source: first, retained: keep, now: NOW });
    retainAssets({ source: second, retained: keep, now: NOW + HOUR });
    retainAssets({ source: first, retained: keep, now: NOW + 2 * HOUR });
    retainAssets({ source: first, retained: keep, now: NOW + 100 * HOUR });
    expect(has(keep, 'index-aaa.js')).toBe(true);
    expect(has(keep, 'index-bbb.js')).toBe(false);
  });

  it('UI-22 a file that was left in the folder and belongs to no release is removed after a day', () => {
    const keep = retained();
    mkdirSync(join(keep, 'assets'), { recursive: true });
    writeFileSync(join(keep, 'assets', 'stray.js'), 'x');
    utimesSync(join(keep, 'assets', 'stray.js'), new Date(NOW - 2 * RETAIN_MS), new Date(NOW - 2 * RETAIN_MS));
    retainAssets({ source: build({ 'index-aaa.js': 'one' }), retained: keep, now: NOW });
    expect(has(keep, 'stray.js')).toBe(false);
  });

  it('UI-22 a folder that cannot be written does not stop the server: the files of this release are served from the build', () => {
    const blocked = join(retained(), 'blocked');
    mkdirSync(join(blocked, '..'), { recursive: true });
    writeFileSync(blocked, 'a file where a folder is needed');
    const done = retainAssets({
      source: build({ 'index-aaa.js': 'one' }),
      retained: join(blocked, 'inside'),
      now: NOW,
    });
    expect(done.error).toBeDefined();
  });
});
