/**
 * BieberKit
 *
 * @file        packages/admin-antd/src/app/controls.tsx
 * @description The controls that draw a field from its widget, shared by the form, the input of a move and the bulk change of a list (UI-03, UI-11).
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

import { problemOf } from '@bieberkit/admin-core';
import { FileControl } from './FileControl.tsx';
import { RelationSelect } from './RelationSelect.tsx';
import type { MetaField, MessageKey } from '@bieberkit/admin-core';
import type { Rule } from 'antd/es/form';
import { Input, InputNumber, Select, Switch } from 'antd';
import type { ChangeEvent, JSX } from 'react';

/** The value of a field as its control holds it: a `datetime-local` input wants `YYYY-MM-DDTHH:mm`. */
export function toControl(field: MetaField, value: unknown): unknown {
  if (field.widget === 'datetime' && typeof value === 'string') return value.slice(0, 16);
  if (field.widget === 'date' && typeof value === 'string') return value.slice(0, 10);
  return value;
}

/** The value that the API takes: an instant in ISO form. */
export function fromControl(field: MetaField, value: unknown): unknown {
  if (field.widget === 'datetime' && typeof value === 'string' && value !== '') return new Date(value).toISOString();
  return value;
}

/** What `Form.Item` hands to its child: the id for the label, and the value with the function that changes it. */
export interface ControlProps {
  readonly field: MetaField;
  readonly id?: string;
  readonly value?: unknown;
  readonly checked?: boolean;
  readonly onChange?: (value: unknown) => void;
  /** The name that a screen reader gives the control when no label points at it, as in a table. */
  readonly label?: string;
}

export function Control(props: ControlProps): JSX.Element {
  const { field, id, onChange } = props;
  const identity = {
    ...(id === undefined ? {} : { id }),
    ...(props.label === undefined ? {} : { 'aria-label': props.label }),
  };
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
    case 'file':
    case 'image':
      return (
        <FileControl
          field={field}
          id={id}
          value={props.value}
          onChange={onChange}
          {...(props.label === undefined ? {} : { label: props.label })}
        />
      );
    case 'relation':
      return (
        <RelationSelect
          field={field}
          id={id}
          value={props.value}
          onChange={onChange}
          {...(props.label === undefined ? {} : { label: props.label })}
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

/**
 * The rules of a form item: what the schema of the field says (UI-03). `fromControl` turns the value of the control into what the API
 * takes, so the check sees what the server will see.
 */
export function rulesOf(
  field: MetaField,
  t: (key: MessageKey, values?: Readonly<Record<string, string | number>>) => string,
): Rule[] {
  return [
    {
      validator: async (_rule, value: unknown) => {
        const problem = problemOf(field, fromControl(field, value));
        if (problem !== undefined) throw new Error(t(`problem.${problem.code}`, problem.values));
      },
    },
  ];
}
