/**
 * BieberKit
 *
 * @file        e2e/fixtures/crm/src/admin/useAccounts.ts
 * @description The first page of the accounts, read with the client of the admin: what the screens of the fixture plugin read.
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

import { useAdminClient, useMeta } from '@bieberkit/admin-antd';
import type { Page } from '@bieberkit/admin-core';
import { useEffect, useState } from 'react';

export function useAccounts(pageSize: number): Page | undefined {
  const client = useAdminClient();
  const entity = useMeta()?.entities.find((candidate) => candidate.name === 'crm.Account');
  const [page, setPage] = useState<Page | undefined>();
  useEffect(() => {
    if (entity === undefined) return;
    void client.list(entity, { pageSize, sort: 'code' }).then(setPage);
  }, [client, entity, pageSize]);
  return page;
}
