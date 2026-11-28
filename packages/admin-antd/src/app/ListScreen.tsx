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

import {
  allows,
  columnsOf,
  csvOf,
  deleteView,
  exportPages,
  filterProblem,
  labelOf,
  includeOf,
  listFields,
  loadViews,
  sameView,
  operatorsOf,
  PAGE_SIZES,
  relationLabel,
  shouldVirtualize,
  saveView,
  viewFromSearch,
  viewsKey,
  viewToSearch,
} from '@bieberkit/admin-core';
import type { Filter, FilterOperator, MetaEntity, MetaField, Row, SavedView } from '@bieberkit/admin-core';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate, useSearch } from '@tanstack/react-router';
import { App, Button, Card, Grid, Input, Popconfirm, Result, Select, Space, Table, Tag } from 'antd';
import type { TableColumnsType } from 'antd';
import type { RefSelectProps } from 'antd/es/select';
import { useRef, useState } from 'react';
import type { JSX } from 'react';
import { useClient, useEntity, useMeta } from './context.ts';
import { RelationSelect } from './RelationSelect.tsx';
import { useLanguage, useT } from './language.tsx';
import { BulkBar, RowMoves, useRowChanges } from './moves.tsx';
import type { ScreenProps } from './slot-props.ts';
import { Slot, useAllowed, useRegistry } from './slots.tsx';
import { CardRows } from './CardRows.tsx';
import { useShortcuts } from './shortcuts.ts';

const EXPORT_PAGE_SIZE = 100;
const EXPORT_LIMIT = 10_000;

const isSession = (value: unknown): value is { readonly id: string } =>
  typeof value === 'object' && value !== null && 'id' in value && typeof value.id === 'string';

/** The control for the value of a filter: the choices of a `oneOf` field and `true` or `false` are picked, the rest is typed. */
function ValueInput(props: {
  readonly field: MetaField;
  readonly op: FilterOperator;
  readonly value: string;
  readonly onChange: (value: string) => void;
}): JSX.Element {
  const { field, op, value, onChange } = props;
  const t = useT();
  if (op === 'null' || (field.kind === 'boolean' && op === 'eq')) {
    return (
      <Select
        aria-label={t('list.filterValue')}
        value={value === '' ? null : value}
        onChange={onChange}
        style={{ minWidth: 120 }}
        options={[
          { value: 'true', label: t('common.yes') },
          { value: 'false', label: t('common.no') },
        ]}
      />
    );
  }
  if (field.kind === 'belongsTo' && (op === 'eq' || op === 'ne')) {
    return (
      <RelationSelect
        label={t('list.filterValue')}
        field={field}
        value={value === '' ? null : value}
        onChange={(next) => onChange(typeof next === 'string' ? next : '')}
      />
    );
  }
  if (field.kind === 'oneOf' && field.values !== undefined && (op === 'eq' || op === 'ne')) {
    return (
      <Select
        aria-label={t('list.filterValue')}
        value={value === '' ? null : value}
        onChange={onChange}
        style={{ minWidth: 160 }}
        options={field.values.map((choice) => ({ value: choice, label: choice }))}
      />
    );
  }
  return (
    <Input
      aria-label={t('list.filterValue')}
      value={value}
      onChange={(event) => onChange(event.target.value)}
      style={{ minWidth: 180 }}
    />
  );
}

/** One condition at a time is built here and added to the list of filters. A condition that the API would refuse is not added (UI-03). */
function FilterBar(props: {
  readonly entity: MetaEntity;
  readonly filters: readonly Filter[];
  readonly onChange: (filters: readonly Filter[]) => void;
  /** The select of the field, so that `/` can take the focus to it. */
  readonly fieldRef: React.Ref<RefSelectProps>;
}): JSX.Element {
  const { entity, filters, onChange, fieldRef } = props;
  const t = useT();
  const fields = entity.fields.filter((field) => field.filterable);
  const [key, setKey] = useState<string | undefined>();
  const [op, setOp] = useState<FilterOperator>('eq');
  const [value, setValue] = useState('');
  const [problem, setProblem] = useState<string | undefined>();
  const field = fields.find((candidate) => candidate.key === key);
  if (fields.length === 0) return <span />;
  const add = (): void => {
    if (key === undefined) return;
    const filter: Filter = { field: key, op, value: value.trim() };
    const found = filterProblem(entity, filter);
    setProblem(found);
    if (found !== undefined) return;
    onChange([...filters, filter]);
    setValue('');
  };
  return (
    <Space direction="vertical" size="small" style={{ width: '100%', marginBottom: 12 }}>
      <Space wrap>
        <Select
          ref={fieldRef}
          aria-label={t('list.filterField')}
          placeholder={t('list.filterField')}
          value={key ?? null}
          onChange={(next: string) => {
            setKey(next);
            setOp('eq');
            setValue('');
            setProblem(undefined);
          }}
          style={{ minWidth: 160 }}
          options={fields.map((candidate) => ({ value: candidate.key, label: candidate.key }))}
        />
        {field === undefined ? null : (
          <>
            <Select
              aria-label={t('list.filterOp')}
              value={op}
              onChange={(next: FilterOperator) => {
                setOp(next);
                setValue('');
              }}
              style={{ minWidth: 140 }}
              options={operatorsOf(field.kind).map((candidate) => ({
                value: candidate,
                label: t(`list.op.${candidate}`),
              }))}
            />
            <ValueInput field={field} op={op} value={value} onChange={setValue} />
            <Button onClick={add}>{t('list.filterAdd')}</Button>
          </>
        )}
      </Space>
      {problem === undefined ? null : (
        <span role="alert" style={{ color: 'var(--ant-color-error, #cf1322)' }}>
          {problem}
        </span>
      )}
      {filters.length === 0 ? null : (
        <Space wrap>
          {filters.map((filter, at) => (
            <Tag
              key={`${filter.field}${filter.op}${filter.value}`}
              closable
              onClose={() => onChange(filters.filter((_, index) => index !== at))}
            >
              {filter.field} {t(`list.op.${filter.op}`)}{' '}
              {filter.op === 'null' ? (filter.value === 'true' ? t('common.yes') : t('common.no')) : filter.value}
            </Tag>
          ))}
          <Button size="small" type="link" onClick={() => onChange([])}>
            {t('list.filterClear')}
          </Button>
        </Space>
      )}
    </Space>
  );
}

/** The views that a person keeps for this list. They rest in the browser, for this user and this entity. */
function Views(props: {
  readonly storageKey: string;
  readonly current: SavedView;
  readonly onPick: (view: SavedView) => void;
}): JSX.Element {
  const { storageKey, current, onPick } = props;
  const t = useT();
  const { message } = App.useApp();
  const [views, setViews] = useState(() => loadViews(window.localStorage, storageKey));
  const [name, setName] = useState('');
  // The view that the list shows now, if it is one that was saved: it follows the filters, so a view can be picked again after a change.
  const picked =
    current.filters.length === 0 && current.sort === undefined
      ? undefined
      : views.find((view) => sameView(view, current))?.name;
  return (
    <Space wrap style={{ marginBottom: 12 }}>
      <Select
        allowClear
        aria-label={t('list.views')}
        placeholder={t('list.views')}
        value={picked ?? null}
        style={{ minWidth: 180 }}
        options={views.map((view) => ({ value: view.name, label: view.name }))}
        onChange={(next: string | undefined) => {
          const view = views.find((candidate) => candidate.name === next);
          if (view !== undefined) onPick(view);
        }}
      />
      {picked === undefined ? null : (
        <Button
          size="small"
          onClick={() => {
            deleteView(window.localStorage, storageKey, picked);
            setViews(loadViews(window.localStorage, storageKey));
          }}
        >
          {t('list.viewDelete')}
        </Button>
      )}
      <Space.Compact>
        <Input
          aria-label={t('list.viewName')}
          placeholder={t('list.viewName')}
          value={name}
          maxLength={60}
          onChange={(event) => setName(event.target.value)}
        />
        <Button
          disabled={name.trim() === ''}
          onClick={() => {
            saveView(window.localStorage, storageKey, { ...current, name: name.trim() });
            setViews(loadViews(window.localStorage, storageKey));
            setName('');
            void message.success(t('list.viewSaved'));
          }}
        >
          {t('list.viewSave')}
        </Button>
      </Space.Compact>
    </Space>
  );
}

const show = (value: unknown, t: (key: 'common.yes' | 'common.no') => string): string => {
  if (value === null || value === undefined) return '';
  if (typeof value === 'boolean') return value ? t('common.yes') : t('common.no');
  if (typeof value === 'object') return JSON.stringify(value);
  return typeof value === 'string' || typeof value === 'number' || typeof value === 'bigint' ? String(value) : '';
};

function download(name: string, text: string): void {
  const url = URL.createObjectURL(new Blob([`\uFEFF${text}`], { type: 'text/csv;charset=utf-8' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = name;
  link.click();
  URL.revokeObjectURL(url);
}

function Rows(props: { readonly entity: MetaEntity }): JSX.Element {
  const { entity } = props;
  const client = useClient();
  const queries = useQueryClient();
  const { message } = App.useApp();
  const t = useT();
  const { locale } = useLanguage();
  const changes = useRowChanges(entity);
  const meta = useMeta();
  const navigate = useNavigate();
  // The filters and the sort live in the address, so that a link opens the same list and the back button undoes a filter.
  const search: Readonly<Record<string, unknown>> = useSearch({ strict: false });
  const view = viewFromSearch(search);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(PAGE_SIZES[0] ?? 25);
  const searchField = useRef<RefSelectProps>(null);
  // Under 768 px a table does not fit, and the rows are cards (UI-16). The first answer of the browser has no width yet, and that is the wide layout.
  const compact = Grid.useBreakpoint().md === false;
  const [selected, setSelected] = useState<readonly Row[]>([]);
  const [exporting, setExporting] = useState(false);
  const where = entity.path.replace('/api/v1/', '');
  const session = queries.getQueryData(['session']);
  const storageKey = viewsKey(entity.name, isSession(session) ? session.id : 'anonymous');
  const filters = view.filters.filter((filter) => filterProblem(entity, filter) === undefined);
  const sort = view.sort;
  const wanted = JSON.stringify({ filters, sort });
  const list = useQuery({
    queryKey: ['list', entity.name, page, pageSize, wanted],
    queryFn: () =>
      client.list(entity, {
        page,
        pageSize,
        fields: listFields(entity),
        include: includeOf(entity),
        filters,
        ...(sort === undefined ? {} : { sort }),
      }),
  });

  const applyView = (next: SavedView): void => {
    setPage(1);
    setSelected([]);
    void navigate({ to: '.', search: viewToSearch(next), replace: true });
  };

  useShortcuts((shortcut) => {
    if (shortcut === 'new' && allows(entity, 'create')) {
      void navigate({ to: `/${where}/new` });
      return true;
    }
    if (shortcut === 'search') {
      searchField.current?.focus();
      return true;
    }
    return false;
  });

  const remove = async (row: Row): Promise<void> => {
    try {
      await client.remove(entity, String(row['id']), Number(row['version']));
      void message.success(t('list.deleted'));
      await queries.invalidateQueries({ queryKey: ['list', entity.name] });
    } catch (error) {
      void message.error(error instanceof Error ? error.message : t('list.notDeleted'));
    }
  };

  const removeSelected = async (): Promise<void> => {
    if (await changes.change(selected, { operation: 'delete' })) setSelected([]);
  };

  const exportCsv = async (): Promise<void> => {
    setExporting(true);
    try {
      const first = await client.list(entity, {
        page: 1,
        pageSize: EXPORT_PAGE_SIZE,
        fields: listFields(entity),
        filters,
        ...(sort === undefined ? {} : { sort }),
      });
      const rows = [...first.rows];
      const { pages, truncated } = exportPages(first.total ?? first.rows.length, EXPORT_PAGE_SIZE, EXPORT_LIMIT);
      for (let next = 2; next <= pages; next += 1) {
        rows.push(
          ...(
            await client.list(entity, {
              page: next,
              pageSize: EXPORT_PAGE_SIZE,
              fields: listFields(entity),
              filters,
              ...(sort === undefined ? {} : { sort }),
            })
          ).rows,
        );
      }
      download(
        `${entity.name}.csv`,
        csvOf(
          columnsOf(entity).map((field) => ({ key: field.key, title: field.key })),
          rows,
        ),
      );
      if (truncated) void message.warning(t('list.exportTruncated', { limit: EXPORT_LIMIT }));
    } catch (error) {
      void message.error(error instanceof Error ? error.message : t('list.exportError'));
    } finally {
      setExporting(false);
    }
  };

  // A relation shows the name of the row that it points at (asked for with `include=`), and the id when there is none.
  const cell = (row: Row, field: MetaField, value: unknown): string =>
    relationLabel(meta.data?.entities ?? [], field, row) ?? show(value, t);
  const columns: TableColumnsType<Row> = columnsOf(entity).map((field, index) => ({
    title: field.key,
    dataIndex: field.key,
    key: field.key,
    ...(field.sortable
      ? {
          sorter: true,
          sortOrder: sort === field.key ? 'ascend' : sort === `-${field.key}` ? 'descend' : null,
        }
      : {}),
    render: (value: unknown, row: Row) =>
      index === 0 && entity.operations.get ? (
        <Link to={`/${where}/${String(row['id'])}`}>{cell(row, field, value) || String(row['id'])}</Link>
      ) : (
        cell(row, field, value)
      ),
  }));
  const rowActions = (row: Row): JSX.Element => (
    <Space size="small" wrap>
      <RowMoves entity={entity} row={row} move={changes.move} />
      {allows(entity, 'delete') ? (
        <Popconfirm title={t('list.confirmDelete')} okText={t('common.delete')} onConfirm={() => void remove(row)}>
          <Button danger size="small">
            {t('common.delete')}
          </Button>
        </Popconfirm>
      ) : null}
    </Space>
  );
  if (allows(entity, 'delete') || (entity.transitions ?? []).length > 0) {
    columns.push({ title: '', key: '_actions', render: (_value: unknown, row: Row) => rowActions(row) });
  }
  const canSelect = allows(entity, 'delete') || allows(entity, 'update');
  const virtual = shouldVirtualize(list.data?.rows.length ?? 0);

  return (
    <Card
      title={labelOf(entity, locale)}
      extra={
        <Space>
          <Button loading={exporting} onClick={() => void exportCsv()}>
            {t('list.export')}
          </Button>
          {allows(entity, 'create') ? (
            <Link to={`/${where}/new`}>
              <Button type="primary">{t('list.new')}</Button>
            </Link>
          ) : null}
        </Space>
      }
    >
      <Views
        storageKey={storageKey}
        current={{ name: '', filters, ...(sort === undefined ? {} : { sort }) }}
        onPick={applyView}
      />
      <FilterBar
        fieldRef={searchField}
        entity={entity}
        filters={filters}
        onChange={(next) => applyView({ name: '', filters: next, ...(sort === undefined ? {} : { sort }) })}
      />
      {selected.length === 0 ? null : (
        <Space wrap style={{ marginBottom: 12 }}>
          <span>{t('list.selected', { count: selected.length })}</span>
          {allows(entity, 'update') ? (
            <BulkBar entity={entity} rows={selected} change={changes.change} onDone={() => setSelected([])} />
          ) : null}
          {allows(entity, 'delete') ? (
            <Popconfirm
              title={t('list.confirmDeleteMany', { count: selected.length })}
              okText={t('common.delete')}
              onConfirm={() => void removeSelected()}
            >
              <Button danger size="small">
                {t('list.deleteSelected')}
              </Button>
            </Popconfirm>
          ) : null}
        </Space>
      )}
      {list.isError ? (
        <Result status="error" title={t('list.loadError')} subTitle={list.error.message} />
      ) : compact ? (
        <Space direction="vertical" style={{ width: '100%' }}>
          <Select
            allowClear
            aria-label={t('list.sort')}
            placeholder={t('list.sort')}
            value={sort ?? null}
            style={{ width: '100%' }}
            options={entity.fields
              .filter((field) => field.sortable)
              .flatMap((field) => [
                { value: field.key, label: `${field.key} ↑` },
                { value: `-${field.key}`, label: `${field.key} ↓` },
              ])}
            onChange={(next: string | undefined) =>
              applyView({ name: '', filters, ...(next === undefined ? {} : { sort: next }) })
            }
          />
          <CardRows
            entity={entity}
            rows={list.data?.rows ?? []}
            loading={list.isPending}
            where={where}
            cell={(row, field) => cell(row, field, row[field.key])}
            actions={(row) => rowActions(row)}
            selected={canSelect ? selected : undefined}
            onSelect={setSelected}
            page={page}
            pageSize={pageSize}
            total={list.data?.total ?? 0}
            onPage={setPage}
          />
        </Space>
      ) : (
        // A table wider than the screen scrolls in its own box, which the keyboard can reach. The `scroll.x` of Ant Design adds a hidden row
        // that axe refuses (a checkbox inside `aria-hidden`), so it is used only where the rows are virtual, which needs it.
        <div role="group" aria-label={labelOf(entity, locale)} tabIndex={0} style={{ overflowX: 'auto' }}>
          <Table<Row>
            rowKey={(row) => String(row['id'])}
            columns={columns}
            dataSource={list.data?.rows.map((row) => ({ ...row })) ?? []}
            loading={list.isPending}
            {...(virtual ? { scroll: { x: 'max-content', y: 560 }, virtual: true } : {})}
            {...(canSelect
              ? {
                  rowSelection: {
                    selectedRowKeys: selected.map((row) => String(row['id'])),
                    onChange: (_keys, rows) => setSelected(rows),
                  },
                }
              : {})}
            pagination={{
              current: page,
              pageSize,
              total: list.data?.total ?? 0,
              showSizeChanger: true,
              pageSizeOptions: [...PAGE_SIZES],
            }}
            onChange={(pagination, _filters, sorter) => {
              setPage(pagination.current ?? 1);
              setPageSize(pagination.pageSize ?? pageSize);
              const one = Array.isArray(sorter) ? sorter[0] : sorter;
              const field = typeof one?.field === 'string' ? one.field : undefined;
              const next =
                field === undefined || one?.order === undefined
                  ? undefined
                  : `${one.order === 'descend' ? '-' : ''}${field}`;
              void navigate({
                to: '.',
                search: viewToSearch({ name: '', filters, ...(next === undefined ? {} : { sort: next }) }),
                replace: true,
              });
            }}
          />
        </div>
      )}
    </Card>
  );
}

export function ListScreen(): JSX.Element {
  const { entity, loading } = useEntity();
  const t = useT();
  // The hook is called whatever the metadata holds, so that the order of the hooks does not change when it arrives.
  const replacement = useAllowed(useRegistry().screens).find(
    (screen) => screen.replace === `list:${entity?.name ?? ''}`,
  );
  if (loading) return <Card loading />;
  if (entity === undefined || !entity.can.read) return <Result status="404" title={t('list.missing')} />;
  // A plugin may draw the list of an entity in place of the generic one (UI-04).
  if (replacement !== undefined)
    return (
      <Slot
        name={`${replacement.plugin}/${replacement.id}`}
        load={replacement.load}
        given={{ entity } satisfies ScreenProps}
      />
    );
  return <Rows entity={entity} />;
}
