/**
 * BieberKit
 *
 * @file        packages/admin-antd/src/app/Login.tsx
 * @description The sign in page: the brand and the sentence of the project, the email and the password of a local account, and for an account with a second factor the step that asks for the code (UI-14, UI-23, UI-26, AUTH-05).
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

import { normalizeCode, stepExpired } from '@bieberkit/admin-core';
import type { CodeKind } from '@bieberkit/admin-core';
import { useQueryClient } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { Alert, Button, Form, Input } from 'antd';
import { useState } from 'react';
import type { JSX } from 'react';
import { useAuthError } from './authError.ts';
import { AuthShell } from './AuthShell.tsx';
import { useClient } from './context.ts';
import { useT } from './language.tsx';
import { useNotice } from './notice.ts';

interface Values {
  readonly email: string;
  readonly password: string;
}

/** The step after a right password of an account with a second factor. There is no session until the code is taken. */
function CodeStep(props: {
  readonly onDone: () => Promise<void>;
  readonly onBack: (failure?: string) => void;
}): JSX.Element {
  const t = useT();
  const client = useClient();
  const sentence = useAuthError();
  const [kind, setKind] = useState<CodeKind>('totp');
  const [failure, setFailure] = useState<string | undefined>();
  const [busy, setBusy] = useState(false);
  const [form] = Form.useForm<{ code: string }>();

  const submit = async (values: { code: string }): Promise<void> => {
    setBusy(true);
    setFailure(undefined);
    try {
      await client.verifySecondFactor(normalizeCode(values.code, kind), kind);
      await props.onDone();
    } catch (error) {
      if (stepExpired(error)) props.onBack(sentence(error));
      else setFailure(sentence(error));
    } finally {
      setBusy(false);
    }
  };

  const change = (next: CodeKind): void => {
    setKind(next);
    setFailure(undefined);
    form.resetFields();
  };

  return (
    <AuthShell title={t('auth.code.title')} text={t(kind === 'totp' ? 'auth.code.text' : 'auth.code.backupText')}>
      {failure === undefined ? null : <Alert type="error" showIcon title={failure} style={{ marginBottom: 16 }} />}
      <Form
        form={form}
        name="bk-code"
        layout="vertical"
        size="large"
        onFinish={(values) => void submit(values)}
        requiredMark={false}
      >
        <Form.Item
          label={t(kind === 'totp' ? 'auth.code.label' : 'auth.code.backupLabel')}
          name="code"
          rules={[{ required: true }]}
        >
          <Input
            key={kind}
            autoFocus
            autoComplete={kind === 'totp' ? 'one-time-code' : 'off'}
            inputMode={kind === 'totp' ? 'numeric' : 'text'}
            className="bk-code-input"
          />
        </Form.Item>
        <Button type="primary" htmlType="submit" loading={busy} block>
          {t('auth.code.verify')}
        </Button>
      </Form>
      <div className="bk-auth-links">
        <Button type="link" onClick={() => change(kind === 'totp' ? 'backup' : 'totp')}>
          {t(kind === 'totp' ? 'auth.code.useBackup' : 'auth.code.useApp')}
        </Button>
        <Button type="link" onClick={() => props.onBack()}>
          {t('auth.code.back')}
        </Button>
      </div>
    </AuthShell>
  );
}

export function Login(): JSX.Element {
  const t = useT();
  const client = useClient();
  const queries = useQueryClient();
  const sentence = useAuthError();
  const { notice, setNotice } = useNotice();
  const [step, setStep] = useState<'password' | 'code'>('password');
  const [failure, setFailure] = useState<string | undefined>();
  const [busy, setBusy] = useState(false);

  const signedIn = async (): Promise<void> => {
    setNotice(undefined);
    await queries.invalidateQueries();
  };

  const submit = async (values: Values): Promise<void> => {
    setBusy(true);
    setFailure(undefined);
    try {
      const result = await client.signIn(values.email, values.password);
      if (result.kind === 'secondFactor') setStep('code');
      else await signedIn();
    } catch (error) {
      setFailure(sentence(error));
    } finally {
      setBusy(false);
    }
  };

  if (step === 'code') {
    return (
      <CodeStep
        onDone={signedIn}
        onBack={(why) => {
          setFailure(why);
          setStep('password');
        }}
      />
    );
  }

  return (
    <AuthShell title={t('auth.signIn.title')} text={t('auth.signIn.subtitle')}>
      {notice === undefined ? null : <Alert type="success" showIcon title={t(notice)} style={{ marginBottom: 16 }} />}
      {failure === undefined ? null : <Alert type="error" showIcon title={failure} style={{ marginBottom: 16 }} />}
      <Form<Values>
        name="bk-sign-in"
        layout="vertical"
        size="large"
        onFinish={(values) => void submit(values)}
        requiredMark={false}
      >
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
      <div className="bk-auth-links">
        <Link to="/forgot-password">{t('auth.forgot')}</Link>
      </div>
    </AuthShell>
  );
}
