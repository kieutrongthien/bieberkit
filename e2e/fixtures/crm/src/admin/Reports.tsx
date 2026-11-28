/**
 * BieberKit
 *
 * @file        e2e/fixtures/crm/src/admin/Reports.tsx
 * @description A page that the fixture plugin adds: it reads the API with the client of the admin (UI-35, slot 2).
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

import { useCan, useText } from '@bieberkit/admin-antd';
import { Skeleton } from 'antd';
import type { JSX } from 'react';
import { useAccounts } from './useAccounts.ts';

export default function Reports(): JSX.Element {
  const text = useText();
  const mayClose = useCan('crm.ticket.close');
  const page = useAccounts(5);
  if (page === undefined) return <Skeleton active />;
  return (
    <div>
      <p>{text('crm.byCode')}</p>
      {mayClose ? <p>{text('crm.mayClose')}</p> : null}
      <ul aria-label={text('crm.codes')}>
        {page.rows.map((row) => (
          <li key={String(row['code'])}>{String(row['code'])}</li>
        ))}
      </ul>
    </div>
  );
}
