/**
 * BieberKit
 *
 * @file        plugins/audit-log/src/admin/History.tsx
 * @description The tab of the history of a record: what the audit log says about the row, newest first (UI-03, UI-35, slot 5).
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

import { useAdminClient, useLanguage, useText } from '@bieberkit/admin-antd';
import type { RecordTabProps } from '@bieberkit/admin-antd';
import { formatDateTime } from '@bieberkit/admin-core';
import { useQuery } from '@tanstack/react-query';
import { Empty, Result, Skeleton, Timeline } from 'antd';
import type { JSX } from 'react';
import { historyLine, readHistory } from './history.ts';

/** A person who may not read the audit log is told so and nothing else. */
export function History(props: RecordTabProps): JSX.Element {
  const { entity, id } = props;
  const client = useAdminClient();
  const t = useText();
  const { locale } = useLanguage();
  const history = useQuery({
    queryKey: ['audit-log', entity.name, id],
    queryFn: () => readHistory(client, entity.name, id),
    retry: false,
    // A save makes the history longer, so what was read is not kept once the tab is gone.
    gcTime: 0,
  });
  if (history.isPending) return <Skeleton active />;
  if (history.isError)
    return <Result status="warning" title={t('audit-log.denied')} subTitle={history.error.message} />;
  if (history.data.length === 0) return <Empty description={t('audit-log.none')} />;
  return (
    <Timeline
      items={history.data.map((entry) => ({
        key: entry.id,
        content: (
          <>
            <strong>{historyLine(entry)}</strong>
            <br />
            <span>{`${entry.who} · ${formatDateTime(locale, entry.at)}`}</span>
          </>
        ),
      }))}
    />
  );
}
