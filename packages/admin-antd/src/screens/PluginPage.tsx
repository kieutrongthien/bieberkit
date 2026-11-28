/**
 * BieberKit
 *
 * @file        packages/admin-antd/src/screens/PluginPage.tsx
 * @description A page that a plugin adds: its title and its screen, or for a person without its permission the word that it is not open, and then its code is not read (UI-35).
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

import type { Registry } from '../slots/slots.tsx';
import { Result, Skeleton, Typography } from 'antd';
import type { JSX } from 'react';
import { useMeta } from '../lib/context.ts';
import { usePluginText } from '../lib/hooks.ts';
import { useT } from '../lib/language.tsx';
import { Slot } from '../slots/slots.tsx';

export function PluginPage(props: { readonly page: Registry['pages'][number] }): JSX.Element {
  const { page } = props;
  const meta = useMeta();
  const t = useT();
  const text = usePluginText();
  if (meta.isPending) return <Skeleton active />;
  if (page.permission !== undefined && !(meta.data?.permissions.includes(page.permission) ?? false))
    return <Result status="403" title={t('page.closed')} />;
  return (
    <>
      <div className="bk-page-head">
        <Typography.Title level={1} className="bk-title">
          {text(page.title)}
        </Typography.Title>
      </div>
      <Slot name={`${page.plugin}${page.path}`} load={page.load} />
    </>
  );
}
