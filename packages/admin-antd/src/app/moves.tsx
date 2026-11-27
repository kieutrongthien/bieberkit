/**
 * BieberKit
 *
 * @file        packages/admin-antd/src/app/moves.tsx
 * @description The changes that act on rows from a list: a move of the state field, one change for many rows and a delete for many, with the row shown as it will be before the server answers (UI-03, UI-13).
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
  AdminApiError,
  bulkSummary,
  commonTransitions,
  inputFieldsOf,
  patchRow,
  transitionPatch,
  transitionsFor,
} from '@bieberkit/admin-core';
import type { BulkOperation, MetaEntity, MetaField, MetaTransition, Page, Row } from '@bieberkit/admin-core';
import { useQueryClient } from '@tanstack/react-query';
import { App, Button, Form, Modal, Select, Space } from 'antd';
import { useState } from 'react';
import type { JSX } from 'react';
import { Control, fromControl, rulesOf } from './controls.tsx';
import { useClient } from './context.ts';
import { useT } from './language.tsx';

type Snapshot = readonly (readonly [readonly unknown[], Page | undefined])[];

/** The message of an error that came from the API or from the network. */
const wording = (error: unknown, fallback: string): string => (error instanceof Error ? error.message : fallback);

/**
 * The calls that change rows from a list. A move shows its result in the list at once and takes it back when the server refuses, and a
 * list is read again whatever the answer was, so that the screen ends as the server has it (UI-13).
 */
export function useRowChanges(entity: MetaEntity): {
  move: (row: Row, transition: MetaTransition, input?: Row) => Promise<boolean>;
  change: (rows: readonly Row[], change: BulkOperation) => Promise<boolean>;
} {
  const client = useClient();
  const queries = useQueryClient();
  const { message } = App.useApp();
  const t = useT();
  const key = ['list', entity.name];

  const show = (rows: readonly Row[], patches: (row: Row) => Record<string, unknown>): Snapshot => {
    const before = queries.getQueriesData<Page>({ queryKey: key });
    for (const [queryKey, page] of before) {
      if (page === undefined) continue;
      let next = page.rows;
      for (const row of rows) next = patchRow(next, String(row['id']), patches(row));
      queries.setQueryData<Page>(queryKey, { ...page, rows: next });
    }
    return before;
  };
  const restore = (before: Snapshot): void => {
    for (const [queryKey, page] of before) queries.setQueryData(queryKey, page);
  };

  return {
    async move(row, transition, input) {
      await queries.cancelQueries({ queryKey: key });
      const before = show([row], () => transitionPatch(entity, transition, row));
      try {
        await client.transition(entity, String(row['id']), transition.name, Number(row['version']), input);
        void message.success(t('list.moved', { name: transition.name }));
        return true;
      } catch (error) {
        restore(before);
        void message.error(
          error instanceof AdminApiError && error.status === 412
            ? t('form.conflictTitle')
            : wording(error, t('list.notMoved')),
        );
        return false;
      } finally {
        await queries.invalidateQueries({ queryKey: key });
      }
    },
    async change(rows, change) {
      await queries.cancelQueries({ queryKey: key });
      const before =
        change.operation === 'transition'
          ? show(rows, (row) => {
              const found = (entity.transitions ?? []).find((item) => item.name === change.transition);
              return found === undefined ? {} : transitionPatch(entity, found, row);
            })
          : change.operation === 'update'
            ? show(rows, (row) => ({
                ...change.data,
                ...(typeof row['version'] === 'number' ? { version: row['version'] + 1 } : {}),
              }))
            : [];
      try {
        const result = await client.bulk(
          entity,
          rows.map((row) => ({ id: String(row['id']), version: Number(row['version']) })),
          change,
        );
        if (result.kind === 'queued') {
          void message.info(t('list.bulkQueued'));
          return true;
        }
        const summary = bulkSummary(result.outcomes);
        if (summary.ok > 0) void message.success(t('list.bulkDone', { count: summary.ok }));
        if (summary.failed.length > 0)
          void message.warning(
            t('list.bulkFailed', {
              count: summary.failed.length,
              why: [...new Set(summary.failed.map((failed) => failed.message))].join(' '),
            }),
          );
        return true;
      } catch (error) {
        restore(before);
        void message.error(wording(error, t('list.notChanged')));
        return false;
      } finally {
        await queries.invalidateQueries({ queryKey: key });
      }
    },
  };
}

/** A small form for what a move or a change asks for. It gives the values as the API takes them. */
function Asking(props: {
  readonly title: string;
  readonly fields: readonly MetaField[];
  readonly onCancel: () => void;
  readonly onOk: (values: Row) => Promise<void>;
}): JSX.Element {
  const { title, fields, onCancel, onOk } = props;
  const t = useT();
  const [form] = Form.useForm<Record<string, unknown>>();
  const [busy, setBusy] = useState(false);
  return (
    <Modal
      open
      title={title}
      okText={t('list.apply')}
      cancelText={t('common.cancel')}
      confirmLoading={busy}
      onCancel={onCancel}
      onOk={() => form.submit()}
    >
      <Form<Record<string, unknown>>
        form={form}
        layout="vertical"
        onFinish={(values) => {
          setBusy(true);
          const body = Object.fromEntries(
            fields.flatMap((field) => {
              const value = fromControl(field, values[field.key]);
              return value === undefined || value === '' ? [] : [[field.key, value]];
            }),
          );
          void onOk(body).finally(() => setBusy(false));
        }}
      >
        {fields.map((field) => (
          <Form.Item
            key={field.key}
            label={field.key}
            name={field.key}
            valuePropName={field.widget === 'switch' ? 'checked' : 'value'}
            rules={rulesOf(field, t)}
          >
            <Control field={field} />
          </Form.Item>
        ))}
      </Form>
    </Modal>
  );
}

/** The moves that one row may make, as small buttons. A move that asks for something opens a form first. */
export function RowMoves(props: {
  readonly entity: MetaEntity;
  readonly row: Row;
  readonly move: (row: Row, transition: MetaTransition, input?: Row) => Promise<boolean>;
}): JSX.Element {
  const { entity, row, move } = props;
  const [asking, setAsking] = useState<MetaTransition | undefined>();
  const fields = inputFieldsOf(asking?.input);
  return (
    <>
      {transitionsFor(entity, row).map((transition) => (
        <Button
          key={transition.name}
          size="small"
          onClick={() => {
            if (inputFieldsOf(transition.input).length > 0) setAsking(transition);
            else void move(row, transition);
          }}
        >
          {transition.name}
        </Button>
      ))}
      {asking === undefined ? null : (
        <Asking
          title={asking.name}
          fields={fields}
          onCancel={() => setAsking(undefined)}
          onOk={async (input) => {
            if (await move(row, asking, input)) setAsking(undefined);
          }}
        />
      )}
    </>
  );
}

/** What can be done to the rows that are selected, besides deleting them: a move that all of them may make, or one value for a field. */
export function BulkBar(props: {
  readonly entity: MetaEntity;
  readonly rows: readonly Row[];
  readonly change: (rows: readonly Row[], change: BulkOperation) => Promise<boolean>;
  readonly onDone: () => void;
}): JSX.Element {
  const { entity, rows, change, onDone } = props;
  const t = useT();
  const moves = commonTransitions(entity, rows);
  const writable = entity.form.flatMap(
    (key) => entity.fields.find((field) => field.key === key && field.widget !== 'readonly') ?? [],
  );
  const [picked, setPicked] = useState<string | undefined>();
  const [asking, setAsking] = useState<
    { title: string; fields: readonly MetaField[]; run: (values: Row) => Promise<boolean> } | undefined
  >();
  const finish = async (done: Promise<boolean>): Promise<void> => {
    if (await done) onDone();
  };
  return (
    <Space wrap>
      {moves.length === 0 ? null : (
        <Select
          aria-label={t('list.moves')}
          placeholder={t('list.moves')}
          value={null}
          style={{ minWidth: 140 }}
          options={moves.map((move) => ({ value: move.name, label: move.name }))}
          onChange={(name: string) => {
            const move = moves.find((item) => item.name === name);
            if (move === undefined) return;
            const fields = inputFieldsOf(move.input);
            const run = (input: Row): Promise<boolean> =>
              change(rows, {
                operation: 'transition',
                transition: move.name,
                ...(fields.length === 0 ? {} : { input }),
              });
            if (fields.length === 0) void finish(run({}));
            else setAsking({ title: move.name, fields, run });
          }}
        />
      )}
      {writable.length === 0 ? null : (
        <Select
          aria-label={t('list.setField')}
          placeholder={t('list.setField')}
          value={picked ?? null}
          style={{ minWidth: 140 }}
          options={writable.map((field) => ({ value: field.key, label: field.key }))}
          onChange={(key: string) => {
            const field = writable.find((item) => item.key === key);
            if (field === undefined) return;
            setPicked(undefined);
            setAsking({
              title: key,
              fields: [{ ...field, required: true }],
              run: (values) => change(rows, { operation: 'update', data: values }),
            });
          }}
        />
      )}
      {asking === undefined ? null : (
        <Asking
          title={asking.title}
          fields={asking.fields}
          onCancel={() => setAsking(undefined)}
          onOk={async (values) => {
            if (await asking.run(values)) {
              setAsking(undefined);
              onDone();
            }
          }}
        />
      )}
    </Space>
  );
}
