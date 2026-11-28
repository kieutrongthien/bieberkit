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
export declare const sameView: (a: SavedView, b: SavedView) => boolean;
export declare function viewToSearch(view: SavedView): {
  filters?: readonly Filter[];
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
export declare const PAGE_SIZES: readonly number[];
export declare const shouldVirtualize: (rows: number) => boolean;
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
  readonly accept?: readonly string[];
  readonly currency?: string;
  readonly precision?: number;
  readonly scale?: number;
  readonly target?: {
    readonly entity: string;
    readonly path: string;
     readonly title?: string;
  };
  readonly validation?: Readonly<Record<string, unknown>>;
  readonly visibleWhen?: When;
  readonly requiredWhen?: When;
}
interface MetaTransition {
  readonly name: string;
  readonly from: readonly string[];
  readonly to: string;
  readonly permission: string;
  readonly allowed: boolean;
  readonly path: string;
  readonly input?: Readonly<Record<string, unknown>>;
}
interface MetaInline {
  readonly name: string;
  readonly entity: string;
  readonly label: Readonly<Record<string, string>>;
  readonly title?: string;
  readonly fields: readonly MetaField[];
  readonly form: readonly string[];
  readonly can: Readonly<Record<"create" | "update" | "delete", boolean>>;
}
interface MetaEntity {
  readonly name: string;
  readonly path: string;
  readonly label: Readonly<Record<string, string>>;
  readonly operations: Readonly<Record<"list" | "get" | "create" | "update" | "delete", boolean>>;
  readonly can: Readonly<Record<"read" | "create" | "update" | "delete", boolean>>;
  readonly features?: readonly string[];
  readonly inline?: readonly MetaInline[];
  readonly searchable?: readonly string[];
  readonly transitions?: readonly MetaTransition[];
  readonly softDelete: boolean;
  readonly tenant: boolean;
  readonly title?: string;
  readonly icon?: string;
  readonly list: readonly string[];
  readonly form: readonly string[];
  readonly fields: readonly MetaField[];
}
type MetaLabel = Readonly<Record<string, string>>;
interface Meta {
  readonly schemaVersion: number;
  readonly entities: readonly MetaEntity[];
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
  readonly twoFactorEnabled?: true;
}
interface ListParams {
  readonly page?: number;
  readonly pageSize?: number;
  readonly sort?: string;
  readonly fields?: readonly string[];
  readonly include?: readonly string[];
  readonly q?: string;
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
  readonly retryAfter: number | undefined;
  constructor(status: number, code: string, message: string, fix: string, problems?: readonly FieldProblem[], current?: Row, retryAfter?: number);
}
interface AdminClientOptions {
  readonly baseUrl?: string;
  readonly fetch?: typeof fetch;
}
interface RequestInput {
  readonly body?: unknown;
  readonly headers?: Readonly<Record<string, string>>;
}
interface AdminClient {
  request(method: string, path: string, input?: RequestInput): Promise<unknown>;
  session(): Promise<SessionUser | undefined>;
  signOut(): Promise<void>;
  meta(): Promise<Meta>;
  list(entity: MetaEntity, params?: ListParams): Promise<Page>;
  get(entity: MetaEntity, id: string): Promise<Row>;
  create(entity: MetaEntity, body: Row): Promise<Row>;
  update(entity: MetaEntity, id: string, body: Row, version: number): Promise<Row>;
  remove(entity: MetaEntity, id: string, version: number): Promise<void>;
  transition(entity: MetaEntity, id: string, name: string, version: number, input?: Row): Promise<Row>;
  bulk(entity: MetaEntity, items: readonly {
    readonly id: string;
    readonly version: number;
  }[], change: BulkOperation): Promise<BulkResult>;
}
export declare function createAdminClient(options?: AdminClientOptions): AdminClient;
declare const en: {
  readonly "app.name": "Admin";
  readonly "language.label": "Language";
  readonly "auth.signOut": "Sign out";
  readonly "brand.tagline": "One tidy kit. Every change on record.";
  readonly "menu.label": "Main menu";
  readonly "menu.group.app": "Application";
  readonly "menu.group.people": "People";
  readonly "menu.group.content": "Content";
  readonly "menu.group.system": "System";
  readonly "account.menu": "Account menu";
  readonly "goto.button": "Go to a page…";
  readonly "goto.title": "Go to a page";
  readonly "goto.placeholder": "Name of a page";
  readonly "goto.none": "No page has that name.";
  readonly "breadcrumb.label": "Where you are";
  readonly "gate.loading": "Loading…";
  readonly "welcome.subtitle": "Choose where to start.";
  readonly "welcome.title": "Welcome";
  readonly "welcome.empty": "Nothing here is open to you yet. Ask an administrator for a role.";
  readonly "gate.menuError": "The menu could not be loaded";
  readonly "gate.noAnswer": "The server did not answer";
  readonly "common.yes": "Yes";
  readonly "common.no": "No";
  readonly "common.close": "Close";
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
  readonly "list.moves": "Move to";
  readonly "list.moved": "{name} done";
  readonly "list.notMoved": "The move was not made";
  readonly "list.setField": "Change a field";
  readonly "list.apply": "Apply";
  readonly "list.notChanged": "The rows were not changed";
  readonly "list.selectRow": "Select {name}";
  readonly "list.sort": "Sort by";
  readonly "detail.details": "Details";
  readonly "detail.newRelated": "New {name}";
  readonly "detail.noRelated": "Nothing yet";
  readonly "detail.computed": "Filled in by the server";
  readonly "field.noControl": "No plugin gives a control for files, so this field cannot be changed here.";
  readonly "relation.search": "Type to search";
  readonly "relation.pick": "Pick one";
  readonly "relation.none": "Nothing found";
  readonly "lines.invalid": "Some lines are not valid";
  readonly "lines.none": "No lines yet";
  readonly "lines.add": "Add {name}";
  readonly "lines.remove": "Remove";
  readonly "lines.removeLine": "Remove {name}";
  readonly "plugin.failed": "This part could not be shown";
  readonly "page.closed": "This page is not open to you";
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
  readonly "problem.required": "This field is required";
  readonly "problem.tooShort": "At least {min} characters";
  readonly "problem.tooLong": "At most {max} characters";
  readonly "problem.tooSmall": "At least {min}";
  readonly "problem.tooBig": "At most {max}";
  readonly "problem.pattern": "The value is not in the form that is expected";
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
  readonly "account.mine": "My account";
};
type MessageKey = keyof typeof en;
type Dictionary = Readonly<Record<MessageKey, string>>;
type Locale = "en" | "vi" | "zh";
export declare const LOCALES: readonly Locale[];
export declare function loadMessages(locale: Locale): Promise<Dictionary>;
export declare function fillText(text: string, values?: Readonly<Record<string, string | number>>): string;
export declare function translator(dictionary?: Dictionary): (key: MessageKey, values?: Readonly<Record<string, string | number>>) => string;
export declare function localeOf(languages: readonly string[], saved: string | undefined, supported?: readonly Locale[]): Locale;
export declare function formatNumber(locale: Locale, value: number | string): string;
export declare function formatDate(locale: Locale, day: string): string;
export declare function formatDateTime(locale: Locale, instant: string, timeZone?: string): string;
export declare function formatMoney(locale: Locale, amount: string, currency: string): string;
type Load<C> = () => Promise<{
  default: C;
}>;
interface Contribution<C> {
  readonly id: string;
  readonly load: Load<C>;
  readonly permission?: string;
}
interface MenuContribution {
  readonly page: string;
  readonly group?: string;
  readonly icon?: string;
  readonly permission?: string;
}
interface PageContribution<C> {
  readonly path: string;
  readonly title: string;
  readonly load: Load<C>;
  readonly permission?: string;
}
interface GateState {
  readonly metaError: unknown;
}
type Texts = Readonly<Record<string, string>>;
interface AdminPartInput<C> {
  readonly name: string;
  readonly menu?: readonly MenuContribution[];
  readonly pages?: readonly PageContribution<C>[];
  readonly headerActions?: readonly Contribution<C>[];
  readonly notices?: readonly Contribution<C>[];
  readonly recordTabs?: readonly (Contribution<C> & {
    readonly entity: string;
    readonly title: string;
  })[];
  readonly fields?: readonly (Contribution<C> & {
    readonly widget: string;
  })[];
  readonly homeBlocks?: readonly (Contribution<C> & {
    readonly title: string;
  })[];
  readonly accountTabs?: readonly (Contribution<C> & {
    readonly title: string;
  })[];
  readonly publicPages?: readonly {
    readonly path: string;
    readonly load: Load<C>;
  }[];
  readonly signIn?: {
    readonly load: Load<C>;
  };
  readonly gates?: readonly (Contribution<C> & {
    readonly needed: (state: GateState) => boolean;
  })[];
  readonly screens?: readonly (Contribution<C> & {
    readonly replace: `list:${string}` | `form:${string}`;
  })[];
  readonly messages?: Partial<Record<Locale, () => Promise<{
    default: Texts;
  }>>>;
}
type AdminPart<C> = AdminPartInput<C>;
type AdminView = ((props: never) => unknown) | (new (props: never) => unknown);
export declare function defineAdminPlugin<C = AdminView>(input: AdminPartInput<NoInfer<C>>): AdminPart<C>;
export declare function shortNameOf(name: string): string;
interface AdminProblem {
  readonly plugin: string;
  readonly code: string;
  readonly message: string;
}
type Slot<C, K extends keyof AdminPartInput<C>> = NonNullable<AdminPartInput<C>[K]> extends readonly (infer T)[] ? T : never;
type Owned<T> = T & {
  readonly plugin: string;
};
interface AdminRegistry<C> {
  readonly menu: readonly Owned<MenuContribution>[];
  readonly pages: readonly Owned<Slot<C, "pages">>[];
  readonly headerActions: readonly Owned<Slot<C, "headerActions">>[];
  readonly notices: readonly Owned<Slot<C, "notices">>[];
  readonly recordTabs: readonly Owned<Slot<C, "recordTabs">>[];
  readonly fields: readonly Owned<Slot<C, "fields">>[];
  readonly homeBlocks: readonly Owned<Slot<C, "homeBlocks">>[];
  readonly accountTabs: readonly Owned<Slot<C, "accountTabs">>[];
  readonly publicPages: readonly Owned<Slot<C, "publicPages">>[];
  readonly signIn: Owned<NonNullable<AdminPartInput<C>["signIn"]>> | undefined;
  readonly gates: readonly Owned<Slot<C, "gates">>[];
  readonly screens: readonly Owned<Slot<C, "screens">>[];
  readonly parts: readonly AdminPart<C>[];
}
export declare function composeAdmin<C>(parts: readonly AdminPart<C>[]): {
  readonly admin: AdminRegistry<C>;
  readonly problems: readonly AdminProblem[];
};
export declare function messageProblems<C>(parts: readonly AdminPart<C>[], languages: readonly string[]): Promise<readonly AdminProblem[]>;
export declare function allowed<T extends {
  readonly permission?: string;
}>(items: readonly T[], can: ReadonlySet<string>): readonly T[];
export declare function labelOf(entity: MetaEntity, language: string): string;
export declare function columnsOf(entity: MetaEntity): readonly MetaField[];
export declare function formFieldsOf(entity: MetaEntity): readonly MetaField[];
export declare function listFields(entity: MetaEntity): readonly string[];
export declare function initialValues(entity: MetaEntity, row?: Row): Record<string, unknown>;
export declare function bodyOf(entity: MetaEntity, values: Readonly<Record<string, unknown>>, updating: boolean): Row;
export declare function titleOf(entity: MetaEntity | undefined, row: Row, hint?: string): string;
export declare function includeOf(entity: MetaEntity): readonly string[];
export declare function relationLabel(entities: readonly MetaEntity[], field: MetaField, row: Row): string | undefined;
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
type Shortcut = "save" | "new" | "search" | "goto";
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
export declare function ratingOf(name: string, value: number): "good" | "needs-improvement" | "poor";
export declare function dedupe(seen: Set<string>, report: {
  readonly kind: string;
  readonly message: string;
  readonly route: string;
}, max?: number): boolean;
export declare function stateKeyOf(entity: MetaEntity): string | undefined;
export declare function transitionsFor(entity: MetaEntity, row: Row): readonly MetaTransition[];
export declare function commonTransitions(entity: MetaEntity, rows: readonly Row[]): readonly MetaTransition[];
export declare function inputFieldsOf(schema: Readonly<Record<string, unknown>> | undefined): readonly MetaField[];
export declare function patchRow(rows: readonly Row[], id: string, patch: Readonly<Record<string, unknown>>): Row[];
export declare function transitionPatch(entity: MetaEntity, transition: MetaTransition, row: Row): Record<string, unknown>;
interface ValueProblem {
  readonly code: "required" | "tooShort" | "tooLong" | "tooSmall" | "tooBig" | "pattern";
  readonly values: Readonly<Record<string, number>>;
}
export declare function problemOf(field: MetaField, value: unknown, required?: boolean): ValueProblem | undefined;
export declare const isUnset: (value: unknown) => boolean;
export declare function evaluateWhen(when: When, values: Readonly<Record<string, unknown>>): boolean;
interface FieldStates {
  readonly visible: ReadonlySet<string>;
  readonly required: ReadonlySet<string>;
}
export declare function statesOf(fields: readonly MetaField[], values: Readonly<Record<string, unknown>>): FieldStates;
export declare function visibleValues(fields: readonly MetaField[], values: Readonly<Record<string, unknown>>): Record<string, unknown>;
export declare const conditionalFields: (entity: MetaEntity) => readonly MetaField[];
interface Related {
  readonly entity: MetaEntity;
  readonly via: MetaField;
}
export declare function relatedOf(meta: Meta, entity: MetaEntity): readonly Related[];
export declare const relatedFilter: (related: Related, id: string) => Filter;
export declare const relatedDefaults: (related: Related, id: string) => Readonly<Record<string, string>>;
export declare function prefillOf(form: readonly MetaField[], search: Readonly<Record<string, unknown>>): Record<string, string>;
export declare function readOnlyOf(entity: MetaEntity, row: Row): {
  readonly key: string;
  readonly value: unknown;
}[];
type Line = Record<string, unknown>;
export declare const MAX_LINES = 200;
export declare const editableInline: (entity: MetaEntity) => readonly MetaInline[];
export declare function initialLines(entity: MetaEntity, row?: Row): Record<string, Line[]>;
export declare function linesBody(entity: MetaEntity, lines: Readonly<Record<string, readonly Line[]>>, changed: ReadonlySet<string>): Record<string, Row[]>;
export declare function lineProblems(inline: MetaInline, line: Readonly<Line>): {
  key: string;
  problem: ValueProblem;
}[];
export declare function linesChanged(inline: MetaInline, start: readonly Line[], now: readonly Line[]): boolean;
export declare const newLine: (inline: MetaInline) => Line;
export declare function labelText(label: MetaLabel | undefined, locale: string, fallback?: string): string;
interface BrandSettings {
  readonly name?: string;
  readonly logo?: string;
  readonly tagline?: string | MetaLabel;
}
interface MenuGroupSettings {
  readonly id: string;
  readonly label?: string | MetaLabel;
  readonly items: readonly string[];
}
interface AdminSettings {
  readonly brand?: BrandSettings;
  readonly menu?: readonly MenuGroupSettings[];
}
export declare const BUILTIN_MENU_GROUPS: readonly string[];
export declare function parseAdminSettings(input: unknown): AdminSettings;
export declare const adminSection: {
  readonly key: "admin";
  readonly parser: {
    parse(input: unknown): AdminSettings | undefined;
  };
};
export declare function readAdminSettings(text: string | null | undefined): AdminSettings;
interface MenuEntry {
  readonly key: string;
  readonly path: string;
  readonly label: MetaLabel;
  readonly name: string;
  readonly icons: readonly string[];
}
interface MenuGroup {
  readonly id: string;
  readonly label?: string | MetaLabel;
  readonly entries: readonly MenuEntry[];
}
interface MenuPage {
  readonly path: string;
  readonly module: string;
  readonly label: MetaLabel;
  readonly icons: readonly string[];
  readonly group?: string;
}
export declare const DEFAULT_MENU: readonly MenuGroupSettings[];
export declare function menuOf(meta: Meta, order?: readonly MenuGroupSettings[], pages?: readonly MenuPage[]): MenuGroup[];
export declare function searchMenu(groups: readonly MenuGroup[], text: string, labelOfEntry: (entry: MenuEntry) => string): MenuEntry[];
export declare function currentEntry(groups: readonly MenuGroup[], path: string): {
  readonly group: MenuGroup;
  readonly entry: MenuEntry;
} | undefined;
export declare const packageName = "@bieberkit/admin-core";
export { type AdminClient, type AdminClientOptions, type AdminPart, type AdminPartInput, type AdminProblem, type AdminRegistry, type AdminSettings, type AdminView, type BrandSettings, type BulkOperation, type BulkOutcome, type BulkResult, type Conflict, type Connection, type ConnectionEvent, type Contribution, type CsvColumn, type Dictionary, type DraftStorage, en as ENGLISH, type ErrorReport, type FieldProblem, type FieldStates, type Filter, type FilterOperator, type GateState, type KeyPress, type Line, type ListParams, type Load, type Locale, type MenuContribution, type MenuEntry, type MenuGroup, type MenuGroupSettings, type MenuPage, type MessageKey, type Meta, type MetaEntity, type MetaField, type MetaInline, type MetaLabel, type MetaTransition, type Owned, type Page, type PageContribution, type Related, type RequestInput, type Row, type SavedView, type SessionUser, type Shortcut, type Texts, type ValueProblem, type Vital, type VitalReport, type When };
```
