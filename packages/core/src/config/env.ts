/**
 * BieberKit
 *
 * @file        packages/core/src/config/env.ts
 * @description Environment schema: typed keys with defaults and secrets, merging of owners, validation, redaction and description (CFG-01, CFG-05, CFG-06).
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

import { ConfigError, EnvValidationError } from '../errors/errors.ts';
import type { EnvProblem } from '../errors/errors.ts';

export type EnvKind = 'string' | 'int' | 'boolean' | 'enum' | 'url' | 'base64';

/** Where values come from. A real environment is `process.env`, which only `loadEnv` touches (P8). */
export type EnvSource = Readonly<Record<string, string | undefined>>;

/** The stored definition of one key. */
export interface EnvKeyDef {
  readonly kind: EnvKind;
  readonly values?: readonly string[];
  readonly min?: number;
  readonly max?: number;
  readonly hasDefault: boolean;
  readonly default?: unknown;
  readonly optional: boolean;
  readonly secret: boolean;
  readonly description: string;
}

/** Immutable builder: every call returns a new builder. `T` is the type of the parsed value. */
export interface EnvKeyBuilder<T> {
  readonly def: EnvKeyDef;
  readonly _type?: T;
  default(value: T): EnvKeyBuilder<T>;
  optional(): EnvKeyBuilder<T | undefined>;
  secret(): EnvKeyBuilder<T>;
  describe(text: string): EnvKeyBuilder<T>;
}

export interface EnvSchema<T> {
  readonly keys: Readonly<Record<string, EnvKeyDef>>;
  readonly _type?: T;
}

export interface EnvOwner {
  readonly name: string;
  /** A plugin owner must prefix every key, for example `SEO_`. The core has no prefix. */
  readonly prefix?: string;
  readonly schema: EnvSchema<unknown>;
}

export interface EnvDescription {
  readonly key: string;
  readonly type: EnvKind;
  readonly required: boolean;
  readonly default?: string;
  readonly secret: boolean;
  readonly description: string;
  readonly values?: readonly string[];
}

export interface IntOptions {
  readonly min?: number;
  readonly max?: number;
}

const KEY_NAME = /^[A-Z][A-Z0-9_]*$/;
const BASE64 = /^[A-Za-z0-9+/_-]+={0,2}$/;
const INTEGER = /^-?\d+$/;
const REDACTED = '[redacted]';

function builder<T>(def: EnvKeyDef): EnvKeyBuilder<T> {
  return {
    def,
    default: (value) => builder<T>({ ...def, hasDefault: true, default: value }),
    optional: () => builder<T | undefined>({ ...def, optional: true }),
    secret: () => builder<T>({ ...def, secret: true }),
    describe: (text) => builder<T>({ ...def, description: text }),
  };
}

function base(kind: EnvKind, extra: Partial<EnvKeyDef> = {}): EnvKeyDef {
  return { kind, hasDefault: false, optional: false, secret: false, description: '', ...extra };
}

/** Constructors for the key types. */
export const env: {
  string(): EnvKeyBuilder<string>;
  int(options?: IntOptions): EnvKeyBuilder<number>;
  boolean(): EnvKeyBuilder<boolean>;
  enum<V extends string>(values: readonly V[]): EnvKeyBuilder<V>;
  url(): EnvKeyBuilder<string>;
  base64(): EnvKeyBuilder<string>;
} = {
  string: () => builder<string>(base('string')),
  int: (options = {}) => {
    const range: Partial<EnvKeyDef> = {
      ...(options.min === undefined ? {} : { min: options.min }),
      ...(options.max === undefined ? {} : { max: options.max }),
    };
    return builder<number>(base('int', range));
  },
  boolean: () => builder<boolean>(base('boolean')),
  enum: <V extends string>(values: readonly V[]) => builder<V>(base('enum', { values })),
  url: () => builder<string>(base('url')),
  base64: () => builder<string>(base('base64')),
};

export type EnvValues<K extends Record<string, EnvKeyBuilder<unknown>>> = {
  [P in keyof K]: K[P] extends EnvKeyBuilder<infer T> ? T : never;
};

/** Collects typed keys into a schema. Key names are upper snake case. */
export function defineEnv<K extends Record<string, EnvKeyBuilder<unknown>>>(keys: K): EnvSchema<EnvValues<K>> {
  const defs: Record<string, EnvKeyDef> = {};
  for (const [name, key] of Object.entries(keys)) {
    if (!KEY_NAME.test(name)) {
      throw new ConfigError(`Environment key "${name}" is not upper snake case.`, {
        code: 'CFG_ENV_DEFINITION',
        fix: 'Name the key with capital letters, digits and underscores, starting with a letter.',
      });
    }
    defs[name] = key.def;
  }
  return { keys: defs };
}

/** Joins the schemas of the core and of plugins. Duplicate keys and keys without the owner's prefix are errors. */
export function mergeEnv(owners: readonly EnvOwner[]): EnvSchema<Record<string, unknown>> {
  const merged: Record<string, EnvKeyDef> = {};
  const seenIn = new Map<string, string>();
  for (const owner of owners) {
    for (const [name, def] of Object.entries(owner.schema.keys)) {
      if (owner.prefix !== undefined && !name.startsWith(owner.prefix)) {
        throw new ConfigError(`Key ${name} of "${owner.name}" does not start with ${owner.prefix}.`, {
          code: 'CFG_ENV_PREFIX',
          fix: `Rename the key to ${owner.prefix}${name}.`,
        });
      }
      const first = seenIn.get(name);
      if (first !== undefined) {
        throw new ConfigError(`Key ${name} is declared by "${first}" and by "${owner.name}".`, {
          code: 'CFG_ENV_DUPLICATE',
          fix: `Keep ${name} in one owner, or give the second one its own prefix.`,
        });
      }
      seenIn.set(name, owner.name);
      merged[name] = def;
    }
  }
  return { keys: merged };
}

type Parsed =
  | { readonly ok: true; readonly value: unknown }
  | { readonly ok: false; readonly message: string; readonly fix: string };

function shown(raw: string, def: EnvKeyDef): string {
  if (def.secret) return '';
  return ` Got "${raw.length > 40 ? `${raw.slice(0, 40)}...` : raw}".`;
}

function parseValue(name: string, def: EnvKeyDef, raw: string): Parsed {
  const bad = (expected: string, fix: string): Parsed => ({
    ok: false,
    message: `${name} must be ${expected}.${shown(raw, def)}`,
    fix,
  });
  switch (def.kind) {
    case 'string':
      return { ok: true, value: raw };
    case 'int': {
      const value = Number(raw);
      if (!INTEGER.test(raw) || !Number.isSafeInteger(value))
        return bad('a whole number', `Set ${name} to a whole number.`);
      if ((def.min !== undefined && value < def.min) || (def.max !== undefined && value > def.max)) {
        return bad(`between ${def.min ?? '-infinity'} and ${def.max ?? 'infinity'}`, `Set ${name} inside that range.`);
      }
      return { ok: true, value };
    }
    case 'boolean': {
      const lower = raw.toLowerCase();
      if (lower === 'true' || lower === '1') return { ok: true, value: true };
      if (lower === 'false' || lower === '0') return { ok: true, value: false };
      return bad('true, false, 1 or 0', `Set ${name} to true or false.`);
    }
    case 'enum': {
      if (def.values?.includes(raw) === true) return { ok: true, value: raw };
      return bad(`one of ${(def.values ?? []).join(', ')}`, `Set ${name} to one of ${(def.values ?? []).join(', ')}.`);
    }
    case 'url':
      return URL.canParse(raw)
        ? { ok: true, value: raw }
        : bad('an absolute URL', `Set ${name} to a full URL such as https://example.com.`);
    default:
      return BASE64.test(raw)
        ? { ok: true, value: raw }
        : bad('base64 text', `Set ${name} to base64 text. Generate one with: openssl rand -base64 32`);
  }
}

/** Reads and converts every key. All problems are reported together in one `EnvValidationError`. */
export function readEnv<T>(schema: EnvSchema<T>, source: EnvSource): T {
  const values: Record<string, unknown> = {};
  const problems: EnvProblem[] = [];
  for (const [name, def] of Object.entries(schema.keys)) {
    const raw = source[name];
    if (raw === undefined || raw === '') {
      if (def.hasDefault) values[name] = def.default;
      else if (def.optional) values[name] = undefined;
      else {
        problems.push({
          key: name,
          code: 'CFG_ENV_MISSING',
          message: `${name} is required.${def.description === '' ? '' : ` ${def.description}.`}`,
          fix: `Set ${name} in the environment or in the .env file.`,
        });
      }
      continue;
    }
    const parsed = parseValue(name, def, raw);
    if (parsed.ok) values[name] = parsed.value;
    else problems.push({ key: name, code: 'CFG_ENV_INVALID', message: parsed.message, fix: parsed.fix });
  }
  if (problems.length > 0) throw new EnvValidationError(problems);
  // The loop above builds exactly the shape that `T` describes, and `T` cannot be checked at run time.
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion
  return values as T;
}

/** Replaces secret values with a marker, for logs and diagnostics (CFG-05). */
export function redact(schema: EnvSchema<unknown>, values: object): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [name, def] of Object.entries(schema.keys)) {
    const value: unknown = Reflect.get(values, name);
    out[name] = def.secret && value !== undefined ? REDACTED : value;
  }
  return out;
}

/** Rows for `.env.example`. A secret never shows its value or its default (CFG-06). */
export function describeEnv<T>(schema: EnvSchema<T>): readonly EnvDescription[] {
  return Object.entries(schema.keys).map(([key, def]) => ({
    key,
    type: def.kind,
    required: !def.hasDefault && !def.optional,
    ...(def.hasDefault && !def.secret ? { default: String(def.default) } : {}),
    secret: def.secret,
    description: def.description,
    ...(def.values === undefined ? {} : { values: def.values }),
  }));
}
