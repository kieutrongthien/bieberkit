/**
 * BieberKit
 *
 * @file        packages/admin-antd/src/app/ResetPassword.tsx
 * @description The page of a password link: a new password, or the first one of an invitation, and what to do when the link is spent. The token is held in memory and taken out of the address (UI-26, USR-09, USR-10, UI-21).
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

import { AdminApiError, resetSearchOf } from '@bieberkit/admin-core';
import { useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate } from '@tanstack/react-router';
import { Alert, Button, Form } from 'antd';
import { useEffect, useState } from 'react';
import type { JSX } from 'react';
import { useAuthError } from './authError.ts';
import { AuthShell } from './AuthShell.tsx';
import { useClient } from './context.ts';
import { useT } from './language.tsx';
import { NewPasswordFields } from './NewPasswordFields.tsx';
import type { NewPassword } from './NewPasswordFields.tsx';
import { useNotice } from './notice.ts';

export function ResetPassword(): JSX.Element {
  const t = useT();
  const client = useClient();
  const queries = useQueryClient();
  const navigate = useNavigate();
  const sentence = useAuthError();
  const { setNotice } = useNotice();
  // Read once, from the address as the browser has it.
  const [link] = useState(() => resetSearchOf(window.location.search));
  const [spent, setSpent] = useState(link.invalid);
  const [failure, setFailure] = useState<string | undefined>();
  const [busy, setBusy] = useState(false);

  // The token does not stay in the address, so it is not in the history and not in what a person copies from the bar.
  useEffect(() => {
    void navigate({ to: '/reset-password', replace: true });
  }, [navigate]);

  const submit = async (values: NewPassword): Promise<void> => {
    if (link.token === undefined) return;
    setBusy(true);
    setFailure(undefined);
    try {
      await client.resetPassword(link.token, values.password);
      // The sessions of that account ended. Somebody else who is signed in here stays signed in, so the session is asked again,
      // and the home page shows the sign in or the admin as the answer says.
      setNotice('reset.done');
      await queries.resetQueries();
      await navigate({ to: '/' });
    } catch (error) {
      if (error instanceof AdminApiError && error.code === 'INVALID_TOKEN') setSpent(true);
      else setFailure(sentence(error));
    } finally {
      setBusy(false);
    }
  };

  if (spent) {
    return (
      <AuthShell title={t('reset.spent.title')} text={t('reset.spent.text')}>
        <div className="bk-auth-links">
          <Link to="/forgot-password">{t('reset.spent.again')}</Link>
          <Link to="/">{t('auth.code.back')}</Link>
        </div>
      </AuthShell>
    );
  }

  return (
    <AuthShell
      title={t(link.invite ? 'reset.invite.title' : 'reset.choose.title')}
      text={t(link.invite ? 'password.rule' : 'reset.choose.endsSessions')}
    >
      {failure === undefined ? null : <Alert type="error" showIcon title={failure} style={{ marginBottom: 16 }} />}
      <Form<NewPassword>
        name="bk-reset"
        layout="vertical"
        size="large"
        onFinish={(values) => void submit(values)}
        requiredMark={false}
      >
        <NewPasswordFields />
        <Button type="primary" htmlType="submit" loading={busy} block>
          {t('reset.set')}
        </Button>
      </Form>
    </AuthShell>
  );
}
