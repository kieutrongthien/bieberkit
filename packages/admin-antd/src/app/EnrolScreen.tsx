/**
 * BieberKit
 *
 * @file        packages/admin-antd/src/app/EnrolScreen.tsx
 * @description The screen that stands in place of the admin while a second factor is asked of the person and they have none: the three steps, and a way to sign out (AUTH-05, ROL-07, POL-02, UI-26).
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

import { Alert, Button, Card, Skeleton, Typography } from 'antd';
import type { JSX } from 'react';
import { Brand } from './Brand.tsx';
import { useHasPassword } from './context.ts';
import { useT } from './language.tsx';
import { TwoFactorSetup } from './TwoFactorSetup.tsx';

export function EnrolScreen(props: { readonly onDone: () => void; readonly onSignOut: () => void }): JSX.Element {
  const t = useT();
  const password = useHasPassword();
  return (
    <div className="bk-enrol">
      <header className="bk-enrol-head">
        <Brand />
        <Button ghost onClick={props.onSignOut}>
          {t('auth.signOut')}
        </Button>
      </header>
      <main className="bk-enrol-main">
        <Typography.Title level={1} className="bk-title">
          {t('enrol.title')}
        </Typography.Title>
        <Typography.Paragraph type="secondary">{t('enrol.text')}</Typography.Paragraph>
        <Card>
          {password.isPending ? (
            <Skeleton active />
          ) : password.data === false ? (
            <Alert type="info" showIcon title={t('account.provider')} />
          ) : (
            <TwoFactorSetup onDone={props.onDone} />
          )}
        </Card>
      </main>
    </div>
  );
}
