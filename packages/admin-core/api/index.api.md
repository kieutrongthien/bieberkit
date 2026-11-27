<!--
  BieberKit

  @file        packages/admin-core/api/index.api.md
  @description API report of @bieberkit/admin-core: its public surface, checked in CI and reviewed in pull requests.
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

# API report: @bieberkit/admin-core

Generated from the built declaration files by `pnpm api:update`. Do not edit by hand. A change here is a change to the public API and needs a changeset (spec section 22.3).

```ts
interface DraftStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}
type Values = Readonly<Record<string, unknown>>;
export declare function isDirty(initial: Values, current: Values): boolean;
export declare const draftKey: (entity: string, id: string | undefined, userId: string) => string;
export declare function saveDraft(storage: DraftStorage, key: string, values: Values, now: number, skip?: ReadonlySet<string>): void;
export declare function loadDraft(storage: DraftStorage, key: string, now: number): Record<string, unknown> | undefined;
export declare function clearDraft(storage: DraftStorage, key: string): void;
interface Conflict {
  readonly key: string;
  readonly base: unknown;
  readonly mine: unknown;
  readonly theirs: unknown;
}
export declare function reapply(base: Values, mine: Values, theirs: Values): {
  values: Record<string, unknown>;
  conflicts: Conflict[];
};
type FilterOperator = "eq" | "ne" | "in" | "lt" | "lte" | "gt" | "gte" | "null";
interface Filter {
  readonly field: string;
  readonly op: FilterOperator;
  readonly value: string;
}
export declare function operatorsOf(kind: string): readonly FilterOperator[];
export declare function filterProblem(entity: MetaEntity, filter: Filter): string | undefined;
export declare function filterParams(entity: MetaEntity, filters: readonly Filter[]): Record<string, string>;
interface SavedView {
  readonly name: string;
  readonly filters: readonly Filter[];
  readonly sort?: string;
}
export declare const viewsKey: (entity: string, userId: string) => string;
export declare function loadViews(storage: DraftStorage, key: string): SavedView[];
export declare function saveView(storage: DraftStorage, key: string, view: SavedView): void;
export declare function deleteView(storage: DraftStorage, key: string, name: string): void;
export declare function viewToSearch(view: SavedView): {
  filters?: string;
  sort?: string;
};
export declare function viewFromSearch(search: Readonly<Record<string, unknown>>): SavedView;
interface CsvColumn {
  readonly key: string;
  readonly title: string;
}
export declare function csvOf(columns: readonly CsvColumn[], rows: readonly Readonly<Record<string, unknown>>[]): string;
export declare function exportPages(total: number, pageSize: number, limit: number): {
  pages: number;
  truncated: boolean;
};
interface BulkOutcome {
  readonly id: string;
  readonly status: string;
  readonly version?: number;
  readonly error?: {
    readonly code: string;
    readonly message: string;
  };
}
export declare function bulkSummary(outcomes: readonly BulkOutcome[]): {
  ok: number;
  failed: {
    id: string;
    message: string;
  }[];
};
interface MetaField {
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
  readonly values?: readonly string[];
  readonly validation?: Readonly<Record<string, unknown>>;
}
interface MetaEntity {
  readonly name: string;
  readonly path: string;
  readonly label: Readonly<Record<string, string>>;
  readonly operations: Readonly<Record<"list" | "get" | "create" | "update" | "delete", boolean>>;
  readonly can: Readonly<Record<"read" | "create" | "update" | "delete", boolean>>;
  readonly softDelete: boolean;
  readonly tenant: boolean;
  readonly title?: string;
  readonly icon?: string;
  readonly list: readonly string[];
  readonly form: readonly string[];
  readonly fields: readonly MetaField[];
}
interface MetaMenuItem {
  readonly label: string;
  readonly path: string;
  readonly permission?: string;
}
interface Meta {
  readonly schemaVersion: number;
  readonly entities: readonly MetaEntity[];
  readonly menu: readonly MetaMenuItem[];
  readonly permissions: readonly string[];
}
type Row = Readonly<Record<string, unknown>>;
interface Page {
  readonly rows: readonly Row[];
  readonly page: number;
  readonly pageSize: number;
  readonly total?: number;
}
interface SessionUser {
  readonly id: string;
  readonly email: string;
  readonly name: string;
}
interface ListParams {
  readonly page?: number;
  readonly pageSize?: number;
  readonly sort?: string;
  readonly fields?: readonly string[];
  readonly filters?: readonly Filter[];
}
type BulkOperation = {
  readonly operation: "update";
  readonly data: Row;
} | {
  readonly operation: "delete";
} | {
  readonly operation: "transition";
  readonly transition: string;
  readonly input?: Row;
};
type BulkResult = {
  readonly kind: "done";
  readonly outcomes: readonly BulkOutcome[];
} | {
  readonly kind: "queued";
  readonly jobId: string;
};
interface FieldProblem {
  readonly path: string;
  readonly code: string;
  readonly message: string;
}
export declare class AdminApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly fix: string;
  readonly problems: readonly FieldProblem[];
  readonly current: Row | undefined;
  constructor(status: number, code: string, message: string, fix: string, problems?: readonly FieldProblem[], current?: Row);
}
interface AdminClientOptions {
  readonly baseUrl?: string;
  readonly fetch?: typeof fetch;
}
interface AdminClient {
  session(): Promise<SessionUser | undefined>;
  signIn(email: string, password: string): Promise<SessionUser>;
  signOut(): Promise<void>;
  meta(): Promise<Meta>;
  list(entity: MetaEntity, params?: ListParams): Promise<Page>;
  get(entity: MetaEntity, id: string): Promise<Row>;
  create(entity: MetaEntity, body: Row): Promise<Row>;
  update(entity: MetaEntity, id: string, body: Row, version: number): Promise<Row>;
  remove(entity: MetaEntity, id: string, version: number): Promise<void>;
  bulk(entity: MetaEntity, items: readonly {
    readonly id: string;
    readonly version: number;
  }[], change: BulkOperation): Promise<BulkResult>;
}
export declare function createAdminClient(options?: AdminClientOptions): AdminClient;
type Locale = "en" | "vi" | "zh";
export declare const LOCALES: readonly Locale[];
declare const en: {
  readonly "app.name": "Admin";
  readonly "language.label": "Language";
  readonly "auth.signIn.title": "Sign in";
  readonly "auth.email": "Email";
  readonly "auth.password": "Password";
  readonly "auth.signIn": "Sign in";
  readonly "auth.signOut": "Sign out";
  readonly "auth.noAnswer": "The server did not answer. Try again.";
  readonly "welcome.title": "Welcome";
  readonly "welcome.empty": "Nothing here is open to you yet. Ask an administrator for a role.";
  readonly "gate.menuError": "The menu could not be loaded";
  readonly "gate.noAnswer": "The server did not answer";
  readonly "common.yes": "Yes";
  readonly "common.no": "No";
  readonly "common.cancel": "Cancel";
  readonly "common.delete": "Delete";
  readonly "list.new": "New";
  readonly "list.deleted": "Deleted";
  readonly "list.notDeleted": "The row was not deleted";
  readonly "list.confirmDelete": "Delete this row?";
  readonly "list.loadError": "The list could not be loaded";
  readonly "list.missing": "This screen does not exist, or it is not open to you.";
  readonly "list.filter": "Filter";
  readonly "list.filterField": "Field";
  readonly "list.filterOp": "Condition";
  readonly "list.filterValue": "Value";
  readonly "list.filterAdd": "Add filter";
  readonly "list.filterClear": "Clear filters";
  readonly "list.filterNull": "Empty or not";
  readonly "list.views": "Saved views";
  readonly "list.viewName": "Name of the view";
  readonly "list.viewSave": "Save view";
  readonly "list.viewDelete": "Delete view";
  readonly "list.viewSaved": "View saved";
  readonly "list.selected": "{count} selected";
  readonly "list.deleteSelected": "Delete selected";
  readonly "list.confirmDeleteMany": "Delete {count} rows?";
  readonly "list.bulkDone": "{count} rows done";
  readonly "list.bulkFailed": "{count} rows were not changed: {why}";
  readonly "list.bulkQueued": "This is a large change. It runs in the background.";
  readonly "list.export": "Export CSV";
  readonly "list.exportTruncated": "The file holds the first {limit} rows only. Narrow the filters to get the rest.";
  readonly "list.exportError": "The export failed";
  readonly "list.op.eq": "is";
  readonly "list.op.ne": "is not";
  readonly "list.op.in": "is one of";
  readonly "list.op.lt": "is less than";
  readonly "list.op.lte": "is at most";
  readonly "list.op.gt": "is more than";
  readonly "list.op.gte": "is at least";
  readonly "list.op.null": "is empty";
  readonly "form.saved": "Saved";
  readonly "form.notSaved": "The row was not saved";
  readonly "form.edit": "Edit {name}";
  readonly "form.new": "New {name}";
  readonly "form.save": "Save";
  readonly "form.conflictTitle": "Someone else changed this row";
  readonly "form.conflictBody": "Reload the page to see the new version, then make your change again.";
  readonly "form.rowLoadError": "The row could not be loaded";
  readonly "form.missing": "This screen does not exist.";
  readonly "shell.offline": "You are offline. Changes are not saved until the connection is back.";
  readonly "error.title": "Something went wrong";
  readonly "error.retry": "Try again";
  readonly "error.updated": "The application was updated. Reload the page to continue.";
  readonly "error.reload": "Reload";
  readonly "form.leave": "You have unsaved changes. Leave this page?";
  readonly "form.draftFound": "A draft of this form was found on this browser.";
  readonly "form.draftRestore": "Restore the draft";
  readonly "form.draftDiscard": "Discard it";
  readonly "conflict.changedBy": "Changed by {who} on {when}";
  readonly "conflict.unknownUser": "another user";
  readonly "conflict.field": "Field";
  readonly "conflict.mine": "Your value";
  readonly "conflict.theirs": "Their value";
  readonly "conflict.keepMine": "Keep my changes on top of theirs";
  readonly "conflict.takeTheirs": "Discard mine and take theirs";
};
type MessageKey = keyof typeof en;
type Dictionary = Readonly<Record<MessageKey, string>>;
export declare const MESSAGES: Readonly<Record<Locale, Dictionary>>;
export declare function translator(locale: Locale): (key: MessageKey, values?: Readonly<Record<string, string | number>>) => string;
export declare function localeOf(languages: readonly string[], saved: string | undefined, supported?: readonly Locale[]): Locale;
export declare function formatNumber(locale: Locale, value: number | string): string;
export declare function formatDate(locale: Locale, day: string): string;
export declare function formatDateTime(locale: Locale, instant: string, timeZone?: string): string;
export declare function formatMoney(locale: Locale, amount: string, currency: string): string;
export declare function labelOf(entity: MetaEntity, language: string): string;
export declare function columnsOf(entity: MetaEntity): readonly MetaField[];
export declare function formFieldsOf(entity: MetaEntity): readonly MetaField[];
export declare function listFields(entity: MetaEntity): readonly string[];
export declare function initialValues(entity: MetaEntity, row?: Row): Record<string, unknown>;
export declare function bodyOf(entity: MetaEntity, values: Readonly<Record<string, unknown>>, updating: boolean): Row;
export declare function allows(entity: MetaEntity, action: "create" | "update" | "delete"): boolean;
export declare const isNetworkFailure: (error: unknown) => boolean;
export declare function shouldRetry(failures: number, error: unknown): boolean;
export declare function backoffMs(attempt: number, random?: () => number): number;
interface Connection {
  readonly online: boolean;
}
type ConnectionEvent = "online" | "offline" | "request-failed" | "request-ok";
export declare function connection(state: Connection, event: ConnectionEvent): Connection;
export declare function isChunkError(error: unknown): boolean;
export declare function chunkReload(now: number, lastReloadAt: number | undefined): "reload" | "show";
type Shortcut = "save" | "new" | "search";
interface KeyPress {
  readonly key: string;
  readonly ctrl: boolean;
  readonly meta: boolean;
  readonly alt: boolean;
  readonly shift: boolean;
  readonly typing: boolean;
}
export declare function shortcutOf(press: KeyPress): Shortcut | undefined;
export declare function routeShape(path: string): string;
interface ErrorReport {
  readonly kind: string;
  readonly message: string;
  readonly frames: readonly string[];
  readonly route: string;
  readonly release?: string;
}
export declare function errorReport(error: unknown, context: {
  readonly route: string;
  readonly release?: string;
}): ErrorReport;
interface Vital {
  readonly name: string;
  readonly value: number;
  readonly rating: string;
}
interface VitalReport extends Vital {
  readonly route: string;
}
export declare function vitalReport(vital: Vital, path: string): VitalReport;
export declare function sampled(rate: number, random?: () => number): boolean;
export declare const packageName = "@bieberkit/admin-core";
export type { AdminClient, AdminClientOptions, BulkOperation, BulkOutcome, BulkResult, Conflict, Connection, ConnectionEvent, CsvColumn, DraftStorage, ErrorReport, FieldProblem, Filter, FilterOperator, KeyPress, ListParams, Locale, MessageKey, Meta, MetaEntity, MetaField, MetaMenuItem, Page, Row, SavedView, SessionUser, Shortcut, Vital, VitalReport };
```
