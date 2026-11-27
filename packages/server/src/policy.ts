/**
 * BieberKit
 *
 * @file        packages/server/src/policy.ts
 * @description Adapts the settings service to the PolicyReader port of the authenticator (ADR 0031).
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

import { defaultPolicyReader, policyOf, securitySettings } from '@bieberkit/auth';
import type { PolicyReader, SecurityPolicy } from '@bieberkit/auth';
import type { SettingDef } from '@bieberkit/core';

/** What the reader needs of the settings service. The plugin may be absent, so the server does not import its type. */
export interface SettingsReads {
  get<T>(setting: SettingDef<T>, where?: { readonly tenantId?: string | undefined }): Promise<T>;
  /** Fails when the store cannot be read. Preferred when present, so that a failure is not read as the default. */
  getStrict?<T>(setting: SettingDef<T>, where?: { readonly tenantId?: string | undefined }): Promise<T>;
}

function isSettingsReads(value: unknown): value is SettingsReads {
  return typeof value === 'object' && value !== null && typeof Reflect.get(value, 'get') === 'function';
}

/** The settings service of the container, or `undefined` when the settings plugin is not installed. */
export function settingsOf(services: object): SettingsReads | undefined {
  try {
    const found: unknown = Reflect.get(services, 'settings');
    return isSettingsReads(found) ? found : undefined;
  } catch {
    return undefined;
  }
}

/** How long a policy read is reused. The settings are cached too, but eight of them on every request would be eight round trips. */
export const POLICY_MEMO_MS = 2_000;

/**
 * Reads the `security.*` settings, so a change shows within `POLICY_MEMO_MS` and without a restart (POL-01). Without the settings
 * plugin the default policy applies. When a read fails the last good policy is used, and with none the request fails: a network
 * rule must not open because the store was down (POL-03).
 */
export function settingsPolicyReader(
  settings: SettingsReads | undefined,
  options: { readonly memoMs?: number; readonly clock?: () => number } = {},
): PolicyReader {
  if (settings === undefined) return defaultPolicyReader;
  const memoMs = options.memoMs ?? POLICY_MEMO_MS;
  const clock = options.clock ?? Date.now;
  let lastGood: SecurityPolicy | undefined;
  let readAt = Number.NEGATIVE_INFINITY;
  const readOne = <T>(def: SettingDef<T>, tenantId: string | undefined): Promise<T> =>
    settings.getStrict === undefined ? settings.get(def, { tenantId }) : settings.getStrict(def, { tenantId });
  return {
    async read(context) {
      if (lastGood !== undefined && context.tenantId === undefined && clock() - readAt < memoMs) return lastGood;
      try {
        const values = new Map<string, unknown>();
        await Promise.all(
          securitySettings.map(async (def) => {
            values.set(def.key, await readOne(def, context.tenantId));
          }),
        );
        const policy = policyOf((def) => values.get(def.key));
        if (context.tenantId === undefined) {
          lastGood = policy;
          readAt = clock();
        }
        return policy;
      } catch (error) {
        if (lastGood === undefined) throw error;
        return lastGood;
      }
    },
  };
}
