/**
 * BieberKit
 *
 * @file        packages/admin-antd/src/app/FormScreen.tsx
 * @description The generic form of an entity: a control for each field of its metadata, the checks of the API shown at the field, and a stale version shown as what it is (UI-03, UI-18, API-13).
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
  allows,
  bodyOf,
  clearDraft,
  draftKey,
  formatDateTime,
  formFieldsOf,
  initialValues,
  isDirty,
  labelOf,
  loadDraft,
  reapply,
  saveDraft,
  shortcutOf,
} from '@bieberkit/admin-core';
import type { MetaEntity, MetaField, Row } from '@bieberkit/admin-core';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useBlocker, useNavigate, useParams } from '@tanstack/react-router';
import { Alert, App, Button, Card, Form, Input, InputNumber, Result, Select, Space, Switch, Table } from 'antd';
import { useEffect, useRef, useState } from 'react';
import type { ChangeEvent, JSX } from 'react';
import { useClient, useEntity } from './context.ts';
import { useLanguage, useT } from './language.tsx';

/** The value of a field as its control holds it: a `datetime-local` input wants `YYYY-MM-DDTHH:mm`. */
function toControl(field: MetaField, value: unknown): unknown {
  if (field.widget === 'datetime' && typeof value === 'string') return value.slice(0, 16);
  if (field.widget === 'date' && typeof value === 'string') return value.slice(0, 10);
  return value;
}

/** The value that the API takes: an instant in ISO form. */
function fromControl(field: MetaField, value: unknown): unknown {
  if (field.widget === 'datetime' && typeof value === 'string' && value !== '') return new Date(value).toISOString();
  return value;
}

/** What `Form.Item` hands to its child: the id for the label, and the value with the function that changes it. */
interface ControlProps {
  readonly field: MetaField;
  readonly id?: string;
  readonly value?: unknown;
  readonly checked?: boolean;
  readonly onChange?: (value: unknown) => void;
}

function Control(props: ControlProps): JSX.Element {
  const { field, id, onChange } = props;
  const identity = id === undefined ? {} : { id };
  const text = typeof props.value === 'string' ? props.value : undefined;
  const typed = (event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>): void => onChange?.(event.target.value);
  switch (field.widget) {
    case 'textarea':
      return <Input.TextArea {...identity} rows={4} value={text} onChange={typed} />;
    case 'number':
      return (
        <InputNumber
          {...identity}
          style={{ width: '100%' }}
          value={typeof props.value === 'number' ? props.value : null}
          onChange={(value) => onChange?.(value)}
        />
      );
    case 'switch':
      return <Switch {...identity} checked={props.checked === true} onChange={(checked) => onChange?.(checked)} />;
    case 'select':
      return (
        <Select
          {...identity}
          value={text}
          allowClear={!field.required}
          options={(field.values ?? []).map((value) => ({ value, label: value }))}
          onChange={(value) => onChange?.(value)}
        />
      );
    case 'date':
      return <Input {...identity} type="date" value={text} onChange={typed} />;
    case 'datetime':
      return <Input {...identity} type="datetime-local" value={text} onChange={typed} />;
    default:
      return <Input {...identity} type={field.widget === 'email' ? 'email' : 'text'} value={text} onChange={typed} />;
  }
}

/** A value as a cell of the table of a conflict shows it. */
const shown = (value: unknown): string =>
  value === null || value === undefined ? '' : typeof value === 'string' ? value : JSON.stringify(value);

/** Whether the focus is in a place where a key is typed. */
const isTyping = (target: EventTarget | null): boolean =>
  target instanceof HTMLElement &&
  (['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName) || target.isContentEditable);

const isSession = (value: unknown): value is { readonly id: string } =>
  typeof value === 'object' && value !== null && typeof Reflect.get(value, 'id') === 'string';

function Editor(props: { readonly entity: MetaEntity; readonly row?: Row | undefined }): JSX.Element {
  const { entity } = props;
  const client = useClient();
  const queries = useQueryClient();
  const navigate = useNavigate();
  const { message } = App.useApp();
  const t = useT();
  const { locale } = useLanguage();
  const [form] = Form.useForm<Record<string, unknown>>();
  // The row that the person opened. After a conflict it is the row of the others, which is the one that the next save is checked against.
  const [base, setBase] = useState<Row | undefined>(props.row);
  const [conflict, setConflict] = useState<Row | undefined>();
  const [busy, setBusy] = useState(false);
  const [dirty, setDirty] = useState(false);
  const leaving = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const where = entity.path.replace('/api/v1/', '');
  const updating = base !== undefined;
  const fields = formFieldsOf(entity);
  const canSave = updating ? allows(entity, 'update') : allows(entity, 'create');
  const initial = initialValues(entity, base);
  const controls = (values: Readonly<Record<string, unknown>>): Record<string, unknown> =>
    Object.fromEntries(fields.map((field) => [field.key, toControl(field, values[field.key])]));
  const session = queries.getQueryData(['session']);
  const key = draftKey(
    entity.name,
    base === undefined ? undefined : String(base['id']),
    isSession(session) ? session.id : 'anonymous',
  );
  // A draft rests in the browser, so a field that is personal or encrypted never goes into it (UI-17, PDP-01).
  const skip = new Set(
    fields.filter((field) => field.pii === true || field.encrypted === true).map((field) => field.key),
  );
  const [draft, setDraft] = useState(() => loadDraft(window.localStorage, key, Date.now()));
  const offered = draft !== undefined && isDirty(initial, draft) ? draft : undefined;

  const current = (): Record<string, unknown> =>
    Object.fromEntries(fields.map((field) => [field.key, fromControl(field, form.getFieldValue(field.key))]));

  const changed = (): void => {
    const values = current();
    const now = isDirty(initial, values);
    setDirty(now);
    clearTimeout(timer.current);
    // A draft is kept a moment after the last key, and goes when the form is the same as the row again.
    timer.current = setTimeout(() => {
      if (now) saveDraft(window.localStorage, key, values, Date.now(), skip);
      else clearDraft(window.localStorage, key);
    }, 600);
  };

  // Leaving with changes asks first, in the application and in the browser (UI-17).
  useBlocker({
    shouldBlockFn: () => (dirty && !leaving.current ? !window.confirm(t('form.leave')) : false),
    enableBeforeUnload: () => dirty && !leaving.current,
  });

  const submit = (): void => form.submit();
  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      const shortcut = shortcutOf({
        key: event.key,
        ctrl: event.ctrlKey,
        meta: event.metaKey,
        alt: event.altKey,
        shift: event.shiftKey,
        typing: isTyping(event.target),
      });
      if (shortcut === 'save' && canSave) {
        event.preventDefault();
        submit();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  });
  useEffect(() => () => clearTimeout(timer.current), []);

  const save = async (values: Record<string, unknown>): Promise<void> => {
    setBusy(true);
    setConflict(undefined);
    const converted = Object.fromEntries(fields.map((field) => [field.key, fromControl(field, values[field.key])]));
    try {
      const body = bodyOf(entity, converted, updating);
      if (base === undefined) await client.create(entity, body);
      else await client.update(entity, String(base['id']), body, Number(base['version']));
      await queries.invalidateQueries({ queryKey: ['list', entity.name] });
      clearTimeout(timer.current);
      clearDraft(window.localStorage, key);
      leaving.current = true;
      void message.success(t('form.saved'));
      await navigate({ to: `/${where}` });
    } catch (error) {
      if (error instanceof AdminApiError && error.status === 412) {
        setConflict(error.current ?? {});
      } else if (error instanceof AdminApiError && error.problems.length > 0) {
        form.setFields(
          error.problems.map((problem) => ({
            name: problem.path.replace(/^body\./, ''),
            errors: [problem.message],
          })),
        );
      } else {
        void message.error(error instanceof Error ? error.message : t('form.notSaved'));
      }
    } finally {
      setBusy(false);
    }
  };

  const theirs = conflict === undefined ? {} : initialValues(entity, conflict);
  const merge = conflict === undefined ? undefined : reapply(initial, current(), theirs);
  const differing =
    merge === undefined ? [] : fields.filter((field) => isDirty({ v: current()[field.key] }, { v: theirs[field.key] }));
  const who = typeof conflict?.['updatedBy'] === 'string' ? conflict['updatedBy'] : t('conflict.unknownUser');
  const when = typeof conflict?.['updatedAt'] === 'string' ? formatDateTime(locale, conflict['updatedAt']) : '';

  const takeTheirs = (): void => {
    if (conflict === undefined) return;
    setBase(conflict);
    form.setFieldsValue(controls(theirs));
    clearDraft(window.localStorage, key);
    setDirty(false);
    setConflict(undefined);
  };
  const keepMine = (): void => {
    if (conflict === undefined || merge === undefined) return;
    setBase(conflict);
    form.setFieldsValue(controls(merge.values));
    setConflict(undefined);
    setDirty(true);
  };

  return (
    <Card title={t(updating ? 'form.edit' : 'form.new', { name: labelOf(entity, locale) })}>
      {conflict === undefined ? null : (
        <Alert
          type="warning"
          showIcon
          style={{ marginBottom: 16 }}
          message={t('form.conflictTitle')}
          description={
            <Space direction="vertical" style={{ width: '100%' }}>
              {when === '' ? null : <span>{t('conflict.changedBy', { who, when })}</span>}
              {differing.length === 0 ? null : (
                <Table
                  size="small"
                  pagination={false}
                  rowKey="key"
                  dataSource={differing.map((field) => ({
                    key: field.key,
                    mine: shown(current()[field.key]),
                    theirs: shown(theirs[field.key]),
                  }))}
                  columns={[
                    { title: t('conflict.field'), dataIndex: 'key' },
                    { title: t('conflict.mine'), dataIndex: 'mine' },
                    { title: t('conflict.theirs'), dataIndex: 'theirs' },
                  ]}
                />
              )}
              <Space wrap>
                <Button type="primary" onClick={keepMine}>
                  {t('conflict.keepMine')}
                </Button>
                <Button onClick={takeTheirs}>{t('conflict.takeTheirs')}</Button>
              </Space>
            </Space>
          }
        />
      )}
      {offered === undefined ? null : (
        <Alert
          type="info"
          showIcon
          style={{ marginBottom: 16 }}
          message={t('form.draftFound')}
          action={
            <Space>
              <Button
                size="small"
                type="primary"
                onClick={() => {
                  form.setFieldsValue(controls(offered));
                  setDraft(undefined);
                  setDirty(true);
                }}
              >
                {t('form.draftRestore')}
              </Button>
              <Button
                size="small"
                onClick={() => {
                  clearDraft(window.localStorage, key);
                  setDraft(undefined);
                }}
              >
                {t('form.draftDiscard')}
              </Button>
            </Space>
          }
        />
      )}
      <Form<Record<string, unknown>>
        form={form}
        layout="vertical"
        initialValues={controls(initial)}
        onValuesChange={changed}
        onFinish={(values) => void save(values)}
      >
        {fields.map((field) => (
          <Form.Item
            key={field.key}
            label={field.key}
            name={field.key}
            valuePropName={field.widget === 'switch' ? 'checked' : 'value'}
            rules={[{ required: field.required && field.widget !== 'switch' }]}
          >
            <Control field={field} />
          </Form.Item>
        ))}
        <Space>
          {canSave ? (
            <Button type="primary" htmlType="submit" loading={busy}>
              {t('form.save')}
            </Button>
          ) : null}
          <Button onClick={() => void navigate({ to: `/${where}` })}>{t('common.cancel')}</Button>
        </Space>
      </Form>
    </Card>
  );
}

export function FormScreen(): JSX.Element {
  const { entity, loading } = useEntity();
  const t = useT();
  const params = useParams({ strict: false });
  const client = useClient();
  const id = params.id;
  const row = useQuery({
    queryKey: ['row', entity?.name, id],
    queryFn: () => (entity === undefined || id === undefined ? Promise.resolve({}) : client.get(entity, id)),
    enabled: entity !== undefined && id !== undefined,
  });
  // A query that is not enabled stays pending, so only a row that is being read is waited for.
  if (loading || (id !== undefined && row.isPending)) return <Card loading />;
  if (entity === undefined || !entity.can.read) return <Result status="404" title={t('form.missing')} />;
  if (row.isError) return <Result status="error" title={t('form.rowLoadError')} subTitle={row.error.message} />;
  return <Editor key={id ?? 'new'} entity={entity} {...(id === undefined ? {} : { row: row.data })} />;
}
