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
  readonly validation?: Readonly<Record<string, unknown>>;
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
}
