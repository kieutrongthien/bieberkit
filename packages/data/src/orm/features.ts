/**
 * BieberKit
 *
 * @file        packages/data/src/orm/features.ts
 * @description The record features: comments, tags, attachments and timeline on generic tables, always inside the tenant of the record (MOD-13).
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

import type { EntityManager, EntitySchema } from '@mikro-orm/core';
import { requestContext } from '@bieberkit/core';
import { dataError } from '../errors.ts';
import type { Feature } from '../schema/define-entity.ts';
import { codePointLength, fold, nfc } from '../text/fold.ts';
import { pageSize } from '../query/page.ts';
import { entityOfSchema } from './compile.ts';
import type { OrmSchema } from './compile.ts';
import { Attachment, Comment, Tag, TimelineEntry } from './framework.ts';
import { NIL_TENANT } from './sequence.ts';

type Row = Record<string, unknown>;

const MAX_COMMENT = 10_000;
const MAX_TAG = 64;

export interface FeaturePage<T> {
  readonly rows: T[];
  readonly limit: number;
  /** The id of the last row, to pass as `cursor` for the next page, or `null` at the end. */
  readonly nextCursor: string | null;
}

export interface PageRequest {
  readonly limit?: unknown;
  readonly cursor?: string;
}

export interface CommentRow {
  readonly id: string;
  readonly body: string;
  readonly createdAt: Date;
  readonly createdBy: string | null;
}

export interface TagRow {
  readonly id: string;
  readonly tag: string;
  readonly createdAt: Date;
  readonly createdBy: string | null;
}

export interface AttachmentInput {
  /** The key that the storage gave to the file. */
  readonly key: string;
  readonly name: string;
  readonly contentType: string;
  readonly size: number;
}

export interface AttachmentRow extends AttachmentInput {
  readonly id: string;
  readonly createdAt: Date;
  readonly createdBy: string | null;
}

export interface TimelineInput {
  readonly type: string;
  readonly data?: unknown;
}

export interface TimelineRow {
  readonly id: string;
  readonly type: string;
  readonly data: unknown;
  readonly at: Date;
  readonly actorId: string | null;
}

function invalid(message: string, fix: string): never {
  throw dataError('DATA_FEATURE_INVALID', 400, message, fix);
}

interface Parent {
  readonly entity: string;
  readonly tenant: string;
  readonly recordId: string;
}

/**
 * Finds the record that a feature belongs to. It is loaded under the filters of the unit of work, so a record of another tenant or a
 * deleted one is not found, and the answer is the same for both and for a record that never existed. The tenant of the rows is the
 * tenant of this record, and no caller can change it.
 */
async function parentOf(em: EntityManager, schema: OrmSchema, recordId: string, feature: Feature): Promise<Parent> {
  const def = entityOfSchema(schema);
  if (!def.features.includes(feature)) {
    throw dataError(
      'DATA_FEATURE_DISABLED',
      500,
      `${def.name} does not have the feature ${feature}.`,
      `Add '${feature}' to the features of the entity.`,
    );
  }
  const record: Row | null = await em.findOne(schema, { id: recordId });
  if (record === null) {
    throw dataError(
      'DATA_RECORD_NOT_FOUND',
      404,
      'The record does not exist.',
      'Check the id, and that the record belongs to this tenant.',
    );
  }
  const tenant = record['tenantId'];
  return { entity: def.name, tenant: typeof tenant === 'string' ? tenant.toLowerCase() : NIL_TENANT, recordId };
}

const actor = (): string | null => requestContext.get()?.userId ?? null;

async function pageOf<T extends { readonly id: string }, E extends object>(
  em: EntityManager,
  entity: EntitySchema<E>,
  parent: Parent,
  request: PageRequest,
  map: (row: E) => T,
): Promise<FeaturePage<T>> {
  const limit = pageSize(request.limit);
  const where: Row = { tenant: parent.tenant, entity: parent.entity, recordId: parent.recordId };
  if (request.cursor !== undefined && request.cursor !== '') where['id'] = { $gt: request.cursor };
  // The conditions and the order use names that every feature table has, and MikroORM types them per entity.
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion
  const options = { orderBy: { id: 'asc' }, limit: limit + 1, disableIdentityMap: true } as never;
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion
  const rows = await em.find(entity, where as never, options);
  const page = rows.slice(0, limit).map(map);
  return { rows: page, limit, nextCursor: rows.length > limit ? (page.at(-1)?.id ?? null) : null };
}

const tagOf = (text: string): string => {
  const tag = nfc(text).trim();
  if (tag === '' || codePointLength(tag) > MAX_TAG)
    invalid(`A tag has 1 to ${MAX_TAG} characters.`, 'Shorten the tag.');
  return tag;
};

/** Adds a comment to the unit of work. The flush that the caller makes writes it with the rest. */
export async function addComment(
  em: EntityManager,
  schema: OrmSchema,
  recordId: string,
  input: { readonly body: string },
): Promise<CommentRow> {
  const body = nfc(input.body).trim();
  if (body === '' || codePointLength(body) > MAX_COMMENT)
    invalid(`A comment has 1 to ${MAX_COMMENT} characters.`, 'Write something, and keep it shorter than that.');
  const parent = await parentOf(em, schema, recordId, 'comments');
  const row = em.create(Comment, { ...parent, body, createdAt: new Date(), createdBy: actor() });
  return { id: row.id, body, createdAt: row.createdAt, createdBy: row.createdBy ?? null };
}

export async function listComments(
  em: EntityManager,
  schema: OrmSchema,
  recordId: string,
  request: PageRequest = {},
): Promise<FeaturePage<CommentRow>> {
  const parent = await parentOf(em, schema, recordId, 'comments');
  return pageOf(em, Comment, parent, request, (row) => ({
    id: row.id,
    body: row.body,
    createdAt: row.createdAt,
    createdBy: row.createdBy ?? null,
  }));
}

/** Removes a comment of this record. Returns `false` when this record has no such comment. */
export async function deleteComment(
  em: EntityManager,
  schema: OrmSchema,
  recordId: string,
  commentId: string,
): Promise<boolean> {
  const parent = await parentOf(em, schema, recordId, 'comments');
  const row = await em.findOne(Comment, { id: commentId, ...parent });
  if (row === null) return false;
  em.remove(row);
  return true;
}

/** Adds a tag. A tag that the record has already is returned, and nothing is written. */
export async function addTag(em: EntityManager, schema: OrmSchema, recordId: string, text: string): Promise<TagRow> {
  const tag = tagOf(text);
  const parent = await parentOf(em, schema, recordId, 'tags');
  const existing = await em.findOne(Tag, { ...parent, tagKey: fold('ci', tag) });
  const row =
    existing ?? em.create(Tag, { ...parent, tag, tagKey: fold('ci', tag), createdAt: new Date(), createdBy: actor() });
  return { id: row.id, tag: row.tag, createdAt: row.createdAt, createdBy: row.createdBy ?? null };
}

export async function listTags(
  em: EntityManager,
  schema: OrmSchema,
  recordId: string,
  request: PageRequest = {},
): Promise<FeaturePage<TagRow>> {
  const parent = await parentOf(em, schema, recordId, 'tags');
  return pageOf(em, Tag, parent, request, (row) => ({
    id: row.id,
    tag: row.tag,
    createdAt: row.createdAt,
    createdBy: row.createdBy ?? null,
  }));
}

/** Removes a tag. Returns `false` when the record does not have it. */
export async function removeTag(
  em: EntityManager,
  schema: OrmSchema,
  recordId: string,
  text: string,
): Promise<boolean> {
  const tag = tagOf(text);
  const parent = await parentOf(em, schema, recordId, 'tags');
  const row = await em.findOne(Tag, { ...parent, tagKey: fold('ci', tag) });
  if (row === null) return false;
  em.remove(row);
  return true;
}

/** Adds the data about a file that the storage already holds. */
export async function addAttachment(
  em: EntityManager,
  schema: OrmSchema,
  recordId: string,
  input: AttachmentInput,
): Promise<AttachmentRow> {
  const key = input.key.trim();
  const name = nfc(input.name).trim();
  const contentType = input.contentType.trim();
  if (key === '' || key.length > 512)
    invalid('The storage key has 1 to 512 characters.', 'Pass the key that the storage gave.');
  if (name === '' || codePointLength(name) > 255)
    invalid('The name of a file has 1 to 255 characters.', 'Shorten the name.');
  if (contentType === '' || contentType.length > 255)
    invalid('The content type has 1 to 255 characters.', 'Pass a type such as application/pdf.');
  if (!Number.isSafeInteger(input.size) || input.size < 0) {
    invalid('The size of a file is a whole number of bytes, 0 or more.', 'Pass the size that the storage gave.');
  }
  const parent = await parentOf(em, schema, recordId, 'attachments');
  const row = em.create(Attachment, {
    ...parent,
    storageKey: key,
    name,
    contentType,
    size: input.size,
    createdAt: new Date(),
    createdBy: actor(),
  });
  return {
    id: row.id,
    key,
    name,
    contentType,
    size: input.size,
    createdAt: row.createdAt,
    createdBy: row.createdBy ?? null,
  };
}

export async function listAttachments(
  em: EntityManager,
  schema: OrmSchema,
  recordId: string,
  request: PageRequest = {},
): Promise<FeaturePage<AttachmentRow>> {
  const parent = await parentOf(em, schema, recordId, 'attachments');
  return pageOf(em, Attachment, parent, request, (row) => ({
    id: row.id,
    key: row.storageKey,
    name: row.name,
    contentType: row.contentType,
    size: Number(row.size),
    createdAt: row.createdAt,
    createdBy: row.createdBy ?? null,
  }));
}

/** Removes the data about a file of this record. The file itself is the storage's. Returns `false` when there is no such attachment. */
export async function removeAttachment(
  em: EntityManager,
  schema: OrmSchema,
  recordId: string,
  attachmentId: string,
): Promise<boolean> {
  const parent = await parentOf(em, schema, recordId, 'attachments');
  const row = await em.findOne(Attachment, { id: attachmentId, ...parent });
  if (row === null) return false;
  em.remove(row);
  return true;
}

function timelineData(data: unknown): string | null {
  if (data === undefined) return null;
  const text = JSON.stringify(data);
  if (text === undefined)
    invalid(
      'The data of a timeline entry is not JSON.',
      'Put text, numbers, booleans, null, arrays and objects in it.',
    );
  return text;
}

function timelineEntry(em: EntityManager, parent: Parent, input: TimelineInput): TimelineRow {
  const type = input.type.trim();
  if (type === '' || type.length > 100)
    invalid('The type of a timeline entry has 1 to 100 characters.', 'Name it like call or note.');
  const row = em.create(TimelineEntry, {
    ...parent,
    type,
    data: timelineData(input.data),
    at: new Date(),
    actorId: actor(),
  });
  return { id: row.id, type, data: input.data ?? null, at: row.at, actorId: row.actorId ?? null };
}

/** Adds an entry to the timeline of a record: what happened to it. */
export async function addTimeline(
  em: EntityManager,
  schema: OrmSchema,
  recordId: string,
  input: TimelineInput,
): Promise<TimelineRow> {
  return timelineEntry(em, await parentOf(em, schema, recordId, 'timeline'), input);
}

/**
 * The same, for a record that the caller already holds, as `transition` does. The record is the parent, so nothing is looked up.
 * Does nothing when the entity does not have a timeline.
 */
export function addTimelineFor(em: EntityManager, schema: OrmSchema, record: Row, input: TimelineInput): void {
  const def = entityOfSchema(schema);
  if (!def.features.includes('timeline')) return;
  const tenant = record['tenantId'];
  timelineEntry(
    em,
    {
      entity: def.name,
      tenant: typeof tenant === 'string' ? tenant.toLowerCase() : NIL_TENANT,
      recordId: String(record['id']),
    },
    input,
  );
}

export async function listTimeline(
  em: EntityManager,
  schema: OrmSchema,
  recordId: string,
  request: PageRequest = {},
): Promise<FeaturePage<TimelineRow>> {
  const parent = await parentOf(em, schema, recordId, 'timeline');
  return pageOf(em, TimelineEntry, parent, request, (row) => ({
    id: row.id,
    type: row.type,
    data: row.data === null || row.data === undefined ? null : JSON.parse(row.data),
    at: row.at,
    actorId: row.actorId ?? null,
  }));
}
