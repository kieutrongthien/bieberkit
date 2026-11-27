/**
 * BieberKit
 *
 * @file        packages/admin-antd/src/app/Login.tsx
 * @description The sign in: the side of the brand with its sentence and the stack of folders, and the form of the email and the password over the session of Better Auth. A refusal is shown with its words (AUTH-01, AUTH-06, UI-23, UI-33).
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

import { AdminApiError } from '@bieberkit/admin-core';
import { useQueryClient } from '@tanstack/react-query';
import { Alert, Button, Form, Input, Typography } from 'antd';
import { useState } from 'react';
import type { JSX } from 'react';
import { Brand, useTagline } from './Brand.tsx';
import { useClient } from './context.ts';
import { useT } from './language.tsx';

interface Values {
  readonly email: string;
  readonly password: string;
}

export function Login(): JSX.Element {
  const t = useT();
  const tagline = useTagline();
  const client = useClient();
  const queries = useQueryClient();
  const [failure, setFailure] = useState<string | undefined>();
  const [busy, setBusy] = useState(false);

  const submit = async (values: Values): Promise<void> => {
    setBusy(true);
    setFailure(undefined);
    try {
      await client.signIn(values.email, values.password);
      await queries.invalidateQueries();
    } catch (error) {
      setFailure(error instanceof AdminApiError ? error.message : t('auth.noAnswer'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="bk-login">
      <aside className="bk-login-brand">
        <Brand />
        <p className="bk-tagline">{tagline}</p>
        <div className="bk-stack" aria-hidden="true">
          <div />
          <div />
          <div>
            <span />
          </div>
        </div>
      </aside>
      <main className="bk-login-form">
        <div>
          <Typography.Title level={1} className="bk-title">
            {t('auth.signIn.title')}
          </Typography.Title>
          <Typography.Paragraph type="secondary">{t('auth.signIn.subtitle')}</Typography.Paragraph>
          {failure === undefined ? null : (
            <Alert type="error" showIcon message={failure} style={{ marginBottom: 16 }} />
          )}
          <Form<Values> layout="vertical" size="large" onFinish={(values) => void submit(values)} requiredMark={false}>
            <Form.Item label={t('auth.email')} name="email" rules={[{ required: true, type: 'email' }]}>
              <Input autoComplete="username" autoFocus />
            </Form.Item>
            <Form.Item label={t('auth.password')} name="password" rules={[{ required: true }]}>
              <Input.Password autoComplete="current-password" />
            </Form.Item>
            <Button type="primary" htmlType="submit" loading={busy} block>
              {t('auth.signIn')}
            </Button>
          </Form>
        </div>
      </main>
    </div>
  );
}
