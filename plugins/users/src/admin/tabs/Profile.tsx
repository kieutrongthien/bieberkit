/**
 * BieberKit
 *
 * @file        plugins/users/src/admin/tabs/Profile.tsx
 * @description The own profile: the email, and the name that the person may change through the users plugin (USR-12, UI-26).
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

import { useSession, useText } from '@bieberkit/admin-antd';
import { useQueryClient } from '@tanstack/react-query';
import { Alert, App as AntApp, Button, Descriptions, Form, Input, Skeleton } from 'antd';
import { useState } from 'react';
import type { JSX } from 'react';
import styles from '../components/account.module.css';
import { useAccountApi, useAuthError, useMe } from '../lib/useAccount.ts';

export function ProfileTab(): JSX.Element {
  const t = useText();
  const api = useAccountApi();
  const queries = useQueryClient();
  const sentence = useAuthError();
  const { message } = AntApp.useApp();
  const session = useSession();
  const me = useMe();
  const [failure, setFailure] = useState<string | undefined>();
  const [busy, setBusy] = useState(false);

  if (me.isPending || session === undefined) return <Skeleton active />;
  if (me.isError)
    return <Alert type="error" showIcon title={t('users.account.loadError')} description={sentence(me.error)} />;
  const email = me.data?.email ?? session?.email ?? '';
  const name = me.data?.name ?? session?.name ?? '';
  // Without the users plugin there is no route that renames the person.
  const editable = me.data !== null;

  const save = async (values: { name: string }): Promise<void> => {
    setBusy(true);
    setFailure(undefined);
    try {
      await api.renameMe(values.name);
      await queries.invalidateQueries({ queryKey: ['me'] });
      void message.success(t('users.account.saved'));
    } catch (error) {
      setFailure(sentence(error));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className={styles.narrow}>
      <Descriptions column={1} items={[{ key: 'email', label: t('users.auth.email'), children: email }]} />
      {failure === undefined ? null : <Alert type="error" showIcon title={failure} style={{ marginBottom: 16 }} />}
      <Form
        name="bk-profile"
        layout="vertical"
        initialValues={{ name }}
        onFinish={(values: { name: string }) => void save(values)}
        requiredMark={false}
      >
        <Form.Item
          label={t('users.account.name')}
          name="name"
          rules={[{ required: true, max: 120 }]}
          extra={editable ? undefined : t('users.account.nameReadOnly')}
        >
          <Input autoComplete="name" readOnly={!editable} />
        </Form.Item>
        {editable ? (
          <Button type="primary" htmlType="submit" loading={busy}>
            {t('users.account.save')}
          </Button>
        ) : null}
      </Form>
    </div>
  );
}
