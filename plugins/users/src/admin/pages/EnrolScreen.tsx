/**
 * BieberKit
 *
 * @file        plugins/users/src/admin/pages/EnrolScreen.tsx
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

import { GateShell, useText } from '@bieberkit/admin-antd';
import type { GateProps } from '@bieberkit/admin-antd';
import { Alert, Card, Skeleton } from 'antd';
import type { JSX } from 'react';
import { TwoFactorSetup } from '../components/TwoFactorSetup.tsx';
import { useHasPassword } from '../lib/useAccount.ts';

export function EnrolScreen(props: GateProps): JSX.Element {
  const t = useText();
  const password = useHasPassword();
  return (
    <GateShell title={t('users.enrol.title')} text={t('users.enrol.text')} onSignOut={props.onSignOut}>
      <Card>
        {password.isPending ? (
          <Skeleton active />
        ) : password.data === false ? (
          <Alert type="info" showIcon title={t('users.account.provider')} />
        ) : (
          <TwoFactorSetup onDone={props.onDone} />
        )}
      </Card>
    </GateShell>
  );
}
