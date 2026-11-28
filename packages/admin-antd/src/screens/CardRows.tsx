/**
 * BieberKit
 *
 * @file        packages/admin-antd/src/screens/CardRows.tsx
 * @description The rows of a list as cards, for a screen too narrow for a table: the first column is the title, the rest are labelled lines, and the actions and the selection are the ones of the table (UI-16).
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

import { columnsOf } from '@bieberkit/admin-core';
import type { MetaEntity, MetaField, Row } from '@bieberkit/admin-core';
import { Link } from '@tanstack/react-router';
import { Card, Checkbox, Empty, Pagination, Skeleton, Space, theme } from 'antd';
import type { JSX, ReactNode } from 'react';
import { useT } from '../lib/language.tsx';

export function CardRows(props: {
  readonly entity: MetaEntity;
  readonly rows: readonly Row[];
  readonly loading: boolean;
  readonly where: string;
  /** The text of a cell: what the row holds for the field, or the name of the row that a relation points at. */
  readonly cell: (row: Row, field: MetaField) => string;
  readonly actions: (row: Row) => ReactNode;
  readonly selected: readonly Row[] | undefined;
  readonly onSelect: (rows: readonly Row[]) => void;
  readonly page: number;
  readonly pageSize: number;
  readonly total: number;
  readonly onPage: (page: number) => void;
}): JSX.Element {
  const { entity, rows, loading, where, cell, actions, selected, onSelect } = props;
  const t = useT();
  const { token } = theme.useToken();
  const [title, ...rest] = columnsOf(entity);
  if (loading) return <Skeleton active />;
  if (rows.length === 0) return <Empty />;
  const chosen = new Set((selected ?? []).map((row) => String(row['id'])));
  return (
    <Space direction="vertical" size="middle" style={{ width: '100%' }}>
      <div role="list" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        {rows.map((row) => {
          const id = String(row['id']);
          const heading = title === undefined ? id : cell(row, title) || id;
          return (
            <Card
              key={id}
              size="small"
              role="listitem"
              title={
                <Space>
                  {selected === undefined ? null : (
                    <Checkbox
                      aria-label={t('list.selectRow', { name: heading })}
                      checked={chosen.has(id)}
                      onChange={(event) =>
                        onSelect(
                          event.target.checked
                            ? [...(selected ?? []), row]
                            : (selected ?? []).filter((item) => String(item['id']) !== id),
                        )
                      }
                    />
                  )}
                  {entity.operations.get ? <Link to={`/${where}/${id}`}>{heading}</Link> : heading}
                </Space>
              }
            >
              <dl
                style={{
                  margin: 0,
                  display: 'grid',
                  gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 2fr)',
                  gap: '4px 12px',
                }}
              >
                {rest.map((field) => (
                  <div key={field.key} style={{ display: 'contents' }}>
                    <dt style={{ color: token.colorTextDescription }}>{field.key}</dt>
                    <dd style={{ margin: 0, overflowWrap: 'anywhere' }}>{cell(row, field)}</dd>
                  </div>
                ))}
              </dl>
              <Space wrap size="small" style={{ marginTop: 12 }}>
                {actions(row)}
              </Space>
            </Card>
          );
        })}
      </div>
      <Pagination
        simple
        current={props.page}
        pageSize={props.pageSize}
        total={props.total}
        showSizeChanger={false}
        onChange={props.onPage}
      />
    </Space>
  );
}
