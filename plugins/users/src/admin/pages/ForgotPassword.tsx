/**
 * BieberKit
 *
 * @file        plugins/users/src/admin/pages/ForgotPassword.tsx
 * @description The page that asks for a link to a new password. It says the same for an address with and without an account (UI-26, AUTH-06).
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

import { AdminLink, AuthLinks, AuthShell, useAdminAddress, useText } from '@bieberkit/admin-antd';
import { Alert, Button, Form, Input } from 'antd';
import { useState } from 'react';
import type { JSX } from 'react';
import { useAccountApi, useAuthError } from '../lib/useAccount.ts';

export function ForgotPassword(): JSX.Element {
  const t = useText();
  const api = useAccountApi();
  const address = useAdminAddress();
  const sentence = useAuthError();
  const [sent, setSent] = useState(false);
  const [failure, setFailure] = useState<string | undefined>();
  const [busy, setBusy] = useState(false);

  const submit = async (values: { email: string }): Promise<void> => {
    setBusy(true);
    setFailure(undefined);
    try {
      await api.requestPasswordReset(values.email, address('/reset-password'));
      setSent(true);
    } catch (error) {
      setFailure(sentence(error));
    } finally {
      setBusy(false);
    }
  };

  return (
    <AuthShell title={t('users.reset.forgot.title')} text={t('users.reset.forgot.text')}>
      {failure === undefined ? null : <Alert type="error" showIcon title={failure} style={{ marginBottom: 16 }} />}
      {sent ? (
        <Alert type="success" showIcon title={t('users.reset.forgot.sent')} role="status" />
      ) : (
        <Form
          name="bk-forgot"
          layout="vertical"
          size="large"
          onFinish={(values: { email: string }) => void submit(values)}
          requiredMark={false}
        >
          <Form.Item label={t('users.auth.email')} name="email" rules={[{ required: true, type: 'email' }]}>
            <Input autoComplete="username" autoFocus />
          </Form.Item>
          <Button type="primary" htmlType="submit" loading={busy} block>
            {t('users.reset.forgot.send')}
          </Button>
        </Form>
      )}
      <AuthLinks>
        <AdminLink to="/">{t('users.auth.code.back')}</AdminLink>
      </AuthLinks>
    </AuthShell>
  );
}
