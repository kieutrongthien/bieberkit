/**
 * BieberKit
 *
 * @file        plugins/settings/src/routes/shared.ts
 * @description What the routes of the settings share: their schemas and the scope of a request.
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

import type { RouteContext } from '@bieberkit/http';
import type { Change } from '../services/types.ts';

export const where = (ctx: RouteContext): { tenantId?: string } =>
  ctx.tenantId === undefined ? {} : { tenantId: ctx.tenantId };

const clientIp = (ctx: RouteContext): string => {
  const header = ctx.headers['x-bk-client-ip'];
  return (Array.isArray(header) ? header[0] : header) ?? '';
};

export const change = (ctx: RouteContext): Change => ({
  ...where(ctx),
  actorId: ctx.principal?.id ?? null,
  actor: { ip: clientIp(ctx), mfa: ctx.principal?.mfa === true },
});
