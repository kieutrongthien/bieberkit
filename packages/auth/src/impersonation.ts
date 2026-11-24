/**
 * BieberKit
 *
 * @file        packages/auth/src/impersonation.ts
 * @description The audit entries of impersonation: who acted as whom, why, and when it ended. The framework has no impersonation yet, and any feature that adds it must call these (AUTHZ-05).
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
import { dataError } from '@bieberkit/data';
import { emitEvent, recordAudit } from '@bieberkit/data/orm';

export interface ImpersonationEntry {
  /** The person who acts. It is the real user, not the one that is acted as. */
  readonly actorId: string;
  /** The user that is acted as. */
  readonly targetId: string;
  readonly tenantId?: string;
  /** Why, in the words of the actor. It is required when the impersonation starts. */
  readonly reason?: string;
}

const ENTITY = 'auth.User';

function check(entry: ImpersonationEntry, phase: 'start' | 'end'): string | undefined {
  if (entry.actorId === entry.targetId) {
    throw dataError(
      'AUTHZ_IMPERSONATION_INVALID',
      400,
      'A user cannot impersonate themselves.',
      'Name another user as the target.',
    );
  }
  const reason = entry.reason?.trim();
  if (phase === 'start' && (reason === undefined || reason === '' || reason.length > 500)) {
    throw dataError(
      'AUTHZ_IMPERSONATION_INVALID',
      400,
      'Impersonation needs a reason of 1 to 500 characters.',
      'Say why, for example: support ticket 4821.',
    );
  }
  return reason === undefined || reason === '' ? undefined : reason;
}

function write(em: EntityManager, phase: 'start' | 'end', entry: ImpersonationEntry): void {
  const reason = check(entry, phase);
  const data = { actorId: entry.actorId, targetId: entry.targetId, phase };
  recordAudit(em, {
    action: `auth.impersonation.${phase}`,
    entity: ENTITY,
    recordId: entry.targetId,
    ...(entry.tenantId === undefined ? {} : { tenantId: entry.tenantId }),
    ...(reason === undefined ? {} : { reason }),
    data,
  });
  // The same fact for a subscriber that tells the person who was acted as, or a security team.
  emitEvent(em, {
    name: `auth.impersonation.${phase}`,
    payload: { ...data, ...(entry.tenantId === undefined ? {} : { tenantId: entry.tenantId }) },
    record: { entity: ENTITY, id: entry.targetId },
  });
}

/**
 * Writes that `actorId` starts to act as `targetId`, with the reason, in the unit of work of the caller (AUTHZ-05). The entry carries
 * both ids in its data, because during the impersonation the request context may name the user that is acted as. A feature of
 * impersonation calls it in the same transaction that makes the session, so there is no impersonation without an entry.
 */
export function recordImpersonationStart(em: EntityManager, entry: ImpersonationEntry): void {
  write(em, 'start', entry);
}

/** Writes that the impersonation ended, by the actor, by the expiry of the session or by the target. */
export function recordImpersonationEnd(em: EntityManager, entry: ImpersonationEntry): void {
  write(em, 'end', entry);
}
