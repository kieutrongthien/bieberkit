/**
 * BieberKit
 *
 * @file        packages/admin-antd/src/screens/RelationSelect.tsx
 * @description The picker of a relation: a select that asks the target entity for its rows as the person types, with the search of the list, and shows the name of the row that is chosen (UI-11).
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

import { titleOf } from '@bieberkit/admin-core';
import type { MetaField, Row } from '@bieberkit/admin-core';
import { useQuery } from '@tanstack/react-query';
import { Input, Select } from 'antd';
import { useEffect, useState } from 'react';
import type { JSX } from 'react';
import { useClient, useMeta } from '../lib/context.ts';
import { useT } from '../lib/language.tsx';

const PAGE = 20;
const WAIT_MS = 250;

/** The value of a text after the person has stopped typing for a moment, so that each key is not a call. */
function useSettled(text: string): string {
  const [settled, setSettled] = useState(text);
  useEffect(() => {
    const timer = setTimeout(() => setSettled(text), WAIT_MS);
    return () => clearTimeout(timer);
  }, [text]);
  return settled;
}

/**
 * Picks the row that a relation points at. The target entity comes from the metadata: when the user may not read it, or it has no list,
 * the id is typed as text, as before. The value is the id.
 */
export function RelationSelect(props: {
  readonly field: MetaField;
  readonly id?: string | undefined;
  readonly value?: unknown;
  readonly onChange?: ((value: unknown) => void) | undefined;
  /** The name that a screen reader gives the control, when no label points at it. */
  readonly label?: string;
}): JSX.Element {
  const { field, id, onChange } = props;
  const client = useClient();
  const meta = useMeta();
  const t = useT();
  const target = meta.data?.entities.find((entity) => entity.name === field.target?.entity);
  const [text, setText] = useState('');
  const wanted = useSettled(text);
  const chosen = typeof props.value === 'string' && props.value !== '' ? props.value : undefined;
  const hint = field.target?.title;
  const searchable = (target?.searchable ?? []).length > 0;

  const options = useQuery({
    queryKey: ['relation', target?.name, wanted],
    queryFn: () => {
      if (target === undefined) return Promise.resolve({ rows: [] as readonly Row[], page: 1, pageSize: PAGE });
      return client.list(target, { pageSize: PAGE, ...(searchable && wanted !== '' ? { q: wanted } : {}) });
    },
    enabled: target !== undefined && target.operations.list && target.can.read,
  });
  // The row that is chosen may not be among the first of the list, so it is read on its own to be named.
  const named = options.data?.rows.find((row) => String(row['id']) === chosen);
  const one = useQuery({
    queryKey: ['relation-one', target?.name, chosen],
    queryFn: () => (target === undefined || chosen === undefined ? Promise.resolve({}) : client.get(target, chosen)),
    enabled: target !== undefined && chosen !== undefined && named === undefined && target.operations.get,
  });

  if (target === undefined || !target.operations.list || !target.can.read) {
    return (
      <Input
        {...(id === undefined ? {} : { id })}
        value={chosen ?? ''}
        onChange={(event) => onChange?.(event.target.value)}
      />
    );
  }
  const labelOfRow = (row: Row): string => titleOf(target, row, hint);
  const rows = options.data?.rows ?? [];
  const list = rows.map((row) => ({ value: String(row['id']), label: labelOfRow(row) }));
  if (chosen !== undefined && !list.some((item) => item.value === chosen)) {
    const known = named ?? (one.data !== undefined && Object.keys(one.data).length > 0 ? one.data : undefined);
    list.unshift({ value: chosen, label: known === undefined ? chosen : labelOfRow(known) });
  }
  return (
    <Select
      {...(id === undefined ? {} : { id })}
      {...(props.label === undefined ? {} : { 'aria-label': props.label })}
      showSearch={{ filterOption: false, onSearch: setText }}
      allowClear
      loading={options.isFetching}
      value={chosen ?? null}
      placeholder={t(searchable ? 'relation.search' : 'relation.pick')}
      options={list}
      onChange={(value: string | null | undefined) => onChange?.(value ?? null)}
      onOpenChange={(open) => {
        if (!open) setText('');
      }}
      notFoundContent={options.isFetching ? undefined : t('relation.none')}
    />
  );
}
