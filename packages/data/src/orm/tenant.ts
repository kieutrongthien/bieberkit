/**
 * BieberKit
 *
 * @file        packages/data/src/orm/tenant.ts
 * @description The tenant of the request, the system scope that switches the tenant filter off, and the audit entry it leaves (DATA-09, DATA-19).
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

import { AsyncLocalStorage } from 'node:async_hooks';
import { requestContext } from '@bieberkit/core';
import { dataError } from '../errors.ts';
import { isUuid, uuid7 } from '../keys/uuid7.ts';

/** What an `asSystem` call leaves behind: who switched the tenant filter off, and why. */
export interface SystemScopeEntry {
  readonly reason: string;
  readonly userId?: string;
  readonly requestId?: string;
  readonly tenantId?: string;
  readonly at: Date;
}

/** Where `asSystem` records its use. The audit log of slice 6 is one; until then the default writes a log line. */
export interface AuditSink {
  record(entry: SystemScopeEntry): void | Promise<void>;
}

const system = new AsyncLocalStorage<true>();

/** The tenant of the request that is running, or `undefined`. It is set by the HTTP layer once per request (DATA-19). */
export function currentTenantId(): string | undefined {
  return requestContext.get()?.tenantId;
}

/** Runs `fn` as the tenant `tenantId`, keeping the rest of the request context. For jobs, scripts and tests. */
export function runAsTenant<T>(tenantId: string, fn: () => T): T {
  if (!isUuid(tenantId)) {
    throw dataError(
      'DATA_UUID_INVALID',
      400,
      `The tenant "${String(tenantId)}" is not a UUID.`,
      'Use the UUID of the tenant.',
    );
  }
  const current = requestContext.get();
  return requestContext.run({ ...(current ?? { requestId: uuid7() }), tenantId: tenantId.toLowerCase() }, fn);
}

/** True inside `db.asSystem`, for the async call tree of the function it was given. */
export function isSystemScope(): boolean {
  return system.getStore() === true;
}

/** The tenant that a query must stay inside. Without one, and outside the system scope, the query is refused. */
export function requireTenant(): string {
  const tenant = currentTenantId();
  if (tenant === undefined) {
    throw dataError(
      'DATA_TENANT_REQUIRED',
      400,
      'This request has no tenant.',
      'Send the tenant of the request, or run the job inside runAsTenant(tenantId, fn).',
    );
  }
  return tenant;
}

/** Runs `fn` with the tenant filter off. Only `Database.asSystem` calls it, after it has recorded the use. */
export function runInSystemScope<T>(fn: () => T): T {
  return system.run(true, fn);
}

/** Checks the reason, builds the audit entry from the request, and records it. If recording fails the scope does not start. */
export async function openSystemScope<T>(reason: string, sink: AuditSink, fn: () => Promise<T>): Promise<T> {
  if (typeof reason !== 'string' || reason.trim() === '') {
    throw dataError(
      'DATA_SYSTEM_SCOPE_REASON',
      500,
      'asSystem needs a reason.',
      'Say why the tenant filter is switched off, for example asSystem("nightly report", fn). The reason goes to the audit log.',
    );
  }
  const context = requestContext.get();
  const entry: SystemScopeEntry = {
    reason: reason.trim(),
    at: new Date(),
    ...(context?.userId === undefined ? {} : { userId: context.userId }),
    ...(context?.requestId === undefined ? {} : { requestId: context.requestId }),
    ...(context?.tenantId === undefined ? {} : { tenantId: context.tenantId }),
  };
  await sink.record(entry);
  return runInSystemScope(fn);
}
