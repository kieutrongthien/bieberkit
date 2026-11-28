/**
 * BieberKit
 *
 * @file        packages/admin-antd/src/components/GateShell.tsx
 * @description The layout of a screen that stands in place of the admin: the brand, a way to sign out, a title and what the screen asks for (UI-35, slot 10).
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

import { Button, Typography } from 'antd';
import type { JSX, ReactNode } from 'react';
import { Brand } from '../shell/Brand.tsx';
import { useT } from '../lib/language.tsx';

export function GateShell(props: {
  readonly title: string;
  readonly text?: string;
  readonly onSignOut: () => void;
  readonly children: ReactNode;
}): JSX.Element {
  const t = useT();
  return (
    <div className="bk-gate">
      <header className="bk-gate-head">
        <Brand />
        <Button ghost onClick={props.onSignOut}>
          {t('auth.signOut')}
        </Button>
      </header>
      <main className="bk-gate-main">
        <Typography.Title level={1} className="bk-title">
          {props.title}
        </Typography.Title>
        {props.text === undefined ? null : <Typography.Paragraph type="secondary">{props.text}</Typography.Paragraph>}
        {props.children}
      </main>
    </div>
  );
}
