/**
 * BieberKit
 *
 * @file        packages/admin-antd/src/app/GraceNotice.tsx
 * @description The notice of the days of grace: by when the second factor has to be set up, with a link to it. It can be closed until the next load (POL-02, UI-26).
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

import { formatDateTime } from '@bieberkit/admin-core';
import { Link } from '@tanstack/react-router';
import { Alert } from 'antd';
import { useState } from 'react';
import type { JSX } from 'react';
import { useMe } from './context.ts';
import { useLanguage, useT } from './language.tsx';

export function GraceNotice(): JSX.Element | null {
  const t = useT();
  const { locale } = useLanguage();
  const me = useMe();
  const [closed, setClosed] = useState(false);
  const by = me.data?.mfaEnrolBy;
  if (by === undefined || closed) return null;
  const date = formatDateTime(locale, by, Intl.DateTimeFormat().resolvedOptions().timeZone);
  return (
    <Alert
      className="bk-grace"
      type="warning"
      showIcon
      closable={{ 'aria-label': t('common.close'), onClose: () => setClosed(true) }}
      title={
        <>
          {t('grace.text', { date })}{' '}
          <Link to="/account" search={{ tab: 'factor' } as never}>
            {t('grace.link')}
          </Link>
        </>
      }
    />
  );
}
