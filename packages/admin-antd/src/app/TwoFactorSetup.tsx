/**
 * BieberKit
 *
 * @file        packages/admin-antd/src/app/TwoFactorSetup.tsx
 * @description Setting up the second factor in three steps: the password, the QR code with a code from the app, and the backup codes that are shown once. The password, the secret and the codes are held in memory only (AUTH-05, UI-26).
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

import { normalizeCode, secretOfUri } from '@bieberkit/admin-core';
import type { TotpEnrolment } from '@bieberkit/admin-core';
import { Alert, Button, Checkbox, Flex, Form, Input, QRCode, Typography } from 'antd';
import { useState } from 'react';
import type { JSX } from 'react';
import { useAuthError } from './authError.ts';
import { useClient } from './context.ts';
import { useT } from './language.tsx';

/** Asks for the password before a change of the second factor. A refusal stays with the form, so the person can try again. */
export function PasswordPrompt(props: {
  readonly text: string;
  readonly onPassword: (password: string) => Promise<void>;
  readonly onCancel?: () => void;
}): JSX.Element {
  const t = useT();
  const sentence = useAuthError();
  const [failure, setFailure] = useState<string | undefined>();
  const [busy, setBusy] = useState(false);

  const submit = async (values: { password: string }): Promise<void> => {
    setBusy(true);
    setFailure(undefined);
    try {
      await props.onPassword(values.password);
    } catch (error) {
      setFailure(sentence(error));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="bk-narrow">
      <Typography.Paragraph>{props.text}</Typography.Paragraph>
      {failure === undefined ? null : <Alert type="error" showIcon title={failure} style={{ marginBottom: 16 }} />}
      <Form
        name="bk-confirm"
        layout="vertical"
        onFinish={(values: { password: string }) => void submit(values)}
        requiredMark={false}
      >
        <Form.Item label={t('auth.password')} name="password" rules={[{ required: true }]}>
          <Input.Password autoComplete="current-password" autoFocus />
        </Form.Item>
        <Flex gap="small" wrap>
          <Button type="primary" htmlType="submit" loading={busy}>
            {t('setup.continue')}
          </Button>
          {props.onCancel === undefined ? null : <Button onClick={props.onCancel}>{t('common.cancel')}</Button>}
        </Flex>
      </Form>
    </div>
  );
}

/** The backup codes, which are shown once. The person says that they are saved before the screen lets them go. */
export function BackupCodes(props: { readonly codes: readonly string[]; readonly onDone: () => void }): JSX.Element {
  const t = useT();
  const [saved, setSaved] = useState(false);
  const [copied, setCopied] = useState(false);
  const text = `${props.codes.join('\n')}\n`;

  const copy = (): void => {
    // A browser that refuses the clipboard leaves the list on the screen and the download.
    void navigator.clipboard.writeText(text).then(
      () => setCopied(true),
      () => undefined,
    );
  };
  const download = (): void => {
    const url = URL.createObjectURL(new Blob([text], { type: 'text/plain' }));
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = 'backup-codes.txt';
    anchor.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="bk-narrow">
      <Typography.Title level={2} className="bk-step-title">
        {t('setup.codes.title')}
      </Typography.Title>
      <Typography.Paragraph>{t('setup.codes.text')}</Typography.Paragraph>
      <ul className="bk-codes" aria-label={t('setup.codes.label')}>
        {props.codes.map((code) => (
          <li key={code}>{code}</li>
        ))}
      </ul>
      <Flex gap="small" wrap style={{ marginBottom: 16 }}>
        <Button onClick={copy}>{t(copied ? 'setup.codes.copied' : 'setup.codes.copy')}</Button>
        <Button onClick={download}>{t('setup.codes.download')}</Button>
      </Flex>
      <Checkbox checked={saved} onChange={(event) => setSaved(event.target.checked)} style={{ marginBottom: 16 }}>
        {t('setup.codes.saved')}
      </Checkbox>
      <div>
        <Button type="primary" disabled={!saved} onClick={props.onDone}>
          {t('setup.done')}
        </Button>
      </div>
    </div>
  );
}

function Scan(props: { readonly uri: string; readonly onVerified: () => void }): JSX.Element {
  const t = useT();
  const client = useClient();
  const sentence = useAuthError();
  const [failure, setFailure] = useState<string | undefined>();
  const [busy, setBusy] = useState(false);
  const secret = secretOfUri(props.uri);

  const submit = async (values: { code: string }): Promise<void> => {
    setBusy(true);
    setFailure(undefined);
    try {
      await client.verifySecondFactor(normalizeCode(values.code, 'totp'), 'totp');
      props.onVerified();
    } catch (error) {
      setFailure(sentence(error));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="bk-narrow">
      <Typography.Title level={2} className="bk-step-title">
        {t('setup.scan.title')}
      </Typography.Title>
      <Typography.Paragraph>{t('setup.scan.text')}</Typography.Paragraph>
      {/* Black on white in both palettes, with a quiet zone, so that a camera reads it. */}
      <div className="bk-qr" data-testid="totp-qr" role="img" aria-label={t('setup.scan.qr')}>
        {/* The frame has the name. The drawing inside gives itself the role of a picture with no name, so it is hidden. */}
        <div aria-hidden="true">
          <QRCode type="svg" value={props.uri} size={192} color="#000000" bgColor="#ffffff" bordered={false} />
        </div>
      </div>
      <Typography.Paragraph style={{ marginBottom: 4 }}>{t('setup.scan.key')}</Typography.Paragraph>
      <code className="bk-secret" data-testid="totp-secret">
        {secret.match(/.{1,4}/g)?.join(' ') ?? secret}
      </code>
      {failure === undefined ? null : <Alert type="error" showIcon title={failure} style={{ marginBottom: 16 }} />}
      <Form
        name="bk-verify"
        layout="vertical"
        onFinish={(values: { code: string }) => void submit(values)}
        requiredMark={false}
      >
        <Form.Item label={t('auth.code.label')} name="code" rules={[{ required: true }]}>
          <Input autoComplete="one-time-code" inputMode="numeric" className="bk-code-input" />
        </Form.Item>
        <Button type="primary" htmlType="submit" loading={busy}>
          {t('auth.code.verify')}
        </Button>
      </Form>
    </div>
  );
}

export function TwoFactorSetup(props: { readonly onDone: () => void; readonly onCancel?: () => void }): JSX.Element {
  const t = useT();
  const client = useClient();
  const [enrolment, setEnrolment] = useState<TotpEnrolment | undefined>();
  const [verified, setVerified] = useState(false);

  if (enrolment === undefined) {
    return (
      <PasswordPrompt
        text={t('setup.start')}
        onPassword={async (password) => setEnrolment(await client.enableTotp(password))}
        {...(props.onCancel === undefined ? {} : { onCancel: props.onCancel })}
      />
    );
  }
  if (!verified) return <Scan uri={enrolment.uri} onVerified={() => setVerified(true)} />;
  return <BackupCodes codes={enrolment.backupCodes} onDone={props.onDone} />;
}
