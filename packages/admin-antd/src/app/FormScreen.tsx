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
  editableInline,
  initialLines,
  initialValues,
  isDirty,
  labelOf,
  lineProblems,
  linesBody,
  linesChanged,
  loadDraft,
  prefillOf,
  reapply,
  readOnlyOf,
  relatedOf,
  saveDraft,
  shortcutOf,
  statesOf,
} from '@bieberkit/admin-core';
import type { Line, MetaEntity, MetaTransition, Row } from '@bieberkit/admin-core';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useBlocker, useNavigate, useParams, useSearch } from '@tanstack/react-router';
import { Alert, App, Button, Card, Descriptions, Form, Result, Space, Table, Tabs } from 'antd';
import { useEffect, useRef, useState } from 'react';
import type { JSX } from 'react';
import { Control, fromControl, rulesOf, toControl } from './controls.tsx';
import { useClient, useEntity, useMeta } from './context.ts';
import { RowMoves } from './moves.tsx';
import { LinesEditor } from './Lines.tsx';
import { RelatedRows } from './Related.tsx';
import { usePluginText } from './hooks.ts';
import { useLanguage, useT } from './language.tsx';
import type { RecordTabProps, ScreenProps } from './slot-props.ts';
import { Slot, useAllowed, useRegistry } from './slots.tsx';

/** A value as a cell of the table of a conflict shows it. */
const shown = (value: unknown): string =>
  value === null || value === undefined ? '' : typeof value === 'string' ? value : JSON.stringify(value);

/** Whether the focus is in a place where a key is typed. */
const isTyping = (target: EventTarget | null): boolean =>
  target instanceof HTMLElement &&
  (['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName) || target.isContentEditable);

const isSession = (value: unknown): value is { readonly id: string } =>
  typeof value === 'object' && value !== null && typeof Reflect.get(value, 'id') === 'string';

function Editor(props: {
  readonly entity: MetaEntity;
  readonly row?: Row | undefined;
  readonly prefill?: Readonly<Record<string, string>>;
}): JSX.Element {
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
  // The lines that the form edits with the record, by collection, and whether a first try to save has shown what is wrong with them.
  const [lines, setLines] = useState<Record<string, readonly Line[]>>(() => initialLines(entity, props.row));
  const [tried, setTried] = useState(false);
  const collections = editableInline(entity);
  const startLines = initialLines(entity, base);
  /** The collections whose lines are not what the form started from. */
  const changedLines = (now: Readonly<Record<string, readonly Line[]>> = lines): Set<string> =>
    new Set(
      collections
        .filter((inline) => linesChanged(inline, startLines[inline.name] ?? [], now[inline.name] ?? []))
        .map((inline) => inline.name),
    );
  const leaving = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const where = entity.path.replace('/api/v1/', '');
  const updating = base !== undefined;
  const fields = formFieldsOf(entity);
  const canSave = updating ? allows(entity, 'update') : allows(entity, 'create');
  const initial = updating ? initialValues(entity, base) : { ...initialValues(entity), ...props.prefill };
  const meta = useMeta();
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
  // What the form shows and asks for follows what it holds, so a change of one field can show or hide another (UI-11).
  const watched: Record<string, unknown> | undefined = Form.useWatch([], form);
  const states = statesOf(
    fields,
    Object.fromEntries(
      fields.map((field) => [field.key, fromControl(field, (watched ?? controls(initial))[field.key])]),
    ),
  );

  const editLines = (name: string, next: readonly Line[]): void => {
    const all = { ...lines, [name]: next };
    setLines(all);
    setDirty(isDirty(initial, current()) || changedLines(all).size > 0);
  };

  const changed = (): void => {
    const values = current();
    const now = isDirty(initial, values);
    setDirty(now || changedLines().size > 0);
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
      // A field that its condition hides is not sent: the server would drop it, and a clear of a hidden field would be a write (UI-11).
      const { visible } = statesOf(fields, converted);
      const body = Object.fromEntries(
        Object.entries(bodyOf(entity, converted, updating)).filter(([name]) => visible.has(name)),
      );
      // A line that the API would refuse is shown, and nothing is sent.
      setTried(true);
      if (
        collections.some((inline) => (lines[inline.name] ?? []).some((line) => lineProblems(inline, line).length > 0))
      ) {
        void message.error(t('lines.invalid'));
        return;
      }
      Object.assign(
        body,
        linesBody(
          entity,
          lines,
          base === undefined ? new Set(collections.map((inline) => inline.name)) : changedLines(),
        ),
      );
      if (base === undefined) await client.create(entity, body);
      else await client.update(entity, String(base['id']), body, Number(base['version']));
      // The row that was cached is not the row any more, and a person who opens it again must not see the old values.
      await queries.invalidateQueries({ queryKey: ['list', entity.name] });
      // A cached row is shown first when it is opened again, so it is dropped and not only marked stale.
      queries.removeQueries({ queryKey: ['row', entity.name] });
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
    // The answer of a 412 is the row without its lines, so the lines are read again.
    if (collections.length > 0)
      void client.get(entity, String(conflict['id'])).then((row) => setLines(initialLines(entity, row)));
  };
  const keepMine = (): void => {
    if (conflict === undefined || merge === undefined) return;
    setBase(conflict);
    form.setFieldsValue(controls(merge.values));
    setConflict(undefined);
    setDirty(true);
  };

  /** A move of the state field from the detail: the row of the answer is the row that the form is checked against from now on. */
  const moveHere = async (row: Row, transition: MetaTransition, input?: Row): Promise<boolean> => {
    try {
      const saved = await client.transition(entity, String(row['id']), transition.name, Number(row['version']), input);
      setBase(saved);
      void message.success(t('list.moved', { name: transition.name }));
      await queries.invalidateQueries({ queryKey: ['list', entity.name] });
      return true;
    } catch (error) {
      void message.error(error instanceof Error ? error.message : t('list.notMoved'));
      return false;
    }
  };
  const computed = base === undefined ? [] : readOnlyOf(entity, base);
  const id = base === undefined ? undefined : String(base['id']);
  const related = meta.data === undefined ? [] : relatedOf(meta.data, entity);
  // The tabs that plugins add to the detail of this entity, or of every entity (UI-35).
  const text = usePluginText();
  const added = useAllowed(useRegistry().recordTabs).filter((tab) => tab.entity === '*' || tab.entity === entity.name);

  const details = (
    <>
      {base === undefined || (computed.length === 0 && (entity.transitions ?? []).length === 0) ? null : (
        <Space direction="vertical" style={{ width: '100%', marginBottom: 16 }}>
          {computed.length === 0 ? null : (
            <Descriptions
              size="small"
              column={{ xs: 1, sm: 2 }}
              title={t('detail.computed')}
              items={computed.map((item) => ({ key: item.key, label: item.key, children: shown(item.value) }))}
            />
          )}
          <Space wrap>
            <RowMoves entity={entity} row={base} move={moveHere} />
          </Space>
        </Space>
      )}
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
        {fields
          .filter((field) => states.visible.has(field.key))
          .map((field) => (
            <Form.Item
              key={field.key}
              label={field.key}
              name={field.key}
              required={states.required.has(field.key)}
              valuePropName={field.widget === 'switch' ? 'checked' : 'value'}
              rules={rulesOf({ ...field, required: states.required.has(field.key) }, t)}
            >
              <Control field={field} />
            </Form.Item>
          ))}
        {collections.map((inline) => (
          <Form.Item key={inline.name} label={labelOf({ ...entity, label: inline.label }, locale)}>
            <LinesEditor
              inline={inline}
              lines={lines[inline.name] ?? []}
              checked={tried}
              onChange={(next) => editLines(inline.name, next)}
            />
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
    </>
  );

  return (
    <Card title={t(updating ? 'form.edit' : 'form.new', { name: labelOf(entity, locale) })}>
      {id === undefined ? (
        details
      ) : (
        <Tabs
          type="card"
          className="bk-tabs"
          items={[
            { key: 'details', label: t('detail.details'), children: details },
            ...related.map((item) => ({
              key: `${item.entity.name}.${item.via.key}`,
              label: labelOf(item.entity, locale),
              children: <RelatedRows related={item} id={id} />,
            })),
            ...added.map((tab) => ({
              key: `${tab.plugin}/${tab.id}`,
              label: text(tab.title),
              children: (
                <Slot
                  name={`${tab.plugin}/${tab.id}`}
                  load={tab.load}
                  given={{ entity, id, row: base } satisfies RecordTabProps}
                />
              ),
            })),
          ]}
        />
      )}
    </Card>
  );
}

export function FormScreen(): JSX.Element {
  const { entity, loading } = useEntity();
  const t = useT();
  const params = useParams({ strict: false });
  const client = useClient();
  const id = params.id;
  // The hook is called whatever the metadata holds, so that the order of the hooks does not change when it arrives.
  const replacement = useAllowed(useRegistry().screens).find(
    (screen) => screen.replace === `form:${entity?.name ?? ''}`,
  );
  const search: Readonly<Record<string, unknown>> = useSearch({ strict: false });
  const row = useQuery({
    queryKey: ['row', entity?.name, id],
    queryFn: () => (entity === undefined || id === undefined ? Promise.resolve({}) : client.get(entity, id)),
    enabled: entity !== undefined && id !== undefined,
  });
  // A query that is not enabled stays pending, so only a row that is being read is waited for.
  if (loading || (id !== undefined && row.isPending)) return <Card loading />;
  if (entity === undefined || !entity.can.read) return <Result status="404" title={t('form.missing')} />;
  if (row.isError) return <Result status="error" title={t('form.rowLoadError')} subTitle={row.error.message} />;
  if (replacement !== undefined)
    return (
      <Slot
        name={`${replacement.plugin}/${replacement.id}`}
        load={replacement.load}
        given={{ entity, row: row.data } satisfies ScreenProps}
      />
    );
  return (
    <Editor
      key={id ?? 'new'}
      entity={entity}
      {...(id === undefined ? { prefill: prefillOf(formFieldsOf(entity), search) } : { row: row.data })}
    />
  );
}
