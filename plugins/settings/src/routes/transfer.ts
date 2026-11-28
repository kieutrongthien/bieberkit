/**
 * BieberKit
 *
 * @file        plugins/settings/src/routes/transfer.ts
 * @description The routes that export and import settings (SET-07).
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

import { defineRoute } from '@bieberkit/http';
import type { RouteDef } from '@bieberkit/http';
import { change, where } from './shared.ts';
import type { ImportEntry } from '../services/types.ts';

const importEntry = {
  type: 'object',
  properties: { key: { type: 'string', minLength: 1, maxLength: 120 }, value: {}, secret: { type: 'boolean' } },
  required: ['key'],
  additionalProperties: false,
} as const;

const exported = {
  type: 'object',
  properties: {
    version: { type: 'integer' },
    scope: { type: 'string' },
    settings: { type: 'array', items: importEntry },
  },
  required: ['version', 'scope', 'settings'],
} as const;

const report = {
  type: 'object',
  properties: {
    dryRun: { type: 'boolean' },
    results: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          key: { type: 'string' },
          result: { type: 'string', enum: ['created', 'updated', 'unchanged', 'skipped', 'invalid'] },
          code: { type: 'string' },
          message: { type: 'string' },
        },
        required: ['key', 'result'],
      },
    },
  },
  required: ['dryRun', 'results'],
} as const;

export const transferRoutes: readonly RouteDef[] = [
  defineRoute({
    method: 'GET',
    url: '/api/v1/settings/export',
    permission: 'settings.read',
    schema: { response: { 200: exported } },
    handler: (ctx) => ctx.services.settings.exportStored(where(ctx)),
  }),
  defineRoute({
    method: 'POST',
    url: '/api/v1/settings/import',
    permission: 'settings.manage',
    idempotent: true,
    schema: {
      query: {
        type: 'object',
        properties: { dryRun: { type: 'boolean' } },
        additionalProperties: false,
      },
      body: {
        type: 'object',
        properties: { settings: { type: 'array', maxItems: 1000, items: importEntry } },
        required: ['settings'],
        additionalProperties: false,
      },
      response: { 200: report },
    },
    handler(ctx) {
      const list = Reflect.get(Object(ctx.body), 'settings');
      const entries = (Array.isArray(list) ? list : []).map((item): ImportEntry => {
        const secret = Reflect.get(Object(item), 'secret') === true;
        return {
          key: String(Reflect.get(Object(item), 'key')),
          ...(secret ? { secret } : { value: Reflect.get(Object(item), 'value') }),
        };
      });
      return ctx.services.settings.importStored(entries, change(ctx), { dryRun: ctx.query['dryRun'] === true });
    },
  }),
];
