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

import { AdminApiError, allows, bodyOf, formFieldsOf, initialValues, labelOf } from '@bieberkit/admin-core';
import type { MetaEntity, MetaField, Row } from '@bieberkit/admin-core';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate, useParams } from '@tanstack/react-router';
import { Alert, App, Button, Card, Form, Input, InputNumber, Result, Select, Space, Switch } from 'antd';
import { useState } from 'react';
import type { ChangeEvent, JSX } from 'react';
import { useClient, useEntity } from './context.ts';

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

function Editor(props: { readonly entity: MetaEntity; readonly row?: Row | undefined }): JSX.Element {
  const { entity, row } = props;
  const client = useClient();
  const queries = useQueryClient();
  const navigate = useNavigate();
  const { message } = App.useApp();
  const [form] = Form.useForm<Record<string, unknown>>();
  const [stale, setStale] = useState(false);
  const [busy, setBusy] = useState(false);
  const where = entity.path.replace('/api/v1/', '');
  const updating = row !== undefined;
  const fields = formFieldsOf(entity);
  const canSave = updating ? allows(entity, 'update') : allows(entity, 'create');
  const initial = initialValues(entity, row);
  const start = Object.fromEntries(fields.map((field) => [field.key, toControl(field, initial[field.key])]));

  const save = async (values: Record<string, unknown>): Promise<void> => {
    setBusy(true);
    setStale(false);
    const converted = Object.fromEntries(fields.map((field) => [field.key, fromControl(field, values[field.key])]));
    try {
      const body = bodyOf(entity, converted, updating);
      if (row === undefined) await client.create(entity, body);
      else await client.update(entity, String(row['id']), body, Number(row['version']));
      await queries.invalidateQueries({ queryKey: ['list', entity.name] });
      void message.success('Saved');
      await navigate({ to: `/${where}` });
    } catch (error) {
      if (error instanceof AdminApiError && error.status === 412) {
        setStale(true);
      } else if (error instanceof AdminApiError && error.problems.length > 0) {
        form.setFields(
          error.problems.map((problem) => ({
            name: problem.path.replace(/^body\./, ''),
            errors: [problem.message],
          })),
        );
      } else {
        void message.error(error instanceof Error ? error.message : 'The row was not saved');
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card title={`${updating ? 'Edit' : 'New'} ${labelOf(entity, 'en')}`}>
      {stale ? (
        <Alert
          type="warning"
          showIcon
          style={{ marginBottom: 16 }}
          message="Someone else changed this row"
          description="Reload the page to see the new version, then make your change again."
        />
      ) : null}
      <Form<Record<string, unknown>>
        form={form}
        layout="vertical"
        initialValues={start}
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
              Save
            </Button>
          ) : null}
          <Button onClick={() => void navigate({ to: `/${where}` })}>Cancel</Button>
        </Space>
      </Form>
    </Card>
  );
}

export function FormScreen(): JSX.Element {
  const { entity, loading } = useEntity();
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
  if (entity === undefined || !entity.can.read) return <Result status="404" title="This screen does not exist." />;
  if (row.isError) return <Result status="error" title="The row could not be loaded" subTitle={row.error.message} />;
  return <Editor key={id ?? 'new'} entity={entity} {...(id === undefined ? {} : { row: row.data })} />;
}
