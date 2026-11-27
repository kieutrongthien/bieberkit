<!--
  BieberKit

  @file        packages/data/api/define-entity.api.md
  @description API report of @bieberkit/data: its public surface, checked in CI and reviewed in pull requests.
  @author      Bieber Kieu <kieutrongthien@gmail.com>
  @generated   pnpm api:update
  @copyright   Copyright (c) 2026 Bieber Kieu
  @license     Apache-2.0

  Licensed under the Apache License, Version 2.0 (the "License");
  you may not use this file except in compliance with the License.
  You may obtain a copy of the License at

      http://www.apache.org/licenses/LICENSE-2.0

  Unless required by applicable law or agreed to in writing, software
  distributed under the License is distributed on an "AS IS" BASIS,
  WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
  See the License for the specific language governing permissions and
  limitations under the License.

  SPDX-License-Identifier: Apache-2.0
-->

# API report: @bieberkit/data

Generated from the built declaration files by `pnpm api:update`. Do not edit by hand. A change here is a change to the public API and needs a changeset (spec section 22.3).

```ts
type Compare = "exact" | "ci" | "ci_ai";
declare function nfc(text: string): string;
declare function fold(mode: Compare, text: string): string;
declare function codePointLength(text: string): number;
type When = {
  readonly field: string;
  readonly eq: unknown;
} | {
  readonly field: string;
  readonly ne: unknown;
} | {
  readonly field: string;
  readonly in: readonly unknown[];
} | {
  readonly field: string;
  readonly set: boolean;
} | {
  readonly all: readonly When[];
} | {
  readonly any: readonly When[];
} | {
  readonly not: When;
};
declare const isUnset: (value: unknown) => boolean;
declare function evaluateWhen(when: When, values: Readonly<Record<string, unknown>>): boolean;
declare function whenFields(when: When): string[];
declare function mapWhenFields(when: When, rename: (name: string) => string): When;
declare function whenProblem(when: unknown, known: {
  has(name: string): boolean;
}, owner: string, depth?: number): string | undefined;
type FieldKind = "id" | "string" | "text" | "email" | "oneOf" | "int" | "boolean" | "date" | "dateTime" | "decimal" | "money" | "sequence" | "createdAt" | "updatedAt" | "belongsTo" | "hasOne" | "hasMany" | "state" | "custom";
interface SchemaValue {
  readonly _zod: unknown;
}
type ComputedFn = (row: Readonly<Record<string, unknown>>) => unknown;
interface TransitionDef {
  readonly from: readonly string[];
  readonly to: string;
  readonly permission?: string;
  readonly input?: SchemaValue;
}
interface ColumnDef {
  readonly type: string;
  readonly length?: number;
}
type ResetEvery = "year" | "month" | "never";
interface FieldAdmin {
  readonly visibleWhen?: When;
  readonly requiredWhen?: When;
  readonly widget?: string;
}
interface FieldDef {
  readonly kind: FieldKind;
  readonly optional?: true;
  readonly unique?: true;
  readonly index?: true;
  readonly searchable?: true;
  readonly aggregatable?: true;
  readonly encrypted?: true;
  readonly pii?: true;
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
  readonly admin?: FieldAdmin;
  readonly computed?: {
    readonly fn: ComputedFn;
    readonly stored: boolean;
  };
}
interface Chain<Self> {
  readonly def: FieldDef;
  optional(): Self;
  unique(): Self;
  index(): Self;
  searchable(): Self;
  aggregatable(): Self;
  localized(): Self;
  encrypted(): Self;
  pii(): Self;
  admin(options: FieldAdmin): Self;
}
type ComputedField = Chain<ComputedField>;
interface Scalar<Self, Default> extends Chain<Self> {
  default(value: Default): Self;
  computed(fn: ComputedFn, options?: {
    stored?: boolean;
  }): ComputedField;
}
interface NoDefault<Self> extends Chain<Self> {
  computed(fn: ComputedFn, options?: {
    stored?: boolean;
  }): ComputedField;
}
type IdField = Chain<IdField> & {
  default(value: unknown): IdField;
};
type StringField = Scalar<StringField, string>;
type TextField = Scalar<TextField, string>;
type EmailField = Scalar<EmailField, string>;
type OneOfField = Scalar<OneOfField, string>;
type IntField = Scalar<IntField, number>;
type BooleanField = Scalar<BooleanField, boolean>;
type DateField = Scalar<DateField, string>;
type DecimalField = Scalar<DecimalField, string>;
type DateTimeField = NoDefault<DateTimeField>;
type MoneyField = NoDefault<MoneyField>;
type SequenceField = Chain<SequenceField>;
type StampField = Chain<StampField>;
type BelongsToField = Chain<BelongsToField>;
type HasOneField = Chain<HasOneField>;
type HasManyField = Chain<HasManyField> & {
  inline(): HasManyField;
};
type StateField = Chain<StateField>;
type CustomField = Chain<CustomField>;
interface StringOptions {
  readonly min?: number;
  readonly max: number;
  readonly compare?: Compare;
}
interface StateOptions {
  readonly initial: string;
  readonly transitions: Readonly<Record<string, TransitionDef>>;
}
interface CustomOptions {
  readonly column: ColumnDef;
  readonly jsonSchema: Readonly<Record<string, unknown>>;
  readonly zod: SchemaValue;
  readonly tsType: string;
  readonly admin?: FieldAdmin;
}
declare class Field {
  #private;
  readonly def: FieldDef;
  constructor(def: FieldDef);
  optional(): Field;
  unique(): Field;
  index(): Field;
  admin(options: FieldAdmin): Field;
  searchable(): Field;
  aggregatable(): Field;
  localized(): Field;
  encrypted(): Field;
  pii(): Field;
  default(value: unknown): Field;
  computed(fn: ComputedFn, options?: {
    stored?: boolean;
  }): Field;
  inline(): Field;
}
interface FieldBuilders {
  id(): IdField;
  string(options: StringOptions): StringField;
  text(options?: {
    max?: number;
  }): TextField;
  email(): EmailField;
  oneOf(values: readonly string[]): OneOfField;
  int(options?: {
    min?: number;
    max?: number;
  }): IntField;
  boolean(): BooleanField;
  date(): DateField;
  dateTime(): DateTimeField;
  decimal(options: {
    precision: number;
    scale: number;
  }): DecimalField;
  money(options: {
    currency: string;
  }): MoneyField;
  sequence(options: {
    pattern: string;
    resetEvery?: ResetEvery;
  }): SequenceField;
  createdAt(): StampField;
  updatedAt(): StampField;
  belongsTo(target: () => EntityDef<string>): BelongsToField;
  hasOne(target: () => EntityDef<string>): HasOneField;
  hasMany(target: () => EntityDef<string>): HasManyField;
  state(options: StateOptions): StateField;
  custom(options: CustomOptions): CustomField;
}
declare const f: FieldBuilders;
type Feature = "attachments" | "comments" | "timeline" | "tags";
interface Permissions {
  readonly read?: string;
  readonly create?: string;
  readonly update?: string;
  readonly delete?: string;
  readonly fields?: Readonly<Record<string, {
    readonly read?: string;
    readonly update?: string;
  }>>;
}
interface ApiOptions {
  readonly list?: boolean;
  readonly get?: boolean;
  readonly create?: boolean;
  readonly update?: boolean;
  readonly delete?: boolean;
}
interface AdminOptions {
  readonly title?: string;
  readonly list?: readonly string[];
  readonly icon?: string;
}
interface ActionDef {
  readonly permission?: string;
  readonly handle: (...args: never[]) => unknown;
}
interface OrmOverride {
  readonly indexes?: readonly {
    readonly properties: readonly string[];
    readonly name?: string;
  }[];
  readonly uniques?: readonly {
    readonly properties: readonly string[];
    readonly name?: string;
  }[];
  readonly properties?: Readonly<Record<string, Readonly<Record<string, unknown>>>>;
}
interface FieldLike {
  readonly def: FieldDef;
}
interface EntityOptions<N extends string> {
  readonly name: N;
  readonly table: string;
  readonly tenant?: boolean;
  readonly softDelete?: boolean;
  readonly fields: Readonly<Record<string, FieldLike>>;
  readonly features?: readonly Feature[];
  readonly actions?: Readonly<Record<string, ActionDef>>;
  readonly permissions?: Permissions;
  readonly api?: ApiOptions;
  readonly admin?: AdminOptions;
  readonly label?: Readonly<Record<string, string>>;
  readonly orm?: OrmOverride;
}
interface EntityDef<N extends string> {
  readonly name: N;
  readonly table: string;
  readonly tenant: boolean;
  readonly softDelete: boolean;
  readonly fields: Readonly<Record<string, FieldDef>>;
  readonly features: readonly Feature[];
  readonly actions: Readonly<Record<string, ActionDef>>;
  readonly permissions: Permissions;
  readonly api: ApiOptions;
  readonly admin: AdminOptions;
  readonly label: Readonly<Record<string, string>>;
  readonly orm: OrmOverride;
}
declare function snake(name: string): string;
declare function defineEntity<const N extends string>(options: EntityOptions<N>): EntityDef<N>;
interface StandardColumn {
  readonly property: string;
  readonly column: string;
  readonly type: "uuid" | "integer" | "datetime" | "text";
  readonly nullable: boolean;
}
declare function standardColumns(def: EntityDef<string>): readonly StandardColumn[];
interface ConstraintDef {
  readonly name: string;
  readonly columns: readonly string[];
}
interface TableConstraints {
  readonly uniques: readonly ConstraintDef[];
  readonly indexes: readonly ConstraintDef[];
}
declare function tableConstraints(def: EntityDef<string>): TableConstraints;
export { evaluateWhen as A, FieldKind as C, TransitionDef as D, StateOptions as E, Compare as F, codePointLength as I, fold as L, mapWhenFields as M, whenFields as N, f as O, whenProblem as P, nfc as R, FieldDef as S, SchemaValue as T, ColumnDef as _, EntityDef as a, FieldAdmin as b, FieldLike as c, StandardColumn as d, TableConstraints as f, tableConstraints as g, standardColumns as h, ConstraintDef as i, isUnset as j, When as k, OrmOverride as l, snake as m, AdminOptions as n, EntityOptions as o, defineEntity as p, ApiOptions as r, Feature as s, ActionDef as t, Permissions as u, ComputedFn as v, ResetEvery as w, FieldBuilders as x, Field as y };
```
