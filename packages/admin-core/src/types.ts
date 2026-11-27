/**
 * BieberKit
 *
 * @file        packages/admin-core/src/types.ts
 * @description The types of the admin: what /api/v1/_meta answers (entities, fields, menu), a row, a page of rows, and the user of a session (UI-02, META-05).
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

import type { BulkOutcome, Filter } from './lists.ts';

/** A condition over the values of a form, as `_meta` carries it (UI-11). `field` is a key of the API. */
export type When =
  | { readonly field: string; readonly eq: unknown }
  | { readonly field: string; readonly ne: unknown }
  | { readonly field: string; readonly in: readonly unknown[] }
  | { readonly field: string; readonly set: boolean }
  | { readonly all: readonly When[] }
  | { readonly any: readonly When[] }
  | { readonly not: When };

/** One field of an entity as the metadata describes it. The admin draws a control from `widget` and checks with `validation`. */
export interface MetaField {
  readonly key: string;
  readonly kind: string;
  readonly widget: string;
  readonly required: boolean;
  readonly readOnly: boolean;
  readonly filterable: boolean;
  readonly sortable: boolean;
  readonly pii?: boolean;
  readonly encrypted?: boolean;
  readonly default?: unknown;
  /** The choices of a `oneOf` field. */
  readonly values?: readonly string[];
  /** The currency of a `money` field, and the digits of a `decimal` one. */
  readonly currency?: string;
  readonly precision?: number;
  readonly scale?: number;
  /** For a relation: the entity that it points to and where its rows are. */
  readonly target?: {
    readonly entity: string;
    readonly path: string;
    /** The key of the field that names a row of the target. */ readonly title?: string;
  };
  readonly validation?: Readonly<Record<string, unknown>>;
  /** The field is shown when this holds, and it is not sent when it does not. */
  readonly visibleWhen?: When;
  /** The field is required when this holds. */
  readonly requiredWhen?: When;
}

/** A move of the state field of an entity (MOD-06). `allowed` is whether the signed in user has its permission. */
export interface MetaTransition {
  readonly name: string;
  readonly from: readonly string[];
  readonly to: string;
  readonly permission: string;
  readonly allowed: boolean;
  /** `{id}` stands for the id of the row. */
  readonly path: string;
  /** The JSON Schema of what the transition asks for, when it asks for something. */
  readonly input?: Readonly<Record<string, unknown>>;
}

export interface MetaEntity {
  /** `module.Entity`. */
  readonly name: string;
  /** The path of its routes, such as `/api/v1/settings/settings`. */
  readonly path: string;
  /** The label of the entity by language (`en`, `vi`, `zh`). */
  readonly label: Readonly<Record<string, string>>;
  readonly operations: Readonly<Record<'list' | 'get' | 'create' | 'update' | 'delete', boolean>>;
  /** What the signed in user may do with the entity. */
  readonly can: Readonly<Record<'read' | 'create' | 'update' | 'delete', boolean>>;
  readonly features?: readonly string[];
  /** The keys of the fields that `q` looks in, when the entity can be searched. */
  readonly searchable?: readonly string[];
  readonly transitions?: readonly MetaTransition[];
  readonly softDelete: boolean;
  readonly tenant: boolean;
  /** The field that names a row. */
  readonly title?: string;
  readonly icon?: string;
  /** The keys of the columns of the list, in order. */
  readonly list: readonly string[];
  /** The keys of the fields of the form, in order. */
  readonly form: readonly string[];
  readonly fields: readonly MetaField[];
}

export interface MetaMenuItem {
  readonly label: string;
  readonly path: string;
  readonly permission?: string;
}

export interface Meta {
  readonly schemaVersion: number;
  readonly entities: readonly MetaEntity[];
  readonly menu: readonly MetaMenuItem[];
  readonly permissions: readonly string[];
}

/** A row as the API sends it: the fields of the entity and the standard columns (`id`, `version`, `createdAt`, ...). */
export type Row = Readonly<Record<string, unknown>>;

export interface Page {
  readonly rows: readonly Row[];
  readonly page: number;
  readonly pageSize: number;
  /** Present when the list asked for it. */
  readonly total?: number;
}

export interface SessionUser {
  readonly id: string;
  readonly email: string;
  readonly name: string;
}

export interface ListParams {
  readonly page?: number;
  readonly pageSize?: number;
  /** `name` or `-name`, comma separated. */
  readonly sort?: string;
  /** The keys to read, so that a wide entity stays fast (UI-15). Without it the API sends every field. */
  readonly fields?: readonly string[];
  /** The relations to send with each row, by name (`account` for `accountId`), so that a list can name a row and not show its id. */
  readonly include?: readonly string[];
  /** A text to look for: the rows where a searchable field starts with it (UI-11). */
  readonly q?: string;
  /** Conditions of the list, as `filter[field][op]=value`. They are checked against the metadata before they are sent (UI-03). */
  readonly filters?: readonly Filter[];
}

/** What a bulk call does to the rows that it names (API-14). */
export type BulkOperation =
  | { readonly operation: 'update'; readonly data: Row }
  | { readonly operation: 'delete' }
  | { readonly operation: 'transition'; readonly transition: string; readonly input?: Row };

/** The answer of a bulk call: the outcome of each row, or the id of the job when the call was too large to wait for. */
export type BulkResult =
  | { readonly kind: 'done'; readonly outcomes: readonly BulkOutcome[] }
  | { readonly kind: 'queued'; readonly jobId: string };
