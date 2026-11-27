/**
 * BieberKit
 *
 * @file        packages/admin-antd/src/app/account/Sessions.tsx
 * @description The sessions of one's own account: the device, the address and the times of each, this one marked, and ending one or all the others (UI-26, AUTH-02).
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

import { deviceOf, formatDateTime } from '@bieberkit/admin-core';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Alert, Button, Skeleton, Tag } from 'antd';
import { useState } from 'react';
import type { JSX } from 'react';
import { useAuthError } from '../authError.ts';
import { useClient } from '../context.ts';
import { useLanguage, useT } from '../language.tsx';

export function SessionsTab(): JSX.Element {
  const t = useT();
  const { locale } = useLanguage();
  const client = useClient();
  const queries = useQueryClient();
  const sentence = useAuthError();
  const list = useQuery({ queryKey: ['sessions'], queryFn: () => client.sessions() });
  const [failure, setFailure] = useState<string | undefined>();
  const [busy, setBusy] = useState(false);

  if (list.isPending) return <Skeleton active />;
  if (list.isError)
    return <Alert type="error" showIcon title={t('account.loadError')} description={sentence(list.error)} />;

  const end = async (call: () => Promise<void>): Promise<void> => {
    setBusy(true);
    setFailure(undefined);
    try {
      await call();
      await queries.invalidateQueries({ queryKey: ['sessions'] });
    } catch (error) {
      setFailure(sentence(error));
    } finally {
      setBusy(false);
    }
  };

  const zone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const at = (instant: string): string => formatDateTime(locale, instant, zone);
  // This device first, then the ones that were used last.
  const sessions = list.data.toSorted(
    (a, b) => Number(b.current) - Number(a.current) || b.lastUsedAt.localeCompare(a.lastUsedAt),
  );

  return (
    <>
      {failure === undefined ? null : <Alert type="error" showIcon title={failure} style={{ marginBottom: 16 }} />}
      <ul className="bk-sessions">
        {sessions.map((session, index) => (
          <li key={session.token}>
            <div>
              <p id={`bk-session-${String(index)}`}>
                <strong>{deviceOf(session.userAgent) || t('sessions.unknownDevice')}</strong>
                {session.current ? <Tag className="bk-state-here">{t('sessions.thisDevice')}</Tag> : null}
              </p>
              <p className="bk-session-detail">
                {t('sessions.detail', {
                  ip: session.ip || t('sessions.unknownAddress'),
                  created: at(session.createdAt),
                  used: at(session.lastUsedAt),
                })}
              </p>
            </div>
            {session.current ? null : (
              <Button
                disabled={busy}
                aria-describedby={`bk-session-${String(index)}`}
                onClick={() => void end(() => client.revokeSession(session.token))}
              >
                {t('sessions.end')}
              </Button>
            )}
          </li>
        ))}
      </ul>
      {sessions.some((session) => !session.current) ? (
        <Button danger loading={busy} onClick={() => void end(() => client.revokeOtherSessions())}>
          {t('sessions.endOthers')}
        </Button>
      ) : null}
    </>
  );
}
