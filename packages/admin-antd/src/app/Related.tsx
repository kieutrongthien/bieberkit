/**
 * BieberKit
 *
 * @file        packages/admin-antd/src/app/Related.tsx
 * @description The tabs of a detail screen beside its form: the child tables, which are the rows of the entities that point at this row with a button for a new one, (UI-11). A plugin adds its own tabs.
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

import { allows, columnsOf, labelOf, listFields, relatedDefaults, relatedFilter } from '@bieberkit/admin-core';
import type { Related as RelatedEntity, Row } from '@bieberkit/admin-core';
import { useQuery } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { Button, Empty, Result, Table } from 'antd';
import { useState } from 'react';
import type { JSX } from 'react';
import { useClient } from './context.ts';
import { useLanguage, useT } from './language.tsx';

const SIZE = 10;

const show = (value: unknown): string =>
  value === null || value === undefined
    ? ''
    : typeof value === 'object'
      ? JSON.stringify(value)
      : typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean'
        ? String(value)
        : '';

/** The rows of one related entity that belong to the row `id`, and a button for a new one that points at it. */
export function RelatedRows(props: { readonly related: RelatedEntity; readonly id: string }): JSX.Element {
  const { related, id } = props;
  const client = useClient();
  const t = useT();
  const { locale } = useLanguage();
  const [page, setPage] = useState(1);
  const { entity } = related;
  const where = entity.path.replace('/api/v1/', '');
  const rows = useQuery({
    queryKey: ['list', entity.name, 'related', related.via.key, id, page],
    queryFn: () =>
      client.list(entity, { page, pageSize: SIZE, fields: listFields(entity), filters: [relatedFilter(related, id)] }),
  });
  const columns = columnsOf(entity)
    // The column that holds the relation back to this row says nothing here.
    .filter((field) => field.key !== related.via.key)
    .map((field, index) => ({
      title: field.key,
      dataIndex: field.key,
      key: field.key,
      render: (value: unknown, row: Row) =>
        index === 0 && entity.operations.get ? (
          <Link to={`/${where}/${String(row['id'])}`}>{show(value) || String(row['id'])}</Link>
        ) : (
          show(value)
        ),
    }));
  if (rows.isError) return <Result status="error" title={t('list.loadError')} subTitle={rows.error.message} />;
  return (
    <>
      {allows(entity, 'create') ? (
        <Link to={`/${where}/new`} search={relatedDefaults(related, id)}>
          <Button type="primary" size="small" style={{ marginBottom: 12 }}>
            {t('detail.newRelated', { name: labelOf(entity, locale) })}
          </Button>
        </Link>
      ) : null}
      <Table<Row>
        size="small"
        rowKey={(row) => String(row['id'])}
        columns={columns}
        dataSource={rows.data?.rows.map((row) => ({ ...row })) ?? []}
        loading={rows.isPending}
        locale={{ emptyText: <Empty description={t('detail.noRelated')} /> }}
        pagination={{
          current: page,
          pageSize: SIZE,
          total: rows.data?.total ?? 0,
          showSizeChanger: false,
          hideOnSinglePage: true,
          onChange: setPage,
        }}
      />
    </>
  );
}
