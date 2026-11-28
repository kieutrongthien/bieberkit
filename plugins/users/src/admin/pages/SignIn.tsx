/**
 * BieberKit
 *
 * @file        plugins/users/src/admin/pages/SignIn.tsx
 * @description The sign in of the admin: the email and the password, then for an account with a second factor the code (UI-26, AUTH-05, slot 9).
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

import { AdminLink, AuthLinks, AuthShell, CodeInput, useNotice, useText } from '@bieberkit/admin-antd';
import type { SignInProps } from '@bieberkit/admin-antd';
import { Alert, Button, Form, Input } from 'antd';
import { useState } from 'react';
import type { JSX } from 'react';
import { normalizeCode, stepExpired } from '../lib/rules.ts';
import type { CodeKind } from '../lib/api.ts';
import { useAccountApi, useAuthError } from '../lib/useAccount.ts';

interface Values {
  readonly email: string;
  readonly password: string;
}

/** The step after a right password of an account with a second factor. There is no session until the code is taken. */
function CodeStep(props: {
  readonly onDone: () => Promise<void>;
  readonly onBack: (failure?: string) => void;
}): JSX.Element {
  const t = useText();
  const api = useAccountApi();
  const sentence = useAuthError();
  const [kind, setKind] = useState<CodeKind>('totp');
  const [failure, setFailure] = useState<string | undefined>();
  const [busy, setBusy] = useState(false);
  const [form] = Form.useForm<{ code: string }>();

  const submit = async (values: { code: string }): Promise<void> => {
    setBusy(true);
    setFailure(undefined);
    try {
      await api.verifySecondFactor(normalizeCode(values.code, kind), kind);
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
    <AuthShell
      title={t('users.auth.code.title')}
      text={t(kind === 'totp' ? 'users.auth.code.text' : 'users.auth.code.backupText')}
    >
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
          label={t(kind === 'totp' ? 'users.auth.code.label' : 'users.auth.code.backupLabel')}
          name="code"
          rules={[{ required: true }]}
        >
          <CodeInput
            key={kind}
            autoFocus
            autoComplete={kind === 'totp' ? 'one-time-code' : 'off'}
            inputMode={kind === 'totp' ? 'numeric' : 'text'}
          />
        </Form.Item>
        <Button type="primary" htmlType="submit" loading={busy} block>
          {t('users.auth.code.verify')}
        </Button>
      </Form>
      <AuthLinks>
        <Button type="link" onClick={() => change(kind === 'totp' ? 'backup' : 'totp')}>
          {t(kind === 'totp' ? 'users.auth.code.useBackup' : 'users.auth.code.useApp')}
        </Button>
        <Button type="link" onClick={() => props.onBack()}>
          {t('users.auth.code.back')}
        </Button>
      </AuthLinks>
    </AuthShell>
  );
}

export function SignIn(props: SignInProps): JSX.Element {
  const t = useText();
  const api = useAccountApi();
  const sentence = useAuthError();
  const { notice, setNotice } = useNotice();
  const [step, setStep] = useState<'password' | 'code'>('password');
  const [failure, setFailure] = useState<string | undefined>();
  const [busy, setBusy] = useState(false);

  const signedIn = async (): Promise<void> => {
    setNotice(undefined);
    await props.onSignedIn();
  };

  const submit = async (values: Values): Promise<void> => {
    setBusy(true);
    setFailure(undefined);
    try {
      const result = await api.signIn(values.email, values.password);
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
    <AuthShell title={t('users.auth.signIn.title')} text={t('users.auth.signIn.subtitle')}>
      {notice === undefined ? null : <Alert type="success" showIcon title={t(notice)} style={{ marginBottom: 16 }} />}
      {failure === undefined ? null : <Alert type="error" showIcon title={failure} style={{ marginBottom: 16 }} />}
      <Form<Values>
        name="bk-sign-in"
        layout="vertical"
        size="large"
        onFinish={(values) => void submit(values)}
        requiredMark={false}
      >
        <Form.Item label={t('users.auth.email')} name="email" rules={[{ required: true, type: 'email' }]}>
          <Input autoComplete="username" autoFocus />
        </Form.Item>
        <Form.Item label={t('users.auth.password')} name="password" rules={[{ required: true }]}>
          <Input.Password autoComplete="current-password" />
        </Form.Item>
        <Button type="primary" htmlType="submit" loading={busy} block>
          {t('users.auth.signIn')}
        </Button>
      </Form>
      <AuthLinks>
        <AdminLink to="/forgot-password">{t('users.auth.forgot')}</AdminLink>
      </AuthLinks>
    </AuthShell>
  );
}
