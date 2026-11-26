/**
 * BieberKit
 *
 * @file        plugins/media/src/service.ts
 * @description The media service: limits, the upload flow, read URLs, metadata, folders, deletion after commit and the expiry of pending files (MED-01 to MED-08).
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

import { createHash } from 'node:crypto';
import type { Readable } from 'node:stream';
import { raw } from '@mikro-orm/core';
import { BkError } from '@bieberkit/core';
import { decodeCursor, encodeCursor, isUuid, pageSize, uuid7 } from '@bieberkit/data';
import { emitEvent, recordAudit, runInTransaction, runInUnitOfWork } from '@bieberkit/data/orm';
import type { Database } from '@bieberkit/data/orm';
import { HttpError } from '@bieberkit/http';
import { defineJob } from '@bieberkit/queue';
import type { JobDef, QueueSubscription } from '@bieberkit/queue';
import type { Storage } from '@bieberkit/storage';
import * as z from 'zod/mini';
import { Folder, MAX_DEPTH, Media } from './entity.ts';

const MB = 1024 * 1024;
const HOUR = 3_600_000;
const SIGNED_TTL_MS = 5 * 60_000;
const NIL = '00000000-0000-0000-0000-000000000000';
const DELETED_EVENT = 'media.file.deleted';
const CONFIRMED_EVENT = 'media.file.confirmed';
const OFFICE = 'application/vnd.openxmlformats-officedocument';

/** Images, PDF, text and the Office formats of the storage's list (MED-07). */
export const DEFAULT_ALLOWED_TYPES: readonly string[] = [
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp',
  'image/avif',
  'application/pdf',
  'text/plain',
  'text/csv',
  `${OFFICE}.wordprocessingml.document`,
  `${OFFICE}.spreadsheetml.sheet`,
  `${OFFICE}.presentationml.presentation`,
];

export interface MediaLimits {
  readonly maxBytes: number;
  readonly allowedTypes: readonly string[];
  /** The bytes of `pending` and `ready` files that one tenant may hold. No quota when it is not given. */
  readonly quotaBytes?: number;
}

export interface MediaView {
  readonly id: string;
  readonly filename: string;
  readonly contentType: string;
  readonly kind: string;
  readonly size: number;
  readonly status: string;
  readonly visibility: string;
  readonly alt: string | null;
  readonly description: string | null;
  readonly folderId: string | null;
  readonly checksum: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface FolderView {
  readonly id: string;
  readonly name: string;
  readonly parentId: string | null;
  readonly depth: number;
  readonly createdAt: string;
}

export interface Page<T> {
  readonly data: T[];
  readonly meta: { readonly pageSize: number; readonly nextCursor: string | null; readonly total?: number };
}

export interface NewMedia {
  readonly filename: string;
  readonly contentType: string;
  readonly size: number;
  readonly visibility?: 'private' | 'public';
  readonly alt?: string;
  readonly description?: string;
  readonly folderId?: string;
}

export interface MediaChanges {
  readonly alt?: string | null;
  readonly description?: string | null;
  readonly folderId?: string | null;
}

export interface MediaQuery {
  readonly q?: string;
  readonly kind?: string;
  readonly folderId?: string;
  readonly status?: string;
  readonly visibility?: string;
  readonly sizeMin?: number;
  readonly sizeMax?: number;
  readonly createdFrom?: string;
  readonly createdTo?: string;
  readonly pageSize?: unknown;
  readonly cursor?: string;
  readonly withTotal?: boolean;
}

export interface MediaService {
  create(input: NewMedia): Promise<MediaView>;
  get(id: string): Promise<MediaView>;
  list(query: MediaQuery): Promise<Page<MediaView>>;
  update(id: string, changes: MediaChanges): Promise<MediaView>;
  /** Removes the record now and its object after commit (MED-03). */
  remove(id: string): Promise<void>;
  uploadUrl(id: string): Promise<{
    readonly url: string;
    readonly method: string;
    readonly headers: Readonly<Record<string, string>>;
    readonly expiresAt: number;
  }>;
  confirm(id: string): Promise<{ readonly id: string; readonly status: string; readonly size: number }>;
  /** A URL to read a ready file: public, signed, or `contentUrl` on a disk that cannot sign (MED-02). */
  readUrl(id: string, contentUrl: string): Promise<{ readonly url: string; readonly expiresAt: number | null }>;
  content(id: string): Promise<{ readonly stream: Readable; readonly contentType: string; readonly filename: string }>;
  folders(query: {
    readonly parentId?: string;
    readonly pageSize?: unknown;
    readonly cursor?: string;
  }): Promise<Page<FolderView>>;
  createFolder(input: { readonly name: string; readonly parentId?: string }): Promise<FolderView>;
  renameFolder(id: string, name: string): Promise<FolderView>;
  removeFolder(id: string): Promise<void>;
}

type EntityManager = Parameters<Parameters<typeof runInTransaction>[1]>[0];
type Row = Record<string, unknown>;

const classOf = (em: EntityManager, name: string) => em.getMetadata().getByClassName(name).class;
const read = (row: unknown, name: string): unknown => Reflect.get(Object(row), name);
const textOf = (row: unknown, name: string): string | null => {
  const value = read(row, name);
  return typeof value === 'string' ? value : null;
};
const iso = (value: unknown): string =>
  value instanceof Date || typeof value === 'string' || typeof value === 'number' ? new Date(value).toISOString() : '';
const mediaType = (value: string): string => (value.split(';')[0] ?? '').trim().toLowerCase();

/** The path of the object in the root storage: `<tenant>/media/<id>/<filename>`, under the visibility prefix of S-05 (OPS-04). */
export const pathOf = (row: { readonly id: string; readonly filename: string; readonly tenantId: string }): string =>
  `${row.tenantId}/media/${row.id}/${row.filename}`;

const pathOfRow = (row: unknown): string =>
  pathOf({
    id: String(read(row, 'id')),
    filename: String(read(row, 'filename')),
    tenantId: String(read(row, 'tenantId')),
  });

/** The kind of a file, from its type (MED-06). */
export function kindOf(contentType: string): string {
  const type = mediaType(contentType);
  if (type.startsWith('image/')) return 'image';
  if (type.startsWith('video/')) return 'video';
  if (type.startsWith('audio/')) return 'audio';
  if (type.startsWith('text/') || type === 'application/pdf' || type === 'application/json' || type.startsWith(OFFICE))
    return 'document';
  return 'other';
}

const fail = (code: string, status: number, message: string, fix: string): never => {
  throw new HttpError(code, status, message, fix);
};
const mediaNotFound = (): never =>
  fail('MEDIA_NOT_FOUND', 404, 'The file does not exist.', 'Check the id of the file.');
const folderNotFound = (): never =>
  fail('MEDIA_FOLDER_NOT_FOUND', 404, 'The folder does not exist.', 'Check the id of the folder.');

function viewOf(row: unknown): MediaView {
  return {
    id: String(read(row, 'id')),
    filename: String(read(row, 'filename')),
    contentType: String(read(row, 'contentType')),
    kind: String(read(row, 'kind')),
    size: Number(read(row, 'size')),
    status: String(read(row, 'status')),
    visibility: String(read(row, 'visibility')),
    alt: textOf(row, 'alt'),
    description: textOf(row, 'description'),
    folderId: textOf(row, 'folderId'),
    checksum: textOf(row, 'checksum'),
    createdAt: iso(read(row, 'createdAt')),
    updatedAt: iso(read(row, 'updatedAt')),
  };
}

function folderViewOf(row: unknown): FolderView {
  return {
    id: String(read(row, 'id')),
    name: String(read(row, 'name')),
    parentId: textOf(row, 'parentId'),
    depth: Number(read(row, 'depth')),
    createdAt: iso(read(row, 'createdAt')),
  };
}

/** The `!` escape of LIKE: one character that every dialect accepts in `escape '!'`. */
const likePrefix = (text: string): string => `${text.replaceAll(/[!%_]/g, (found) => `!${found}`)}%`;

/** The first and the last UUIDv7 of a millisecond, so a range of creation is a range of ids (as the users list does). */
function idAt(ms: number, last: boolean): string {
  const hex = Math.max(0, Math.min(ms, 0xffff_ffff_ffff)).toString(16).padStart(12, '0');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${last ? '7fff-bfff-ffffffffffff' : '7000-8000-000000000000'}`;
}

async function findMedia(em: EntityManager, id: string): Promise<Row> {
  if (!isUuid(id)) return mediaNotFound();
  const row: unknown = await em.findOne(classOf(em, Media.name), { id });
  return typeof row === 'object' && row !== null ? Object(row) : mediaNotFound();
}

async function findFolder(em: EntityManager, id: string): Promise<Row> {
  if (!isUuid(id)) return folderNotFound();
  const row: unknown = await em.findOne(classOf(em, Folder.name), { id });
  return typeof row === 'object' && row !== null ? Object(row) : folderNotFound();
}

function audit(em: EntityManager, action: string, entity: string, recordId: string, data: Row = {}): void {
  recordAudit(em, { action, entity, recordId, data });
}

/** Removes the record and leaves its object to the worker, after commit (MED-03, BPL-04). */
function removeWithObject(em: EntityManager, row: Row, action: string): void {
  const id = String(read(row, 'id'));
  emitEvent(em, { name: DELETED_EVENT, payload: { path: pathOfRow(row) }, record: { entity: Media.name, id } });
  recordAudit(em, {
    action,
    entity: Media.name,
    recordId: id,
    tenantId: String(read(row, 'tenantId')),
    data: { filename: read(row, 'filename') },
  });
  em.remove(row);
}

function page<T>(rows: unknown[], size: number, view: (row: unknown) => T, total: number | undefined): Page<T> {
  const shown = rows.slice(0, size);
  const last = shown.at(-1);
  return {
    data: shown.map(view),
    meta: {
      pageSize: size,
      nextCursor: rows.length > size && last !== undefined ? encodeCursor([String(read(last, 'id'))]) : null,
      ...(total === undefined ? {} : { total }),
    },
  };
}

const cursorOf = (cursor: string | undefined): string | undefined =>
  cursor === undefined || cursor === '' ? undefined : String(decodeCursor(cursor)[0]);

function checkLimits(limits: MediaLimits, contentType: string, size: number): void {
  if (!limits.allowedTypes.includes(mediaType(contentType))) {
    fail(
      'MEDIA_TYPE_REFUSED',
      422,
      `Files of type ${mediaType(contentType)} are not allowed.`,
      `Send one of ${limits.allowedTypes.join(', ')}.`,
    );
  }
  if (size > limits.maxBytes) {
    fail(
      'MEDIA_TOO_LARGE',
      413,
      'The file is larger than the limit.',
      `Send a file of at most ${String(limits.maxBytes / MB)} MB.`,
    );
  }
}

/** The bytes that the tenant holds in `pending` and `ready` files, without `except`, plus `size` must fit the quota (MED-07). */
async function checkQuota(em: EntityManager, limits: MediaLimits, size: number, except?: string): Promise<void> {
  if (limits.quotaBytes === undefined) return;
  const rows: unknown[] = await em.find(
    classOf(em, Media.name),
    { status: { $in: ['pending', 'ready'] }, ...(except === undefined ? {} : { id: { $ne: except } }) },
    { fields: ['id', 'size'] },
  );
  const used = rows.reduce<number>((sum, row) => sum + Number(read(row, 'size')), 0);
  if (used + size > limits.quotaBytes) {
    fail(
      'MEDIA_QUOTA_EXCEEDED',
      422,
      'The files of the tenant would pass its quota.',
      `Delete files first; the quota is ${String(limits.quotaBytes / MB)} MB.`,
    );
  }
}

async function checksumOf(storage: Storage, path: string): Promise<string> {
  const hash = createHash('sha256');
  for await (const chunk of await storage.stream(path)) hash.update(Buffer.from(chunk));
  return hash.digest('hex');
}

async function folderExists(em: EntityManager, folderId: string | null | undefined): Promise<void> {
  if (folderId !== null && folderId !== undefined) await findFolder(em, folderId);
}

async function nameFree(em: EntityManager, parentKey: string, name: string, except?: string): Promise<void> {
  const taken: unknown = await em.findOne(classOf(em, Folder.name), {
    parentKey,
    name,
    ...(except === undefined ? {} : { id: { $ne: except } }),
  });
  if (taken !== null) {
    fail(
      'MEDIA_FOLDER_NAME_TAKEN',
      409,
      `The folder already holds a folder named ${name}.`,
      'Choose another name, or use the folder that exists.',
    );
  }
}

const isCode = (error: unknown, code: string): boolean => error instanceof BkError && error.code === code;

interface Bound {
  readonly db: Database;
  readonly storage: Storage;
  readonly pendingTtlHours: number;
}

/** The services of the jobs: a job is declared before the container boots, so the service binds them when it is made. */
const bound: { current?: Bound } = {};

function boundOf(): Bound {
  if (bound.current === undefined) {
    throw new HttpError(
      'MEDIA_NOT_READY_TO_RUN',
      500,
      'A media job ran before the media service was made.',
      'Boot the container of the process with the media plugin before the worker starts.',
    );
  }
  return bound.current;
}

export function createMediaService(input: {
  readonly db: Database;
  readonly storage: Storage;
  readonly limits: MediaLimits;
  readonly pendingTtlHours: number;
}): MediaService {
  const { db, storage, limits } = input;

  /** The row in a state that allows a step, or 409. */
  async function pending(id: string): Promise<Row> {
    const row = await runInUnitOfWork(db, (em) => findMedia(em, id));
    if (read(row, 'status') !== 'pending') {
      fail('MEDIA_NOT_PENDING', 409, 'The file is not waiting for its upload.', 'Make a new record for a new file.');
    }
    return row;
  }

  async function ready(id: string): Promise<Row> {
    const row = await runInUnitOfWork(db, (em) => findMedia(em, id));
    if (read(row, 'status') !== 'ready') {
      fail('MEDIA_NOT_READY', 409, 'The file has not been uploaded and confirmed.', 'Upload and confirm it first.');
    }
    return row;
  }

  async function reject(id: string, reason: string): Promise<void> {
    await runInTransaction(db, async (em) => {
      const row = await findMedia(em, id);
      row['status'] = 'rejected';
      audit(em, 'media.file.rejected', Media.name, id, { reason });
      await em.flush();
    });
  }

  const service: MediaService = {
    create: (file) =>
      runInTransaction(db, async (em) => {
        checkLimits(limits, file.contentType, file.size);
        await folderExists(em, file.folderId);
        await checkQuota(em, limits, file.size);
        const id = uuid7();
        // The class comes from the metadata; the columns are those of `Media`.
        // oxlint-disable-next-line typescript/no-unsafe-type-assertion
        const row: unknown = em.create(classOf(em, Media.name), {
          id,
          filename: file.filename,
          nameKey: file.filename.toLowerCase(),
          contentType: mediaType(file.contentType),
          kind: kindOf(file.contentType),
          size: file.size,
          status: 'pending',
          visibility: file.visibility ?? 'private',
          alt: file.alt ?? null,
          description: file.description ?? null,
          folderId: file.folderId ?? null,
        } as never);
        audit(em, 'media.file.created', Media.name, id, { filename: file.filename, size: file.size });
        await em.flush();
        return viewOf(row);
      }),

    get: async (id) => viewOf(await runInUnitOfWork(db, (em) => findMedia(em, id))),

    list: (query) =>
      runInUnitOfWork(db, async (em) => {
        const size = pageSize(query.pageSize);
        const before = cursorOf(query.cursor);
        const ids: Row = {};
        if (query.createdFrom !== undefined) ids['$gte'] = idAt(Date.parse(query.createdFrom), false);
        if (query.createdTo !== undefined) ids['$lte'] = idAt(Date.parse(query.createdTo), true);
        const sizes: Row = {};
        if (query.sizeMin !== undefined) sizes['$gte'] = query.sizeMin;
        if (query.sizeMax !== undefined) sizes['$lte'] = query.sizeMax;
        const where: Row = {
          ...(query.q === undefined || query.q === ''
            ? {}
            : { [raw("name_key like ? escape '!'", [likePrefix(query.q.toLowerCase())])]: [] }),
          ...(query.kind === undefined ? {} : { kind: query.kind }),
          ...(query.folderId === undefined ? {} : { folderId: query.folderId }),
          ...(query.status === undefined ? {} : { status: query.status }),
          ...(query.visibility === undefined ? {} : { visibility: query.visibility }),
          ...(Object.keys(sizes).length === 0 ? {} : { size: sizes }),
        };
        const entity = classOf(em, Media.name);
        const total =
          query.withTotal === true
            ? await em.count(entity, { ...where, ...(Object.keys(ids).length === 0 ? {} : { id: ids }) })
            : undefined;
        if (before !== undefined) ids['$lt'] = before;
        const rows: unknown[] = await em.find(
          entity,
          { ...where, ...(Object.keys(ids).length === 0 ? {} : { id: ids }) },
          { orderBy: { id: 'desc' }, limit: size + 1 },
        );
        return page(rows, size, viewOf, total);
      }),

    update: (id, changes) =>
      runInTransaction(db, async (em) => {
        const row = await findMedia(em, id);
        await folderExists(em, changes.folderId);
        const fields = Object.keys(changes);
        for (const field of fields) row[field] = Reflect.get(changes, field) ?? null;
        audit(em, 'media.file.updated', Media.name, id, { fields });
        await em.flush();
        return viewOf(row);
      }),

    remove: (id) =>
      runInTransaction(db, async (em) => {
        removeWithObject(em, await findMedia(em, id), 'media.file.deleted');
        await em.flush();
      }),

    async uploadUrl(id) {
      const row = await runInUnitOfWork(db, async (em) => {
        const found = await findMedia(em, id);
        if (read(found, 'status') === 'ready') {
          fail('MEDIA_ALREADY_READY', 409, 'The file was uploaded already.', 'Make a new record for a new file.');
        }
        if (read(found, 'status') !== 'pending') {
          fail(
            'MEDIA_NOT_PENDING',
            409,
            'The file is not waiting for its upload.',
            'Make a new record for a new file.',
          );
        }
        // The limits may have changed since the record was made: they are checked again before the URL (MED-07).
        checkLimits(limits, String(read(found, 'contentType')), Number(read(found, 'size')));
        await checkQuota(em, limits, Number(read(found, 'size')), id);
        return found;
      });
      const signed = await storage.signedUploadUrl(pathOfRow(row), {
        contentType: String(read(row, 'contentType')),
        size: Number(read(row, 'size')),
      });
      return { url: signed.url, method: signed.method, headers: signed.headers, expiresAt: signed.expiresAt };
    },

    async confirm(id) {
      const row = await pending(id);
      const path = pathOfRow(row);
      const visibility = read(row, 'visibility') === 'public' ? 'public' : 'private';
      // The storage checks the size, the type that the bytes really are, and the policy; it deletes a file that fails (S-02). This
      // and the checksum read the bucket, so they run before the transaction, never inside it.
      let stored: Awaited<ReturnType<Storage['confirmUpload']>>;
      try {
        stored = await storage.confirmUpload(path, { visibility });
      } catch (error) {
        if (isCode(error, 'STORAGE_UPLOAD_REJECTED')) await reject(id, 'content');
        throw error;
      }
      if (!limits.allowedTypes.includes(mediaType(stored.contentType))) {
        await storage.delete(path);
        await reject(id, 'type');
        fail(
          'MEDIA_TYPE_REFUSED',
          422,
          `Files of type ${stored.contentType} are not allowed.`,
          'Send an allowed type.',
        );
      }
      const checksum = await checksumOf(storage, path);
      await runInTransaction(db, async (em) => {
        const current = await findMedia(em, id);
        if (read(current, 'status') !== 'pending') {
          fail(
            'MEDIA_NOT_PENDING',
            409,
            'The file is not waiting for its upload.',
            'Make a new record for a new file.',
          );
        }
        Object.assign(current, {
          status: 'ready',
          size: stored.size,
          contentType: mediaType(stored.contentType),
          kind: kindOf(stored.contentType),
          checksum,
        });
        audit(em, 'media.file.confirmed', Media.name, id, { size: stored.size });
        emitEvent(em, { name: CONFIRMED_EVENT, payload: { id, path }, record: { entity: Media.name, id } });
        await em.flush();
      });
      return { id, status: 'ready', size: stored.size };
    },

    async readUrl(id, contentUrl) {
      const row = await ready(id);
      const path = pathOfRow(row);
      if (read(row, 'visibility') === 'public') return { url: await storage.url(path), expiresAt: null };
      try {
        const expiresAt = Date.now() + SIGNED_TTL_MS;
        return { url: await storage.signedUrl(path, { ttlMs: SIGNED_TTL_MS }), expiresAt };
      } catch (error) {
        if (isCode(error, 'STORAGE_SIGNING_UNSUPPORTED')) return { url: contentUrl, expiresAt: null };
        throw error;
      }
    },

    async content(id) {
      const row = await ready(id);
      return {
        stream: await storage.stream(pathOfRow(row)),
        contentType: String(read(row, 'contentType')),
        filename: String(read(row, 'filename')),
      };
    },

    folders: (query) =>
      runInUnitOfWork(db, async (em) => {
        const size = pageSize(query.pageSize);
        const after = cursorOf(query.cursor);
        const rows: unknown[] = await em.find(
          classOf(em, Folder.name),
          { parentKey: query.parentId ?? NIL, ...(after === undefined ? {} : { id: { $gt: after } }) },
          { orderBy: { id: 'asc' }, limit: size + 1 },
        );
        return page(rows, size, folderViewOf, undefined);
      }),

    createFolder: (folder) =>
      runInTransaction(db, async (em) => {
        const parent = folder.parentId === undefined ? undefined : await findFolder(em, folder.parentId);
        const depth = parent === undefined ? 1 : Number(read(parent, 'depth')) + 1;
        if (depth > MAX_DEPTH) {
          fail(
            'MEDIA_FOLDER_TOO_DEEP',
            422,
            `Folders nest at most ${String(MAX_DEPTH)} deep.`,
            'Put the folder higher in the tree.',
          );
        }
        const parentKey = folder.parentId ?? NIL;
        await nameFree(em, parentKey, folder.name);
        const id = uuid7();
        // oxlint-disable-next-line typescript/no-unsafe-type-assertion
        const row: unknown = em.create(classOf(em, Folder.name), {
          id,
          name: folder.name,
          parentId: folder.parentId ?? null,
          parentKey,
          depth,
        } as never);
        audit(em, 'media.folder.created', Folder.name, id, { name: folder.name });
        await em.flush();
        return folderViewOf(row);
      }),

    renameFolder: (id, name) =>
      runInTransaction(db, async (em) => {
        const row = await findFolder(em, id);
        await nameFree(em, String(read(row, 'parentKey')), name, id);
        audit(em, 'media.folder.renamed', Folder.name, id, { from: read(row, 'name'), to: name });
        row['name'] = name;
        await em.flush();
        return folderViewOf(row);
      }),

    removeFolder: (id) =>
      runInTransaction(db, async (em) => {
        const row = await findFolder(em, id);
        const children = await em.count(classOf(em, Folder.name), { parentKey: id });
        const files = await em.count(classOf(em, Media.name), { folderId: id });
        if (children + files > 0) {
          fail(
            'MEDIA_FOLDER_NOT_EMPTY',
            409,
            'The folder still holds files or folders.',
            'Move or delete what it holds first.',
          );
        }
        audit(em, 'media.folder.deleted', Folder.name, id, { name: read(row, 'name') });
        em.remove(row);
        await em.flush();
      }),
  };
  bound.current = { db, storage, pendingTtlHours: input.pendingTtlHours };
  return service;
}

/** Deletes the object of a deleted record, after commit. A delivery that fails is retried; a final failure leaves the job dead. */
export const deleteObjectJob: JobDef<{ readonly path: string }> = defineJob<{ readonly path: string }>({
  name: 'media.delete-object',
  input: z.object({ path: z.string() }),
  attempts: 10,
  async handler(job) {
    await boundOf().storage.delete(job.path);
  },
});

/** Deletes, in every tenant, the records still `pending` after the TTL, and their objects after commit (MED-03). */
export const prunePendingJob: JobDef<Record<string, never>> = defineJob<Record<string, never>>({
  name: 'media.prune-pending',
  input: z.object({}),
  async handler() {
    const { db, pendingTtlHours } = boundOf();
    const cutoff = new Date(Date.now() - pendingTtlHours * HOUR);
    await db.asSystem('media: delete files still pending after their TTL', () =>
      runInTransaction(db, async (em) => {
        const rows: unknown[] = await em.find(classOf(em, Media.name), {
          status: 'pending',
          createdAt: { $lt: cutoff },
        });
        for (const row of rows) removeWithObject(em, Object(row), 'media.file.expired');
        await em.flush();
      }),
    );
  },
});

export const subscriptions: readonly QueueSubscription[] = [{ event: DELETED_EVENT, job: deleteObjectJob }];
