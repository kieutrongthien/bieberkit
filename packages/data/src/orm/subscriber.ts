/**
 * BieberKit
 *
 * @file        packages/data/src/orm/subscriber.ts
 * @description The flush hooks: the tenant of every new row, the immutability of the tenant, and the check of references (DATA-09, DATA-20).
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

import { ChangeSetType } from '@mikro-orm/core';
import type { EventSubscriber, FlushEventArgs } from '@mikro-orm/core';
import { dataError } from '../errors.ts';
import { AUDIT_ENTITY } from './framework.ts';
import { entityMeta, isNewRow } from './internals.ts';
import { assertReferencesVisible, referencedIds } from './references.ts';
import type { ReferenceVisibility } from './references.ts';
import { isSystemScope, requireTenant } from './tenant.ts';

type Row = Record<string, unknown>;

/** Hooks of the data layer, registered by `createDatabase`. */
export class DataSubscriber implements EventSubscriber {
  readonly #references: ReferenceVisibility | undefined;

  constructor(references?: ReferenceVisibility) {
    this.#references = references;
  }

  /** Before the changes are computed: gives a new tenant row its tenant, and refuses one that names another tenant. */
  beforeFlush({ uow }: FlushEventArgs): void {
    for (const entity of uow.getPersistStack()) {
      const row: Row = entity;
      if (!('tenantId' in entityMeta(row).properties) || !isNewRow(row)) continue;
      const given = row['tenantId'];
      if (isSystemScope()) {
        if (given === undefined) requireTenant();
        continue;
      }
      const tenant = requireTenant();
      if (given === undefined) row['tenantId'] = tenant;
      else if (typeof given !== 'string' || given.toLowerCase() !== tenant) {
        throw dataError(
          'DATA_TENANT_MISMATCH',
          403,
          'The row names another tenant than the request.',
          'Leave tenantId out. It is taken from the request.',
        );
      }
    }
  }

  /** After the changes are computed: the tenant of a row never changes, and every reference must be visible. */
  async onFlush({ em, uow }: FlushEventArgs): Promise<void> {
    const entities: { entity: Row; created: boolean; changed: readonly string[] }[] = [];
    for (const change of uow.getChangeSets()) {
      if (change.type !== ChangeSetType.CREATE && entityMeta(change.entity).className === AUDIT_ENTITY) {
        throw dataError(
          'DATA_AUDIT_APPEND_ONLY',
          500,
          'An audit entry is never changed or deleted.',
          'Write a new entry that corrects the old one.',
        );
      }
      const created = change.type === ChangeSetType.CREATE;
      const changed = Object.keys(change.payload);
      if (!created && changed.includes('tenantId')) {
        throw dataError(
          'DATA_TENANT_IMMUTABLE',
          403,
          'The tenant of a row cannot change.',
          'Create a new row for the other tenant.',
        );
      }
      if (created || change.type === ChangeSetType.UPDATE) entities.push({ entity: change.entity, created, changed });
    }
    const wanted = referencedIds(entities);
    if (wanted.size > 0) await assertReferencesVisible(em, wanted, this.#references);
  }
}
