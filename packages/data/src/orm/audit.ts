/**
 * BieberKit
 *
 * @file        packages/data/src/orm/audit.ts
 * @description Audit entries written with the data of a unit of work, and the sink that records the use of asSystem in the audit log (OBS-05, AUTHZ-05).
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

import type { EntityManager } from '@mikro-orm/core';
import { requestContext } from '@bieberkit/core';
import { dataError } from '../errors.ts';
import type { Orm } from './connect.ts';
import { AuditLog } from './framework.ts';
import type { AuditSink, SystemScopeEntry } from './tenant.ts';

export interface AuditEntry {
  /** What happened, for example `auth.role.update` or `crm.customer.approve`. */
  readonly action: string;
  readonly entity?: string;
  readonly recordId?: string;
  /** Why, in words. `asSystem` writes the reason it was given. */
  readonly reason?: string;
  /** What changed. Anything that JSON can hold. Never put a value of a `pii` field in it in clear text (PDP-06). */
  readonly data?: unknown;
  /** The tenant of the entry. Defaults to the tenant of the request. */
  readonly tenantId?: string;
}

function dataText(data: unknown): string | null {
  if (data === undefined) return null;
  const text = JSON.stringify(data);
  if (text === undefined) {
    throw dataError(
      'DATA_AUDIT_INVALID',
      500,
      'The data of an audit entry is not JSON.',
      'Put text, numbers, booleans, null, arrays and objects in it.',
    );
  }
  return text;
}

/**
 * Adds an audit entry to the unit of work. The flush that writes the data writes it, in the same transaction, and a flush that
 * fails leaves no entry (§7.5, OBS-05). The actor and the request come from the request context.
 */
export function recordAudit(em: EntityManager, entry: AuditEntry): void {
  if (entry.action.trim() === '' || entry.action.length > 200) {
    throw dataError(
      'DATA_AUDIT_INVALID',
      500,
      'The action of an audit entry has 1 to 200 characters.',
      'Name it like auth.role.update.',
    );
  }
  const context = requestContext.get();
  em.create(AuditLog, {
    action: entry.action,
    at: new Date(),
    entity: entry.entity ?? null,
    recordId: entry.recordId ?? null,
    reason: entry.reason ?? null,
    data: dataText(entry.data),
    tenant: entry.tenantId ?? context?.tenantId ?? null,
    actorId: context?.userId ?? null,
    requestId: context?.requestId ?? null,
  });
}

/**
 * The sink that writes the use of `asSystem` to the audit log (AUTHZ-05). It writes in a transaction of its own and before the
 * function runs, so a function that fails still leaves its entry, and a write that fails stops the scope from starting.
 */
export function auditTableSink(orm: Orm): AuditSink {
  return {
    async record(entry: SystemScopeEntry): Promise<void> {
      const em = orm.em.fork();
      em.create(AuditLog, {
        action: 'system.scope',
        reason: entry.reason,
        at: entry.at,
        tenant: entry.tenantId ?? null,
        actorId: entry.userId ?? null,
        requestId: entry.requestId ?? null,
      });
      await em.flush();
    },
  };
}
