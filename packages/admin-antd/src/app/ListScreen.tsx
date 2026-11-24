/**
 * BieberKit
 *
 * @file        packages/admin-antd/src/app/ListScreen.tsx
 * @description The generic list of an entity: the columns that its metadata names, the page and the sort that the API gives, a link to each row, and the actions that the user may take (UI-03, UI-15).
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

import { allows, columnsOf, labelOf, listFields } from '@bieberkit/admin-core';
import type { MetaEntity, Row } from '@bieberkit/admin-core';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { App, Button, Card, Popconfirm, Result, Table } from 'antd';
import type { TableColumnsType } from 'antd';
import { useState } from 'react';
import type { JSX } from 'react';
import { useClient, useEntity } from './context.ts';

const PAGE_SIZE = 25;

const show = (value: unknown): string => {
  if (value === null || value === undefined) return '';
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  if (typeof value === 'object') return JSON.stringify(value);
  return typeof value === 'string' || typeof value === 'number' || typeof value === 'bigint' ? String(value) : '';
};

function Rows(props: { readonly entity: MetaEntity }): JSX.Element {
  const { entity } = props;
  const client = useClient();
  const queries = useQueryClient();
  const { message } = App.useApp();
  const [page, setPage] = useState(1);
  const [sort, setSort] = useState<string | undefined>();
  const where = entity.path.replace('/api/v1/', '');
  const list = useQuery({
    queryKey: ['list', entity.name, page, sort],
    queryFn: () =>
      client.list(entity, {
        page,
        pageSize: PAGE_SIZE,
        fields: listFields(entity),
        ...(sort === undefined ? {} : { sort }),
      }),
  });

  const remove = async (row: Row): Promise<void> => {
    try {
      await client.remove(entity, String(row['id']), Number(row['version']));
      void message.success('Deleted');
      await queries.invalidateQueries({ queryKey: ['list', entity.name] });
    } catch (error) {
      void message.error(error instanceof Error ? error.message : 'The row was not deleted');
    }
  };

  const columns: TableColumnsType<Row> = columnsOf(entity).map((field, index) => ({
    title: field.key,
    dataIndex: field.key,
    key: field.key,
    ...(field.sortable ? { sorter: true } : {}),
    render: (value: unknown, row: Row) =>
      index === 0 && entity.operations.get ? (
        <Link to={`/${where}/${String(row['id'])}`}>{show(value) || String(row['id'])}</Link>
      ) : (
        show(value)
      ),
  }));
  if (allows(entity, 'delete')) {
    columns.push({
      title: '',
      key: '_actions',
      render: (_value: unknown, row: Row) => (
        <Popconfirm title="Delete this row?" okText="Delete" onConfirm={() => void remove(row)}>
          <Button danger size="small">
            Delete
          </Button>
        </Popconfirm>
      ),
    });
  }

  return (
    <Card
      title={labelOf(entity, 'en')}
      extra={
        allows(entity, 'create') ? (
          <Link to={`/${where}/new`}>
            <Button type="primary">New</Button>
          </Link>
        ) : null
      }
    >
      {list.isError ? (
        <Result status="error" title="The list could not be loaded" subTitle={list.error.message} />
      ) : (
        <Table<Row>
          rowKey={(row) => String(row['id'])}
          columns={columns}
          dataSource={list.data?.rows.map((row) => ({ ...row })) ?? []}
          loading={list.isPending}
          scroll={{ x: true }}
          pagination={{ current: page, pageSize: PAGE_SIZE, total: list.data?.total ?? 0, showSizeChanger: false }}
          onChange={(pagination, _filters, sorter) => {
            setPage(pagination.current ?? 1);
            const one = Array.isArray(sorter) ? sorter[0] : sorter;
            const field = typeof one?.field === 'string' ? one.field : undefined;
            setSort(
              field === undefined || one?.order === undefined
                ? undefined
                : `${one.order === 'descend' ? '-' : ''}${field}`,
            );
          }}
        />
      )}
    </Card>
  );
}

export function ListScreen(): JSX.Element {
  const { entity, loading } = useEntity();
  if (loading) return <Card loading />;
  if (entity === undefined || !entity.can.read)
    return <Result status="404" title="This screen does not exist, or it is not open to you." />;
  return <Rows entity={entity} />;
}
