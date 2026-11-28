/**
 * BieberKit
 *
 * @file        packages/admin-core/src/fixtures/text-adapter.ts
 * @description A second UI adapter, as a test fixture: it draws the generic screens as plain text with nothing but the public functions of admin-core, to prove that the contract does not lean on React or Ant Design (UI-10, spec section 26).
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

import { AdminApiError, createAdminClient } from '../client.ts';
import type { AdminClient } from '../client.ts';
import { loadMessages, translator } from '../i18n.ts';
import type { Locale } from '../i18n.ts';
import {
  bulkSummary,
  csvOf,
  exportPages,
  filterParams,
  filterProblem,
  loadViews,
  PAGE_SIZES,
  saveView,
  viewsKey,
} from '../lists.ts';
import type { Filter, SavedView } from '../lists.ts';
import { allowed, composeAdmin } from '../compose.ts';
import type { AdminProblem, AdminRegistry } from '../compose.ts';
import type { AdminPart } from '../part.ts';
import { allows, bodyOf, columnsOf, formFieldsOf, initialValues, labelOf, listFields } from '../screens.ts';
import { commonTransitions, inputFieldsOf, patchRow, transitionPatch, transitionsFor } from '../transitions.ts';
import type { DraftStorage } from '../drafts.ts';
import { reapply } from '../drafts.ts';
import type { Meta, MetaEntity, Page, Row } from '../types.ts';
import { problemOf } from '../validation.ts';

const text = (value: unknown): string =>
  value === null || value === undefined
    ? ''
    : typeof value === 'object'
      ? JSON.stringify(value)
      : typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean'
        ? String(value)
        : '';

/**
 * An adapter that draws with text. It keeps what a screen of any adapter keeps (the filters, the page, the selection and the language),
 * calls `AdminClient` for everything, and asks `admin-core` for what to draw. It owns no rule of the admin: if a rule were missing from
 * `admin-core`, this is the file that would have to write it, and the test of it would say so.
 */
export class TextAdmin {
  readonly client: AdminClient;
  private readonly storage: DraftStorage;
  private meta: Meta | undefined;
  private t: ReturnType<typeof translator> = translator();
  locale: Locale = 'en';
  filters: readonly Filter[] = [];
  sort: string | undefined;
  page = 1;
  pageSize: number = PAGE_SIZES[0] ?? 25;
  selected: readonly Row[] = [];
  last: Page = { rows: [], page: 1, pageSize: 25 };

  constructor(client: AdminClient, storage: DraftStorage) {
    this.client = client;
    this.storage = storage;
  }

  static over(fetch: typeof globalThis.fetch, storage: DraftStorage): TextAdmin {
    return new TextAdmin(createAdminClient({ fetch }), storage);
  }

  async start(locale: Locale): Promise<void> {
    this.meta = await this.client.meta();
    this.locale = locale;
    this.t = translator(await loadMessages(locale));
  }

  /** What the admin parts of plugins add. This adapter draws a component as its name, which is a text. */
  private added: AdminRegistry<string> = composeAdmin<string>([]).admin;

  use(parts: readonly AdminPart<string>[]): readonly AdminProblem[] {
    const { admin, problems } = composeAdmin(parts);
    this.added = admin;
    return problems;
  }

  /** The pages of plugins that the person may open, as lines of the menu. */
  pluginMenu(): string[] {
    return allowed(this.added.pages, new Set(this.meta?.permissions)).map((page) => `${page.title} -> ${page.path}`);
  }

  homeBlocks(): string[] {
    return this.added.homeBlocks.map((block) => block.id);
  }

  replacedBy(kind: 'list' | 'form', entity: string): string | undefined {
    return this.added.screens.find((screen) => screen.replace === `${kind}:${entity}`)?.id;
  }

  fieldWidget(name: string): string | undefined {
    return this.added.fields.find((field) => field.widget === name)?.id;
  }

  /** The menu: the entities that the user may read and list, by their label in the language. */
  menu(): string[] {
    return (this.meta?.entities ?? [])
      .filter((entity) => entity.operations.list && entity.can.read)
      .map((entity) => labelOf(entity, this.locale));
  }

  entity(name: string): MetaEntity {
    const found = this.meta?.entities.find((entity) => entity.name === name);
    if (found === undefined) throw new Error(`No entity ${name}`);
    return found;
  }

  /** Adds a filter if the API would take it. It answers the problem, or nothing. */
  addFilter(entity: MetaEntity, filter: Filter): string | undefined {
    const problem = filterProblem(entity, filter);
    if (problem === undefined) {
      this.filters = [...this.filters, filter];
      this.page = 1;
    }
    return problem;
  }

  async list(entity: MetaEntity): Promise<string> {
    this.last = await this.client.list(entity, {
      page: this.page,
      pageSize: this.pageSize,
      fields: listFields(entity),
      filters: this.filters,
      ...(this.sort === undefined ? {} : { sort: this.sort }),
    });
    const columns = columnsOf(entity);
    const lines = [`# ${labelOf(entity, this.locale)}`];
    if (this.filters.length > 0)
      lines.push(
        `filters: ${this.filters.map((filter) => `${filter.field} ${this.t(`list.op.${filter.op}`)} ${filter.value}`).join('; ')}`,
      );
    lines.push(columns.map((field) => field.key).join(' | '));
    for (const row of this.last.rows) {
      const moves = transitionsFor(entity, row).map((move) => `[${move.name}]`);
      const mark = this.selected.some((chosen) => chosen['id'] === row['id']) ? '[x]' : '[ ]';
      lines.push(`${mark} ${columns.map((field) => text(row[field.key])).join(' | ')} ${moves.join('')}`.trimEnd());
    }
    lines.push(
      `page ${String(this.last.page)} of ${String(Math.max(1, Math.ceil((this.last.total ?? 0) / this.pageSize)))}`,
    );
    return lines.join('\n');
  }

  select(...ids: readonly string[]): void {
    this.selected = this.last.rows.filter((row) => ids.includes(text(row['id'])));
  }

  /** The moves that the whole selection may take, and what each asks for. */
  bulkMoves(entity: MetaEntity): { name: string; asks: string[] }[] {
    return commonTransitions(entity, this.selected).map((move) => ({
      name: move.name,
      asks: inputFieldsOf(move.input).map((field) => field.key),
    }));
  }

  /** Takes a move for one row and shows the row as it will be, as a screen that updates before the answer does. */
  async move(
    entity: MetaEntity,
    id: string,
    name: string,
    input?: Row,
  ): Promise<{ shown: Row | undefined; saved: Row }> {
    const row = this.last.rows.find((candidate) => text(candidate['id']) === id);
    const found = (entity.transitions ?? []).find((move) => move.name === name);
    if (row === undefined || found === undefined) throw new Error('No such row or move.');
    const shown = patchRow(this.last.rows, id, transitionPatch(entity, found, row)).find(
      (candidate) => text(candidate['id']) === id,
    );
    const saved = await this.client.transition(entity, id, name, Number(row['version']), input);
    return { shown, saved };
  }

  async bulk(entity: MetaEntity, change: Parameters<AdminClient['bulk']>[2]): Promise<string> {
    const result = await this.client.bulk(
      entity,
      this.selected.map((row) => ({ id: text(row['id']), version: Number(row['version']) })),
      change,
    );
    if (result.kind === 'queued') return 'queued';
    const summary = bulkSummary(result.outcomes);
    return `${String(summary.ok)} done; ${summary.failed.map((failed) => `${failed.id}: ${failed.message}`).join('; ')}`.replace(
      /; $/,
      '',
    );
  }

  async exportCsv(entity: MetaEntity): Promise<string> {
    const size = 100;
    const params = {
      pageSize: size,
      fields: listFields(entity),
      filters: this.filters,
      ...(this.sort === undefined ? {} : { sort: this.sort }),
    };
    const first = await this.client.list(entity, { ...params, page: 1 });
    const rows = [...first.rows];
    const { pages } = exportPages(first.total ?? rows.length, size, 10_000);
    for (let next = 2; next <= pages; next += 1)
      rows.push(...(await this.client.list(entity, { ...params, page: next })).rows);
    return csvOf(
      columnsOf(entity).map((field) => ({ key: field.key, title: field.key })),
      rows,
    );
  }

  saveView(entity: MetaEntity, userId: string, name: string): void {
    saveView(this.storage, viewsKey(entity.name, userId), {
      name,
      filters: this.filters,
      ...(this.sort === undefined ? {} : { sort: this.sort }),
    });
  }

  views(entity: MetaEntity, userId: string): SavedView[] {
    return loadViews(this.storage, viewsKey(entity.name, userId));
  }

  /** The form of an entity as lines, each with the check of its value. */
  form(
    entity: MetaEntity,
    row?: Row,
    values: Readonly<Record<string, unknown>> = initialValues(entity, row),
  ): string[] {
    return formFieldsOf(entity).map((field) => {
      const problem = problemOf(field, values[field.key]);
      return `${field.key}${field.required ? '*' : ''} (${field.widget}): ${text(values[field.key])}${problem === undefined ? '' : ` !${this.t(`problem.${problem.code}`, problem.values)}`}`;
    });
  }

  /** Saves the form. A 412 gives the three-way merge of what the person typed, and the row of the others. */
  async save(
    entity: MetaEntity,
    row: Row | undefined,
    values: Readonly<Record<string, unknown>>,
  ): Promise<{ saved?: Row; merged?: ReturnType<typeof reapply> }> {
    if (!allows(entity, row === undefined ? 'create' : 'update')) throw new Error('Not allowed.');
    const body = bodyOf(entity, values, row !== undefined);
    if (row === undefined) return { saved: await this.client.create(entity, body) };
    try {
      return { saved: await this.client.update(entity, text(row['id']), body, Number(row['version'])) };
    } catch (error) {
      const current = error instanceof AdminApiError ? error.current : undefined;
      if (current === undefined) throw error;
      return { merged: reapply(initialValues(entity, row), values, initialValues(entity, current)) };
    }
  }

  say(key: Parameters<typeof this.t>[0], values?: Readonly<Record<string, string | number>>): string {
    return this.t(key, values);
  }

  paramsOf(entity: MetaEntity): Record<string, string> {
    return filterParams(entity, this.filters);
  }
}
