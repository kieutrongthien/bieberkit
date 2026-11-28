/**
 * BieberKit
 *
 * @file        plugins/audit-log/src/admin/history.test.ts
 * @description The history of a row as the audit log tells it: what is asked, and how an entry is read and shown (UI-03).
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

import { createAdminClient } from '@bieberkit/admin-core';
import { describe, expect, it } from 'vitest';
import { historyLine, historyOf, historyQuery, readHistory } from './history.ts';

interface Call {
  url: string;
  method: string;
  headers: Record<string, string>;
  body: unknown;
}

function fake(answer: (call: Call) => Response): { fetch: typeof fetch; calls: Call[] } {
  const calls: Call[] = [];
  const fetcher: typeof fetch = async (input, init) => {
    const headers = Object.fromEntries(Object.entries(Object(init?.headers))) as Record<string, string>;
    const call: Call = {
      url: typeof input === 'string' ? input : input instanceof URL ? input.href : input.url,
      method: init?.method ?? 'GET',
      headers,
      body: typeof init?.body === 'string' ? JSON.parse(init.body) : undefined,
    };
    calls.push(call);
    return answer(call);
  };
  return { fetch: fetcher, calls };
}

const json = (body: unknown, status = 200): Response =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

describe('UI-03 the history of a row', () => {
  it('UI-03 asks the audit log for the entity and the record, newest first, with a page size', () => {
    expect(historyQuery('crm.Account', 'a 1')).toBe('?entity=crm.Account&recordId=a%201&pageSize=20');
  });

  it('UI-03 reads the entries of the answer, with the name of the actor, and the fields that changed', () => {
    const entries = historyOf({
      data: [
        {
          id: 'e1',
          at: '2026-03-05T10:00:00.000Z',
          action: 'crm.Account.update',
          actor: { name: 'Ann', email: 'a@x.co' },
          data: { fields: ['name', 'note'] },
        },
        { id: 'e2', at: '2026-03-04T10:00:00.000Z', action: 'crm.Account.create', actor: { email: 'b@x.co' } },
        { id: 'e3', at: '2026-03-03T10:00:00.000Z', action: 'crm.Account.delete', actor: null },
        { nothing: true },
      ],
    });
    expect(entries.map((entry) => [entry.id, entry.who, historyLine(entry)])).toEqual([
      ['e1', 'Ann', 'update (name, note)'],
      ['e2', 'b@x.co', 'create'],
      ['e3', '-', 'delete'],
    ]);
    expect(historyOf(undefined)).toEqual([]);
    expect(historyOf({ data: 'x' })).toEqual([]);
  });
});

describe('UI-03 the call of the history', () => {
  it('UI-03 the history of a row is read from the audit log by entity and record', async () => {
    const { fetch: fetcher, calls } = fake(() =>
      json({
        data: [
          {
            id: 'e1',
            at: '2026-03-05T10:00:00.000Z',
            action: 'settings.Setting.update',
            actor: { name: 'Ann' },
            data: { fields: ['value'] },
          },
        ],
      }),
    );
    const entries = await readHistory(createAdminClient({ fetch: fetcher }), 'settings.Setting', '1');
    expect(calls[0]?.url).toBe('/api/v1/audit-log/entries?entity=settings.Setting&recordId=1&pageSize=20');
    expect(entries.map((entry) => [entry.who, entry.fields])).toEqual([['Ann', ['value']]]);
  });
});
