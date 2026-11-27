/**
 * BieberKit
 *
 * @file        packages/admin-antd/src/app/account/TwoFactor.tsx
 * @description One's own second factor: setting it up, new backup codes and turning it off, each after the password. Where it is asked of the person, turning it off is not offered. The server stays the authority (UI-26, AUTH-05, POL-02, IDN-02).
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
import { Alert, Button, Flex, Skeleton, Tag, Typography } from 'antd';
import { useState } from 'react';
import type { JSX } from 'react';
import { useClient, useHasPassword, useMe, useSession } from '../context.ts';
import { useT } from '../language.tsx';
import { BackupCodes, PasswordPrompt, TwoFactorSetup } from '../TwoFactorSetup.tsx';

type Step =
  | { readonly name: 'idle' }
  | { readonly name: 'setup' }
  | { readonly name: 'renew' }
  | { readonly name: 'codes'; readonly codes: readonly string[] }
  | { readonly name: 'off' };

const IDLE: Step = { name: 'idle' };

export function TwoFactorTab(): JSX.Element {
  const t = useT();
  const client = useClient();
  const queries = useQueryClient();
  const session = useSession();
  const me = useMe();
  const has = useHasPassword();
  const [step, setStep] = useState<Step>(IDLE);

  if (session.isPending || me.isPending || has.isPending) return <Skeleton active />;
  if (has.data === false) return <Alert type="info" showIcon title={t('account.provider')} />;
  const on = session.data?.twoFactorEnabled === true;
  const required = me.data?.mfaRequired === true;
  const cancel = (): void => setStep(IDLE);
  /** Reads again what the factor changes: who is signed in, what is asked of them, and the sessions. */
  const refresh = (): Promise<unknown> =>
    Promise.all(['session', 'me', 'sessions'].map((key) => queries.invalidateQueries({ queryKey: [key] })));
  const finish = (): void => void refresh().then(cancel);

  if (step.name === 'setup') return <TwoFactorSetup onDone={finish} onCancel={cancel} />;
  if (step.name === 'codes') return <BackupCodes codes={step.codes} onDone={cancel} />;
  if (step.name === 'renew') {
    return (
      <PasswordPrompt
        text={t('factor.askPassword')}
        onPassword={async (password) => setStep({ name: 'codes', codes: await client.renewBackupCodes(password) })}
        onCancel={cancel}
      />
    );
  }
  if (step.name === 'off') {
    return (
      <PasswordPrompt
        text={t('factor.askPassword')}
        onPassword={async (password) => {
          await client.disableTotp(password);
          await refresh();
          cancel();
        }}
        onCancel={cancel}
      />
    );
  }

  return (
    <Flex vertical gap="middle" align="flex-start">
      <Flex gap="small" align="center" wrap>
        <Typography.Title level={2} className="bk-step-title">
          {t('account.tab.factor')}
        </Typography.Title>
        {/* Colors of the theme: the ones that Ant Design derives from a dark green do not read. */}
        <Tag className={on ? 'bk-state-on' : ''}>{t(on ? 'factor.on' : 'factor.off')}</Tag>
      </Flex>
      <Typography.Paragraph style={{ margin: 0 }}>{t('factor.explain')}</Typography.Paragraph>
      {on ? (
        <Flex gap="small" wrap>
          <Button onClick={() => setStep({ name: 'renew' })}>{t('factor.newCodes')}</Button>
          {required ? null : (
            <Button danger onClick={() => setStep({ name: 'off' })}>
              {t('factor.turnOff')}
            </Button>
          )}
        </Flex>
      ) : (
        <Button type="primary" onClick={() => setStep({ name: 'setup' })}>
          {t('factor.setUp')}
        </Button>
      )}
      {on && required ? <Alert type="info" showIcon title={t('factor.required')} /> : null}
    </Flex>
  );
}
