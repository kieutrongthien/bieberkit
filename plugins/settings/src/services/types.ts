/**
 * BieberKit
 *
 * @file        plugins/settings/src/services/types.ts
 * @description What the settings service takes and gives.
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

import type { SettingActor, SettingDef } from '@bieberkit/core';

/** What a client sees of a setting: its declaration, its value (masked for a secret) and whether a stored value is in use. */
export interface SettingView {
  readonly key: string;
  readonly type: string;
  readonly label: Readonly<Record<string, string>>;
  readonly description?: Readonly<Record<string, string>>;
  readonly group?: string;
  readonly scope: string;
  readonly public: boolean;
  readonly secret: boolean;
  readonly values?: readonly string[];
  readonly default: unknown;
  readonly value: unknown;
  readonly hasValue: boolean;
}

export interface SettingsPage {
  readonly data: readonly SettingView[];
  readonly nextCursor: string | null;
  readonly pageSize: number;
}

export interface Where {
  /** The tenant of the request. None, or the nil tenant, is the global scope. */
  readonly tenantId?: string | undefined;
}

export interface Change extends Where {
  /** Who changes it, for the audit entry; `null` is the system. */
  readonly actorId: string | null;
  /** The client of a person who changes it. A guard of the declaration reads it (POL-05). Without it no guard runs: a seeder is not locked out. */
  readonly actor?: SettingActor;
}

/** One setting of an export: the key and its value, or only the key and `secret: true` for a secret. */
export type ExportedSetting =
  | { readonly key: string; readonly value: unknown }
  | { readonly key: string; readonly secret: true };

export interface SettingsExport {
  readonly version: 1;
  readonly scope: 'global' | 'tenant';
  readonly settings: readonly ExportedSetting[];
}

export interface ImportEntry {
  readonly key: string;
  readonly value?: unknown;
  readonly secret?: boolean;
}

export type ImportResult = 'created' | 'updated' | 'unchanged' | 'skipped' | 'invalid';

export interface ImportReport {
  readonly dryRun: boolean;
  readonly results: readonly {
    readonly key: string;
    readonly result: ImportResult;
    readonly code?: string;
    readonly message?: string;
  }[];
}

export interface SettingsService {
  /** Every declaration, sorted by key. */
  readonly declarations: readonly SettingDef[];
  /** The value for code: the tenant value, then the global value, then the default (SET-04, SET-05). A secret is given in clear here. */
  get<T>(setting: SettingDef<T>, where?: Where): Promise<T>;
  /** Like `get`, but a store that cannot be read is an error and not the default. A rule that must not open on a failure reads this way (POL-03). */
  getStrict<T>(setting: SettingDef<T>, where?: Where): Promise<T>;
  set(setting: SettingDef | string, value: unknown, change: Change): Promise<void>;
  reset(setting: SettingDef | string, change: Change): Promise<void>;
  view(setting: SettingDef | string, where?: Where): Promise<SettingView>;
  list(where: Where & { readonly pageSize?: unknown; readonly cursor?: string }): Promise<SettingsPage>;
  /** The values stored in the scope of the caller, to carry them to another environment. A secret is a hole, never a value (OPS-03). */
  exportStored(where?: Where): Promise<SettingsExport>;
  /** Applies an export. With `dryRun` it only says what would change. An invalid entry refuses all of it (OPS-03). */
  importStored(
    entries: readonly ImportEntry[],
    change: Change,
    options?: { readonly dryRun?: boolean },
  ): Promise<ImportReport>;
  /** The `public` settings, for the login screen and the site (SET-07). */
  publicValues(where?: Where): Promise<{ readonly key: string; readonly value: unknown }[]>;
}
