/**
 * BieberKit
 *
 * @file        plugins/media/src/services/records.ts
 * @description What the media service reads and checks in the database, the audit of a change and the refusals of the library.
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

import { emitEvent, recordAudit } from '@bieberkit/data/orm';
import type { runInTransaction } from '@bieberkit/data/orm';
import { DELETED_EVENT } from '../events/names.ts';
import { pathOf } from './content.ts';
import { Media } from '../entities/media.ts';

export type EntityManager = Parameters<Parameters<typeof runInTransaction>[1]>[0];

export type Row = Record<string, unknown>;

export const classOf = (em: EntityManager, name: string): abstract new (...args: never[]) => Record<string, unknown> =>
  em.getMetadata().getByClassName(name).class;

export const read = (row: unknown, name: string): unknown => Reflect.get(Object(row), name);

export const pathOfRow = (row: unknown): string =>
  pathOf({
    id: String(read(row, 'id')),
    filename: String(read(row, 'filename')),
    tenantId: String(read(row, 'tenantId')),
  });

/** Removes the record and leaves its object to the worker, after commit (MED-03, BPL-04). */
export function removeWithObject(em: EntityManager, row: Row, action: string): void {
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
