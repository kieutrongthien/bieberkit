/**
 * BieberKit
 *
 * @file        packages/admin-antd/src/app/connection.tsx
 * @description The offline banner: the admin tells the person that it cannot reach the server, instead of a blank screen (UI-19).
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

import { connection, isNetworkFailure } from '@bieberkit/admin-core';
import type { Connection } from '@bieberkit/admin-core';
import { useQueryClient } from '@tanstack/react-query';
import { Alert } from 'antd';
import { useEffect, useState } from 'react';
import type { JSX } from 'react';
import { useT } from './language.tsx';

/** Whether the admin can reach the server: the events of the browser, and the outcome of every query. */
export function useConnection(): Connection {
  const queries = useQueryClient();
  const [state, setState] = useState<Connection>({ online: navigator.onLine });
  useEffect(() => {
    const offline = (): void => setState((now) => connection(now, 'offline'));
    const online = (): void => setState((now) => connection(now, 'online'));
    window.addEventListener('offline', offline);
    window.addEventListener('online', online);
    const stop = queries.getQueryCache().subscribe((event) => {
      if (event.type !== 'updated') return;
      const { status, error } = event.query.state;
      if (status === 'error' && isNetworkFailure(error)) setState((now) => connection(now, 'request-failed'));
      else if (status === 'success') setState((now) => connection(now, 'request-ok'));
    });
    return () => {
      window.removeEventListener('offline', offline);
      window.removeEventListener('online', online);
      stop();
    };
  }, [queries]);
  return state;
}

export function OfflineBanner(): JSX.Element | null {
  const t = useT();
  const { online } = useConnection();
  return online ? null : <Alert banner type="warning" message={t('shell.offline')} role="alert" />;
}
