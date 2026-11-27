/**
 * BieberKit
 *
 * @file        packages/admin-antd/src/app/account/Password.tsx
 * @description Changing one's own password, with the other sessions signed out unless the person says no (UI-26, AUTH-04, IDN-02).
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

import { useQueryClient } from '@tanstack/react-query';
import { Alert, App as AntApp, Button, Checkbox, Form, Input, Skeleton } from 'antd';
import { useState } from 'react';
import type { JSX } from 'react';
import { useAuthError } from '../authError.ts';
import { useClient, useHasPassword } from '../context.ts';
import { useT } from '../language.tsx';
import { NewPasswordFields } from '../NewPasswordFields.tsx';
import type { NewPassword } from '../NewPasswordFields.tsx';

interface Values extends NewPassword {
  readonly current: string;
  readonly signOutOthers: boolean;
}

export function PasswordTab(): JSX.Element {
  const t = useT();
  const client = useClient();
  const queries = useQueryClient();
  const sentence = useAuthError();
  const { message } = AntApp.useApp();
  const has = useHasPassword();
  const [failure, setFailure] = useState<string | undefined>();
  const [busy, setBusy] = useState(false);
  const [form] = Form.useForm<Values>();

  if (has.isPending) return <Skeleton active />;
  if (has.data === false) return <Alert type="info" showIcon title={t('account.provider')} />;

  const change = async (values: Values): Promise<void> => {
    setBusy(true);
    setFailure(undefined);
    try {
      await client.changePassword({
        current: values.current,
        next: values.password,
        signOutOthers: values.signOutOthers,
      });
      form.resetFields();
      await queries.invalidateQueries({ queryKey: ['sessions'] });
      void message.success(t('account.password.changed'));
    } catch (error) {
      setFailure(sentence(error));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="bk-narrow">
      {failure === undefined ? null : <Alert type="error" showIcon title={failure} style={{ marginBottom: 16 }} />}
      <Form<Values>
        form={form}
        name="bk-password"
        layout="vertical"
        initialValues={{ signOutOthers: true }}
        onFinish={(values) => void change(values)}
        requiredMark={false}
      >
        <Form.Item label={t('password.current')} name="current" rules={[{ required: true }]}>
          <Input.Password autoComplete="current-password" />
        </Form.Item>
        <NewPasswordFields />
        <Form.Item name="signOutOthers" valuePropName="checked">
          <Checkbox>{t('account.password.signOutOthers')}</Checkbox>
        </Form.Item>
        <Button type="primary" htmlType="submit" loading={busy}>
          {t('account.password.change')}
        </Button>
      </Form>
    </div>
  );
}
