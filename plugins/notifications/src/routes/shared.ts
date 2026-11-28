/**
 * BieberKit
 *
 * @file        plugins/notifications/src/routes/shared.ts
 * @description What the routes of the notifications share.
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

import { recordAudit } from '@bieberkit/data/orm';
import type { runInTransaction } from '@bieberkit/data/orm';
import type { RouteContext } from '@bieberkit/http';
import { Notification } from '../entities/notification.ts';

export const ME = '/api/v1/notifications/me';

export type EntityManager = Parameters<Parameters<typeof runInTransaction>[1]>[0];

export const classOf = (em: EntityManager, name: string): abstract new (...args: never[]) => Record<string, unknown> =>
  em.getMetadata().getByClassName(name).class;

export const text = (row: unknown, name: string): unknown => Reflect.get(Object(row), name);

/** The signed-in person. The permission of the route made sure there is one. */
export const meOf = (ctx: RouteContext): string => String(ctx.principal?.id);

export function audit(
  em: EntityManager,
  action: string,
  recordId: string | undefined,
  data: Record<string, unknown>,
): void {
  recordAudit(em, { action, entity: Notification.name, ...(recordId === undefined ? {} : { recordId }), data });
}
