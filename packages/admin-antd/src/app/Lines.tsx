/**
 * BieberKit
 *
 * @file        packages/admin-antd/src/app/Lines.tsx
 * @description The lines of a record, edited inside its form: a table with a control for each field of a line, a button to add one and a button to remove one, checked with the same rules as a field of the form (MOD-09, UI-11).
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

import { lineProblems, MAX_LINES, newLine } from '@bieberkit/admin-core';
import type { Line, MetaInline } from '@bieberkit/admin-core';
import { Button, Table, theme } from 'antd';
import type { JSX } from 'react';
import { Control, fromControl, toControl } from './controls.tsx';
import { useLanguage, useT } from './language.tsx';

/**
 * The editable table of one collection. The lines are held by the form that owns this, and a change gives it the new list. A line has the
 * `id` of the server when it exists, and none when it is new, so that a save can tell the two apart.
 */
export function LinesEditor(props: {
  readonly inline: MetaInline;
  readonly lines: readonly Line[];
  readonly onChange: (lines: readonly Line[]) => void;
  /** Show what is wrong with each line: after a first try to save. */
  readonly checked: boolean;
}): JSX.Element {
  const { inline, lines, onChange, checked } = props;
  const t = useT();
  const { locale } = useLanguage();
  const { token } = theme.useToken();
  const set = (at: number, key: string, value: unknown): void =>
    onChange(lines.map((line, index) => (index === at ? { ...line, [key]: value } : line)));
  const name = inline.label[locale] ?? inline.label['en'] ?? inline.entity.split('.').at(-1) ?? inline.entity;

  return (
    <div role="group" aria-label={name}>
      <Table<Line & { readonly index: number }>
        size="small"
        pagination={false}
        rowKey={(line) => (typeof line['id'] === 'string' ? line['id'] : `new-${String(line.index)}`)}
        dataSource={lines.map((line, index) => ({ ...line, index }))}
        locale={{ emptyText: <span style={{ color: token.colorTextDescription }}>{t('lines.none')}</span> }}
        columns={[
          ...inline.fields.map((field) => ({
            key: field.key,
            title: field.required ? `${field.key} *` : field.key,
            render: (_value: unknown, line: Line & { readonly index: number }) => {
              const problem = checked ? lineProblems(inline, line).find((item) => item.key === field.key) : undefined;
              return (
                <div>
                  <Control
                    field={field}
                    id={`${inline.name}-${String(line.index)}-${field.key}`}
                    value={toControl(field, line[field.key])}
                    checked={line[field.key] === true}
                    onChange={(value) => set(line.index, field.key, fromControl(field, value))}
                    label={`${name} ${String(line.index + 1)} ${field.key}`}
                  />
                  {problem === undefined ? null : (
                    <div role="alert" style={{ color: 'var(--ant-color-error, #cf1322)' }}>
                      {t(`problem.${problem.problem.code}`, problem.problem.values)}
                    </div>
                  )}
                </div>
              );
            },
          })),
          {
            key: '_remove',
            title: '',
            render: (_value: unknown, line: Line & { readonly index: number }) =>
              inline.can.delete || typeof line['id'] !== 'string' ? (
                <Button
                  size="small"
                  danger
                  aria-label={t('lines.removeLine', { name: `${name} ${String(line.index + 1)}` })}
                  onClick={() => onChange(lines.filter((_, index) => index !== line.index))}
                >
                  {t('lines.remove')}
                </Button>
              ) : null,
          },
        ]}
      />
      {inline.can.create && lines.length < MAX_LINES ? (
        <Button style={{ marginTop: 8 }} onClick={() => onChange([...lines, newLine(inline)])}>
          {t('lines.add', { name })}
        </Button>
      ) : null}
    </div>
  );
}
