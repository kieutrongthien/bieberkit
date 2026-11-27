/**
 * BieberKit
 *
 * @file        packages/server/src/policy.test.ts
 * @description Tests of the adapter that reads the security policies from the settings service (ADR 0031).
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

import { DEFAULT_POLICY } from '@bieberkit/auth';
import type { SettingDef } from '@bieberkit/core';
import { expect, it } from 'vitest';
import { settingsOf, settingsPolicyReader } from './policy.ts';
import type { SettingsReads } from './policy.ts';

const reads = (values: Record<string, unknown>): SettingsReads => ({
  get: <T>(def: SettingDef<T>): Promise<T> => {
    // The fake keeps its values by key, so the cast only restores the type of the declaration.
    // oxlint-disable-next-line typescript/no-unsafe-type-assertion
    const value = (def.key in values ? values[def.key] : def.default) as T;
    return Promise.resolve(value);
  },
});

it('POL-01 without the settings plugin the default policy applies', async () => {
  expect(settingsOf({})).toBeUndefined();
  expect(await settingsPolicyReader(undefined).read({})).toEqual(DEFAULT_POLICY);
});

it('POL-01 the policy follows the stored settings once the memo has passed', async () => {
  const values: Record<string, unknown> = {};
  let now = 0;
  const reader = settingsPolicyReader(reads(values), { memoMs: 1000, clock: () => now });
  expect((await reader.read({})).session.idleMinutes).toBe(0);
  values['security.session.idle-minutes'] = 20;
  values['security.network.admin-allowlist'] = ['10.0.0.0/8'];
  expect((await reader.read({})).session.idleMinutes).toBe(0);
  now = 1001;
  const policy = await reader.read({});
  expect(policy.session.idleMinutes).toBe(20);
  expect(policy.network.adminAllowlist).toEqual(['10.0.0.0/8']);
});

it('POL-03 a failed read uses the last good policy, and with none the request fails (fail closed)', async () => {
  let down = false;
  const settings: SettingsReads = {
    get: <T>(def: SettingDef<T>): Promise<T> =>
      down ? Promise.reject(new Error('store down')) : Promise.resolve(def.default),
  };
  let now = 0;
  const reader = settingsPolicyReader(settings, { memoMs: 10, clock: () => now });
  down = true;
  await expect(reader.read({})).rejects.toThrow('store down');
  down = false;
  const good = await reader.read({});
  down = true;
  now = 11;
  expect(await reader.read({})).toBe(good);
});

it('POL-03 the strict read is used when the service has one, so a failure is not read as the default', async () => {
  const settings: SettingsReads = {
    get: <T>(def: SettingDef<T>): Promise<T> => Promise.resolve(def.default),
    getStrict: () => Promise.reject(new Error('strict')),
  };
  await expect(settingsPolicyReader(settings).read({})).rejects.toThrow('strict');
});

it('POL-01 a read inside the memo asks the store nothing', async () => {
  let calls = 0;
  const settings: SettingsReads = {
    get: <T>(def: SettingDef<T>): Promise<T> => {
      calls += 1;
      return Promise.resolve(def.default);
    },
  };
  let now = 0;
  const reader = settingsPolicyReader(settings, { memoMs: 1000, clock: () => now });
  await reader.read({});
  const first = calls;
  now = 500;
  await reader.read({});
  expect(calls).toBe(first);
});

it('POL-01 settingsOf finds a service with a get function', () => {
  expect(settingsOf({ settings: reads({}) })).toBeDefined();
  expect(settingsOf({ settings: 1 })).toBeUndefined();
});
