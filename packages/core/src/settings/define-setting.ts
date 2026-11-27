/**
 * BieberKit
 *
 * @file        packages/core/src/settings/define-setting.ts
 * @description defineSetting: the declaration of a setting that a plugin or module contributes under settings, with the check of its value and the type that a read gets (SET-01, SET-05, ADR 0030).
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

import { BkError } from '../errors/errors.ts';
import type { Parser } from '../config/parser.ts';

/** A problem with a setting declaration or a value. Codes start with `CORE_SETTING_`. */
export class SettingError extends BkError {}

/** Text in several languages. English is required, so a screen always has something to show. */
export type LocalizedText = { readonly en: string } & Readonly<Record<string, string>>;

export type SettingType = 'string' | 'number' | 'boolean' | 'enum' | 'json';
export type SettingScope = 'global' | 'tenant';

/** Who changes a setting, as far as a guard needs to know (ADR 0031). */
export interface SettingActor {
  /** The address of the client, after `TRUST_PROXY`. Empty when unknown. */
  readonly ip: string;
  /** Whether the person proved a second factor. */
  readonly mfa: boolean;
}

interface Common {
  /** Dotted and lower case, such as `seo.title`. A plugin's keys start with its short name and a dot (PLG_PREFIX_SETTING). */
  readonly key: string;
  readonly label: LocalizedText;
  readonly description?: LocalizedText;
  /** Where the admin shows it, such as `general` or `security`. */
  readonly group?: string;
  /** `tenant`: each tenant has its own value, falling back to the global value and then to the default (SET-04). */
  readonly scope?: SettingScope;
  /** Served without a session by `GET /api/v1/settings/public` (SET-07). Never together with `secret`. */
  readonly public?: boolean;
  /** Encrypted at rest, never returned and never in audit data (SET-03). */
  readonly secret?: boolean;
  /** Says whether writing `value` would lock `actor` out. The service then refuses it with `SETTINGS_SELF_LOCKOUT` (POL-05). */
  readonly guard?: (value: unknown, actor: SettingActor) => boolean;
}

export type SettingInput<T> =
  | (Common & { readonly type: 'string'; readonly default: T & string })
  | (Common & { readonly type: 'number'; readonly default: T & number })
  | (Common & { readonly type: 'boolean'; readonly default: T & boolean })
  | (Common & { readonly type: 'enum'; readonly values: readonly (T & string)[]; readonly default: T & string })
  | (Common & { readonly type: 'json'; readonly parser: Parser<T>; readonly default: T });

/** A declared setting. `T` is the type of its value, so `settings.get(def)` is typed without declaring it twice (SET-05). */
export interface SettingDef<T = unknown> {
  readonly key: string;
  readonly type: SettingType;
  readonly default: T;
  readonly label: LocalizedText;
  readonly description?: LocalizedText;
  readonly group?: string;
  readonly scope: SettingScope;
  readonly public: boolean;
  readonly secret: boolean;
  /** The allowed values of an `enum` setting. */
  readonly values?: readonly string[];
  /** The value of `input` when it is valid for this setting, or `CORE_SETTING_VALUE` with the reason. */
  check(input: unknown): T;
  /** See `Common.guard`. */
  readonly guard?: (value: unknown, actor: SettingActor) => boolean;
}

const KEY = /^[a-z][a-z0-9-]*(\.[a-z][a-z0-9-]*)+$/;
const MAX_KEY = 120;
const TYPES: readonly SettingType[] = ['string', 'number', 'boolean', 'enum', 'json'];
const SCOPES: readonly SettingScope[] = ['global', 'tenant'];

function invalid(key: string, why: string, fix: string): never {
  throw new SettingError(`The setting ${key === '' ? '(no key)' : key} is not valid: ${why}.`, {
    code: 'CORE_SETTING_INVALID',
    status: 500,
    fix,
  });
}

function badValue(key: string, why: string): never {
  throw new SettingError(`The value of ${key} is not valid: ${why}.`, {
    code: 'CORE_SETTING_VALUE',
    status: 422,
    safeMessage: `The value of ${key} is not valid: ${why}.`,
    fix: 'Send a value of the type that the setting declares.',
  });
}

const reasonOf = (error: unknown): string => (error instanceof Error ? error.message : String(error));

function checker(input: SettingInput<unknown>): (value: unknown) => unknown {
  const { key } = input;
  switch (input.type) {
    case 'string':
      return (value) => (typeof value === 'string' ? value : badValue(key, 'it must be text'));
    case 'number':
      return (value) =>
        typeof value === 'number' && Number.isFinite(value) ? value : badValue(key, 'it must be a finite number');
    case 'boolean':
      return (value) => (typeof value === 'boolean' ? value : badValue(key, 'it must be true or false'));
    case 'enum': {
      const values = input.values;
      return (value) =>
        typeof value === 'string' && values.includes(value)
          ? value
          : badValue(key, `it must be one of ${values.join(', ')}`);
    }
    case 'json': {
      const parser = input.parser;
      return (value) => {
        try {
          return parser.parse(value);
        } catch (error) {
          return badValue(key, reasonOf(error));
        }
      };
    }
    default:
      return invalid(key, 'the type is not known', `Use one of ${TYPES.join(', ')}.`);
  }
}

function validate(input: SettingInput<unknown>): void {
  const key = typeof input.key === 'string' ? input.key : '';
  if (!KEY.test(key) || key.length > MAX_KEY)
    invalid(key, 'the key is not dotted lower case of at most 120 characters', 'Name it like seo.title.');
  if (!TYPES.includes(input.type))
    invalid(key, `the type "${input.type}" is not known`, `Use one of ${TYPES.join(', ')}.`);
  if (input.scope !== undefined && !SCOPES.includes(input.scope))
    invalid(key, `the scope "${input.scope}" is not known`, 'Use global or tenant.');
  if (typeof input.label !== 'object' || input.label === null || typeof input.label.en !== 'string')
    invalid(key, 'the label has no English text', 'Give the label as { en: "..." }.');
  if (input.public === true && input.secret === true)
    invalid(key, 'a secret cannot be public', 'Remove public or secret.');
  if (input.type === 'enum' && (!Array.isArray(input.values) || input.values.length === 0))
    invalid(key, 'an enum has no values', 'List the allowed values in values.');
  if (input.type === 'json' && typeof Reflect.get(Object(input.parser), 'parse') !== 'function')
    invalid(key, 'a json setting has no parser', 'Give a parser, such as a Zod Mini schema.');
}

/**
 * Declares a setting. A bad declaration is `CORE_SETTING_INVALID` at once, so the author sees it when the module loads. The default
 * must pass the setting's own check.
 */
export function defineSetting<const T extends string>(
  input: Common & { readonly type: 'enum'; readonly values: readonly T[]; readonly default: NoInfer<T> },
): SettingDef<T>;
export function defineSetting<T>(
  input: Common & { readonly type: 'json'; readonly parser: Parser<T>; readonly default: T },
): SettingDef<T>;
export function defineSetting(
  input: Common & { readonly type: 'string'; readonly default: string },
): SettingDef<string>;
export function defineSetting(
  input: Common & { readonly type: 'number'; readonly default: number },
): SettingDef<number>;
export function defineSetting(
  input: Common & { readonly type: 'boolean'; readonly default: boolean },
): SettingDef<boolean>;
export function defineSetting(input: SettingInput<unknown>): SettingDef {
  validate(input);
  const check = checker(input);
  try {
    check(input.default);
  } catch (error) {
    invalid(input.key, `the default is not valid (${reasonOf(error)})`, 'Give a default that the setting accepts.');
  }
  return Object.freeze({
    key: input.key,
    type: input.type,
    default: input.default,
    label: input.label,
    ...(input.description === undefined ? {} : { description: input.description }),
    ...(input.group === undefined ? {} : { group: input.group }),
    scope: input.scope ?? 'global',
    public: input.public === true,
    secret: input.secret === true,
    ...(input.type === 'enum' ? { values: Object.freeze([...input.values]) } : {}),
    check,
    ...(input.guard === undefined ? {} : { guard: input.guard }),
  });
}
