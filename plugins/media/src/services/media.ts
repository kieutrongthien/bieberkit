/**
 * BieberKit
 *
 * @file        plugins/media/src/services/media.ts
 * @description The media service: the records and folders of the library, their uploads and removals (MED-01 to MED-08).
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

import { isUuid, pageSize, uuid7 } from '@bieberkit/data';
import { emitEvent, recordAudit, runInTransaction, runInUnitOfWork } from '@bieberkit/data/orm';
import type { Database } from '@bieberkit/data/orm';
import type { Storage } from '@bieberkit/storage';
import { createHash } from 'node:crypto';
import { BkError } from '@bieberkit/core';
import { HttpError } from '@bieberkit/http';
import { raw } from '@mikro-orm/core';
import { fail } from './errors.ts';
import { classOf, pathOfRow, read, removeWithObject } from './records.ts';
import type { EntityManager, Row } from './records.ts';
import { Media } from '../entities/media.ts';
import { Folder, MAX_DEPTH } from '../entities/folder.ts';
import type { MediaLimits, MediaService } from './types.ts';
import { MB, checkLimits, kindOf, mediaType } from './content.ts';
import { cursorOf, folderViewOf, idAt, likePrefix, page, viewOf } from './views.ts';
import { CONFIRMED_EVENT } from '../events/names.ts';

const SIGNED_TTL_MS = 5 * 60_000;

const NIL = '00000000-0000-0000-0000-000000000000';

const mediaNotFound = (): never =>
  fail('MEDIA_NOT_FOUND', 404, 'The file does not exist.', 'Check the id of the file.');

const folderNotFound = (): never =>
  fail('MEDIA_FOLDER_NOT_FOUND', 404, 'The folder does not exist.', 'Check the id of the folder.');

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

export function boundOf(): Bound {
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
  /** Writes `media.file.downloaded` when a private file is read (OPS-04). */
  readonly auditDownloads?: boolean;
}): MediaService {
  const { db, storage, limits } = input;

  /** Records who read a private file, when the project asks for it. A public file has a URL that nobody sees used (OPS-04). */
  async function auditDownload(row: Row, via: 'url' | 'content'): Promise<void> {
    if (input.auditDownloads !== true || read(row, 'visibility') !== 'private') return;
    await runInTransaction(db, async (em) => {
      audit(em, 'media.file.downloaded', Media.name, String(read(row, 'id')), { filename: read(row, 'filename'), via });
      await em.flush();
    });
  }

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
      await auditDownload(row, 'url');
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
      await auditDownload(row, 'content');
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
