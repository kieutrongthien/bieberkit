/**
 * BieberKit
 *
 * @file        packages/admin-antd/src/components/AuthShell.tsx
 * @description The two sides of the pages that open before a session: the brand on the frame, and the form beside it (UI-23, UI-26).
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

import { Input, Typography } from 'antd';
import type { InputProps } from 'antd';
import type { JSX, ReactNode } from 'react';
import { Brand, useTagline } from '../shell/Brand.tsx';

export function AuthShell(props: {
  readonly title: string;
  readonly text?: string;
  readonly children: ReactNode;
}): JSX.Element {
  const tagline = useTagline();
  return (
    <div className="bk-login">
      <aside className="bk-login-brand">
        <Brand />
        <p className="bk-tagline">{tagline}</p>
        <div className="bk-stack" aria-hidden="true">
          <div />
          <div />
          <div>
            <span />
          </div>
        </div>
      </aside>
      <main className="bk-login-form">
        <div>
          <Typography.Title level={1} className="bk-title">
            {props.title}
          </Typography.Title>
          {props.text === undefined ? null : <Typography.Paragraph type="secondary">{props.text}</Typography.Paragraph>}
          {props.children}
        </div>
      </main>
    </div>
  );
}

/** The links under a form before sign in, such as the way to a forgotten password. */
export function AuthLinks(props: { readonly children: ReactNode }): JSX.Element {
  return <div className="bk-auth-links">{props.children}</div>;
}

/** The field of a code that a person types from another device: large, spaced and centered. */
export function CodeInput(props: InputProps): JSX.Element {
  return <Input {...props} className="bk-code-input" />;
}
