/**
 * BieberKit
 *
 * @file        packages/data/src/schema/fields.ts
 * @description The field DSL: immutable descriptors built by f.*, with the checks that make a bad combination impossible (spec 10.1, ADR 0009).
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

import { dataError } from '../errors.ts';
import { minorUnitOf } from '../numbers/scaled.ts';
import { codePointLength } from '../text/fold.ts';
import type { Compare } from '../text/fold.ts';
import type { EntityDef } from './define-entity.ts';
import { decimalPattern } from './patterns.ts';

export type FieldKind =
  | 'id'
  | 'string'
  | 'text'
  | 'email'
  | 'oneOf'
  | 'int'
  | 'boolean'
  | 'date'
  | 'dateTime'
  | 'decimal'
  | 'money'
  | 'sequence'
  | 'createdAt'
  | 'updatedAt'
  | 'belongsTo'
  | 'hasOne'
  | 'hasMany'
  | 'state'
  | 'custom';

/** A Zod schema value. Functions are refused (SCH-07): a callback that receives `z` would keep all of Zod in the client bundle. */
export interface SchemaValue {
  readonly _zod: unknown;
}

export type ComputedFn = (row: Readonly<Record<string, unknown>>) => unknown;

export interface TransitionDef {
  readonly from: readonly string[];
  readonly to: string;
  readonly permission?: string;
  readonly input?: SchemaValue;
}

export interface ColumnDef {
  readonly type: string;
  readonly length?: number;
}

export type ResetEvery = 'year' | 'month' | 'never';

/** The plain data behind a field. It holds no library object except the schema values the author passed in. */
export interface FieldDef {
  readonly kind: FieldKind;
  readonly optional?: true;
  readonly unique?: true;
  readonly index?: true;
  readonly searchable?: true;
  readonly aggregatable?: true;
  readonly localized?: true;
  readonly inline?: true;
  readonly default?: unknown;
  readonly min?: number;
  readonly max?: number;
  readonly compare?: Compare;
  readonly values?: readonly string[];
  readonly precision?: number;
  readonly scale?: number;
  readonly currency?: string;
  readonly pattern?: string;
  readonly resetEvery?: ResetEvery;
  readonly target?: () => EntityDef<string>;
  readonly initial?: string;
  readonly transitions?: Readonly<Record<string, TransitionDef>>;
  readonly states?: readonly string[];
  readonly column?: ColumnDef;
  readonly jsonSchema?: Readonly<Record<string, unknown>>;
  readonly zod?: SchemaValue;
  readonly tsType?: string;
  readonly admin?: Readonly<Record<string, unknown>>;
  readonly computed?: { readonly fn: ComputedFn; readonly stored: boolean };
}

// Chain methods that every kind has at the type level. Whether a call is allowed is decided at run time with a clear message.
interface Chain<Self> {
  readonly def: FieldDef;
  optional(): Self;
  unique(): Self;
  index(): Self;
  searchable(): Self;
  aggregatable(): Self;
  localized(): Self;
}

/** What `.computed()` returns: the field is calculated, so it takes no default and no second `.computed()`. */
export type ComputedField = Chain<ComputedField>;

interface Scalar<Self, Default> extends Chain<Self> {
  default(value: Default): Self;
  computed(fn: ComputedFn, options?: { stored?: boolean }): ComputedField;
}

interface NoDefault<Self> extends Chain<Self> {
  computed(fn: ComputedFn, options?: { stored?: boolean }): ComputedField;
}

export type IdField = Chain<IdField> & { default(value: unknown): IdField };
export type StringField = Scalar<StringField, string>;
export type TextField = Scalar<TextField, string>;
export type EmailField = Scalar<EmailField, string>;
export type OneOfField = Scalar<OneOfField, string>;
export type IntField = Scalar<IntField, number>;
export type BooleanField = Scalar<BooleanField, boolean>;
export type DateField = Scalar<DateField, string>;
export type DecimalField = Scalar<DecimalField, string>;
export type DateTimeField = NoDefault<DateTimeField>;
export type MoneyField = NoDefault<MoneyField>;
export type SequenceField = Chain<SequenceField>;
export type StampField = Chain<StampField>;
export type BelongsToField = Chain<BelongsToField>;
export type HasOneField = Chain<HasOneField>;
export type HasManyField = Chain<HasManyField> & { inline(): HasManyField };
export type StateField = Chain<StateField>;
export type CustomField = Chain<CustomField>;

export interface StringOptions {
  readonly min?: number;
  readonly max: number;
  readonly compare?: Compare;
}

export interface StateOptions {
  readonly initial: string;
  readonly transitions: Readonly<Record<string, TransitionDef>>;
}

export interface CustomOptions {
  readonly column: ColumnDef;
  readonly jsonSchema: Readonly<Record<string, unknown>>;
  readonly zod: SchemaValue;
  readonly tsType: string;
  readonly admin?: Readonly<Record<string, unknown>>;
}

const INT_MIN = -2147483648;
const INT_MAX = 2147483647;
const TEXT_MAX = 65535;
const STRING_MAX = 4096;
const SCALAR_KINDS: ReadonlySet<FieldKind> = new Set<FieldKind>([
  'string',
  'text',
  'email',
  'oneOf',
  'int',
  'boolean',
  'date',
  'dateTime',
  'decimal',
  'money',
]);
const TEXT_KINDS: ReadonlySet<FieldKind> = new Set<FieldKind>(['string', 'text', 'email']);
/** What can be grouped by (all) or summed (`int` and `decimal`). Money needs a sum for each currency, and an instant needs a bucket: both come later. */
const AGGREGATABLE_KINDS: ReadonlySet<FieldKind> = new Set<FieldKind>([
  'string',
  'email',
  'oneOf',
  'boolean',
  'date',
  'int',
  'decimal',
  'belongsTo',
  'state',
]);

function invalid(message: string, fix: string): never {
  throw dataError('DATA_FIELD_INVALID', 500, message, fix);
}

function isWhole(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value);
}

function validDate(value: string): boolean {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (match === null) return false;
  const [year, month, day] = [Number(match[1]), Number(match[2]), Number(match[3])];
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

function freezeDef(def: FieldDef): FieldDef {
  return Object.freeze({ ...def });
}

/** One descriptor. Every method returns a new `Field`, so a definition can never be changed after it was built. */
export class Field {
  readonly def: FieldDef;

  constructor(def: FieldDef) {
    this.def = freezeDef(def);
  }

  #with(patch: Partial<FieldDef>): Field {
    return new Field({ ...this.def, ...patch });
  }

  #reject(what: string): never {
    return invalid(
      `${what} is not allowed on a ${this.def.kind} field.`,
      `Remove .${what.replace(/^\./, '')}() from this field, or use another kind.`,
    );
  }

  optional(): Field {
    if (['id', 'createdAt', 'updatedAt', 'sequence', 'state'].includes(this.def.kind)) this.#reject('.optional()');
    return this.#with({ optional: true });
  }

  unique(): Field {
    if (['id', 'text', 'hasOne', 'hasMany', 'money', 'createdAt', 'updatedAt', 'state'].includes(this.def.kind))
      this.#reject('.unique()');
    if (this.def.computed?.stored === false)
      invalid(
        'A computed field that is not stored cannot be unique.',
        'Pass { stored: true } to .computed(), or remove .unique().',
      );
    if (this.def.localized === true)
      invalid(
        'A localized field cannot be unique.',
        'Uniqueness per locale is not defined. Remove .localized() or .unique().',
      );
    return this.#with({ unique: true });
  }

  index(): Field {
    if (['id', 'text', 'hasOne', 'hasMany'].includes(this.def.kind)) this.#reject('.index()');
    if (this.def.computed?.stored === false)
      invalid(
        'A computed field that is not stored cannot be indexed.',
        'Pass { stored: true } to .computed(), or remove .index().',
      );
    return this.#with({ index: true });
  }

  searchable(): Field {
    if (!TEXT_KINDS.has(this.def.kind)) this.#reject('.searchable()');
    return this.#with({ searchable: true });
  }

  /** The field may be grouped by, or summed, in the aggregate endpoint (API-15). */
  aggregatable(): Field {
    if (!AGGREGATABLE_KINDS.has(this.def.kind)) this.#reject('.aggregatable()');
    if (this.def.computed?.stored === false)
      invalid(
        'A computed field that is not stored cannot be aggregated.',
        'Pass { stored: true } to .computed(), or remove .aggregatable().',
      );
    return this.#with({ aggregatable: true });
  }

  localized(): Field {
    if (!TEXT_KINDS.has(this.def.kind)) this.#reject('.localized()');
    if (this.def.unique === true)
      invalid(
        'A localized field cannot be unique.',
        'Uniqueness per locale is not defined. Remove .localized() or .unique().',
      );
    return this.#with({ localized: true });
  }

  default(value: unknown): Field {
    const { kind } = this.def;
    if (this.def.computed !== undefined)
      invalid('A computed field takes no default.', 'Remove .default(), or remove .computed().');
    const bad = (why: string): never =>
      invalid(
        `The default ${JSON.stringify(value)} is not valid for a ${kind} field: ${why}.`,
        'Give a default that fits the field.',
      );
    switch (kind) {
      case 'string':
      case 'text':
      case 'email': {
        if (typeof value !== 'string') return bad('it must be text');
        const length = codePointLength(value);
        if (length < (this.def.min ?? 0) || length > (this.def.max ?? STRING_MAX))
          return bad('it is outside the length limits');
        break;
      }
      case 'oneOf':
        if (typeof value !== 'string' || this.def.values?.includes(value) !== true)
          return bad('it is not one of the values');
        break;
      case 'int':
        if (!isWhole(value) || value < (this.def.min ?? INT_MIN) || value > (this.def.max ?? INT_MAX))
          return bad('it must be a whole number inside the range');
        break;
      case 'boolean':
        if (typeof value !== 'boolean') return bad('it must be true or false');
        break;
      case 'date':
        if (typeof value !== 'string' || !validDate(value)) return bad('it must be a real date written YYYY-MM-DD');
        break;
      case 'decimal': {
        const pattern = decimalPattern(this.def.precision ?? 15, this.def.scale ?? 0);
        if (typeof value !== 'string' || !new RegExp(pattern).test(value))
          return bad('it must be text that fits the precision and scale');
        break;
      }
      default:
        return this.#reject('.default()');
    }
    return this.#with({ default: value });
  }

  computed(fn: ComputedFn, options: { stored?: boolean } = {}): Field {
    if (!SCALAR_KINDS.has(this.def.kind)) this.#reject('.computed()');
    if (typeof fn !== 'function')
      invalid('.computed() needs a function.', 'Pass a function that calculates the value from the row.');
    if (this.def.default !== undefined)
      invalid('A computed field takes no default.', 'Remove .default(), or remove .computed().');
    const stored = options.stored === true;
    if (!stored && (this.def.index === true || this.def.unique === true)) {
      invalid(
        'A computed field that is not stored cannot be unique or indexed.',
        'Pass { stored: true } to .computed(), or remove .unique() and .index().',
      );
    }
    return this.#with({ computed: Object.freeze({ fn, stored }) });
  }

  inline(): Field {
    if (this.def.kind !== 'hasMany') this.#reject('.inline()');
    return this.#with({ inline: true });
  }
}

function checkLength(
  options: { min?: number; max?: number },
  limit: number,
  label: string,
): { min: number; max: number } {
  const { min = 0, max } = options;
  if (!isWhole(max) || max < 1 || max > limit)
    invalid(`${label} needs max, a whole number from 1 to ${limit}.`, `Set max between 1 and ${limit}.`);
  if (!isWhole(min) || min < 0 || min > max)
    invalid(`${label} has a min that is not between 0 and max.`, 'Set min to a whole number from 0 up to max.');
  return { min, max };
}

function checkThunk(target: unknown, label: string): () => EntityDef<string> {
  if (typeof target !== 'function')
    invalid(
      `${label} takes a function that returns the entity, for example () => User.`,
      'Wrap the entity in a function, so definitions can refer to each other in any order.',
    );
  // The function is the one the author wrote, and it returns an entity when it is called later.
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion
  return target as () => EntityDef<string>;
}

const TOKEN = /\{([^}]*)\}/g;

function checkPattern(pattern: string): void {
  if (pattern === '' || pattern.length > 64)
    invalid('A sequence pattern must have 1 to 64 characters.', "Use a pattern such as 'PO-{yyyy}-{seq:5}'.");
  let seq = 0;
  for (const [, token = ''] of pattern.matchAll(TOKEN)) {
    const width = /^seq:(\d+)$/.exec(token)?.[1];
    if (width !== undefined) {
      seq++;
      if (Number(width) < 1 || Number(width) > 12)
        invalid('{seq:N} needs a width from 1 to 12.', 'Write {seq:5} for five digits.');
    } else if (!['yyyy', 'yy', 'mm'].includes(token)) {
      invalid(`The sequence pattern has an unknown token {${token}}.`, 'Use {yyyy}, {yy}, {mm} and one {seq:N}.');
    }
  }
  if (seq !== 1)
    invalid('A sequence pattern needs exactly one {seq:N} token.', "Use a pattern such as 'PO-{yyyy}-{seq:5}'.");
}

function checkState(options: StateOptions): {
  transitions: Readonly<Record<string, TransitionDef>>;
  states: readonly string[];
} {
  if (typeof options.initial !== 'string' || options.initial === '')
    invalid('f.state needs a non-empty initial state.', "Set initial, for example 'draft'.");
  const names = Object.keys(options.transitions ?? {});
  if (names.length === 0)
    invalid(
      'f.state needs at least one transition.',
      'Declare transitions such as { submit: { from: ["draft"], to: "submitted" } }.',
    );
  const states = [options.initial];
  const transitions: Record<string, TransitionDef> = {};
  for (const name of names) {
    const transition = options.transitions[name];
    if (!/^[a-z][A-Za-z0-9]*$/.test(name))
      invalid(`The transition name "${name}" is not valid.`, 'Use camel case, starting with a lower case letter.');
    if (
      transition === undefined ||
      !Array.isArray(transition.from) ||
      transition.from.length === 0 ||
      transition.from.some((from) => typeof from !== 'string' || from === '')
    ) {
      invalid(`The transition "${name}" needs a non-empty from list.`, 'List the states it can start from.');
    }
    if (typeof transition.to !== 'string' || transition.to === '')
      invalid(`The transition "${name}" needs a to state.`, 'Name the state it leads to.');
    for (const state of [...transition.from, transition.to]) if (!states.includes(state)) states.push(state);
    transitions[name] = Object.freeze({
      from: Object.freeze([...transition.from]),
      to: transition.to,
      ...(transition.permission === undefined ? {} : { permission: transition.permission }),
      ...(transition.input === undefined ? {} : { input: transition.input }),
    });
  }
  return { transitions: Object.freeze(transitions), states: Object.freeze(states) };
}

export interface FieldBuilders {
  id(): IdField;
  string(options: StringOptions): StringField;
  text(options?: { max?: number }): TextField;
  email(): EmailField;
  oneOf(values: readonly string[]): OneOfField;
  int(options?: { min?: number; max?: number }): IntField;
  boolean(): BooleanField;
  date(): DateField;
  dateTime(): DateTimeField;
  decimal(options: { precision: number; scale: number }): DecimalField;
  money(options: { currency: string }): MoneyField;
  sequence(options: { pattern: string; resetEvery?: ResetEvery }): SequenceField;
  createdAt(): StampField;
  updatedAt(): StampField;
  belongsTo(target: () => EntityDef<string>): BelongsToField;
  hasOne(target: () => EntityDef<string>): HasOneField;
  hasMany(target: () => EntityDef<string>): HasManyField;
  state(options: StateOptions): StateField;
  custom(options: CustomOptions): CustomField;
}

/** The field builders of spec 10.1. */
export const f: FieldBuilders = {
  id: () => new Field({ kind: 'id' }),
  string: (options) => {
    const { min, max } = checkLength(options, STRING_MAX, 'f.string');
    if (options.compare !== undefined && !['exact', 'ci', 'ci_ai'].includes(options.compare))
      invalid('compare must be exact, ci or ci_ai.', 'Choose one of the three comparison modes.');
    return new Field({ kind: 'string', min, max, compare: options.compare ?? 'exact' });
  },
  text: (options = {}) =>
    new Field({
      kind: 'text',
      min: 0,
      max: checkLength({ max: options.max ?? TEXT_MAX }, TEXT_MAX, 'f.text').max,
      compare: 'exact',
    }),
  email: () => new Field({ kind: 'email', min: 0, max: 254, compare: 'ci' }),
  oneOf: (values) => {
    if (!Array.isArray(values) || values.length === 0)
      invalid('f.oneOf needs a non-empty list of values.', "Write f.oneOf(['a', 'b']).");
    if (values.some((value) => typeof value !== 'string' || value === '' || value.length > 64))
      invalid('f.oneOf values must be non-empty text of at most 64 characters.', 'Shorten or remove the value.');
    if (new Set(values).size !== values.length)
      invalid('f.oneOf values must be different from each other.', 'Remove the repeated value.');
    return new Field({ kind: 'oneOf', values: Object.freeze([...values]) });
  },
  int: (options = {}) => {
    const { min = INT_MIN, max = INT_MAX } = options;
    if (!isWhole(min) || !isWhole(max) || min < INT_MIN || max > INT_MAX || min > max) {
      invalid(
        'f.int needs min and max as whole numbers inside the range of a 32 bit integer, with min not above max.',
        'Use f.decimal with scale 0 for larger whole numbers.',
      );
    }
    return new Field({ kind: 'int', min, max });
  },
  boolean: () => new Field({ kind: 'boolean' }),
  date: () => new Field({ kind: 'date' }),
  dateTime: () => new Field({ kind: 'dateTime' }),
  decimal: (options) => {
    const { precision, scale } = options;
    if (!isWhole(precision) || precision < 1 || precision > 15 || !isWhole(scale) || scale < 0 || scale > precision) {
      invalid(
        'f.decimal needs a precision from 1 to 15 and a scale from 0 up to the precision.',
        'At most 15 digits always fit the safe integer range (DATA-22).',
      );
    }
    return new Field({ kind: 'decimal', precision, scale });
  },
  money: (options) => {
    minorUnitOf(options.currency);
    return new Field({ kind: 'money', currency: options.currency });
  },
  sequence: (options) => {
    checkPattern(options.pattern);
    if (options.resetEvery !== undefined && !['year', 'month', 'never'].includes(options.resetEvery))
      invalid('resetEvery must be year, month or never.', 'Choose one of the three.');
    return new Field({
      kind: 'sequence',
      pattern: options.pattern,
      resetEvery: options.resetEvery ?? 'never',
      unique: true,
    });
  },
  createdAt: () => new Field({ kind: 'createdAt' }),
  updatedAt: () => new Field({ kind: 'updatedAt' }),
  belongsTo: (target) => new Field({ kind: 'belongsTo', target: checkThunk(target, 'f.belongsTo') }),
  hasOne: (target) => new Field({ kind: 'hasOne', target: checkThunk(target, 'f.hasOne') }),
  hasMany: (target) => new Field({ kind: 'hasMany', target: checkThunk(target, 'f.hasMany') }),
  state: (options) => {
    const { transitions, states } = checkState(options);
    return new Field({ kind: 'state', initial: options.initial, transitions, states });
  },
  custom: (options) => {
    if (typeof options.zod === 'function') {
      throw dataError(
        'DATA_FIELD_CUSTOM_CALLBACK',
        500,
        'f.custom takes a schema value for zod, not a function.',
        'Pass the schema itself, for example zod: z.string(). A callback that receives z keeps all of Zod in the client bundle (SCH-07).',
      );
    }
    if (typeof options.column?.type !== 'string' || options.column.type === '')
      invalid('f.custom needs column.type.', "Set column: { type: 'varchar', length: 20 }.");
    if (typeof options.jsonSchema !== 'object' || options.jsonSchema === null || Array.isArray(options.jsonSchema))
      invalid('f.custom needs jsonSchema as an object.', 'Pass the JSON Schema of the value.');
    if (typeof options.tsType !== 'string' || options.tsType === '')
      invalid('f.custom needs tsType, the TypeScript type of the value as text.', "Set tsType: 'string'.");
    if (typeof options.zod !== 'object' || options.zod === null)
      invalid('f.custom needs zod, a schema value.', 'Pass the schema itself, for example zod: z.string().');
    return new Field({
      kind: 'custom',
      column: Object.freeze({ ...options.column }),
      jsonSchema: options.jsonSchema,
      zod: options.zod,
      tsType: options.tsType,
      ...(options.admin === undefined ? {} : { admin: options.admin }),
    });
  },
};
