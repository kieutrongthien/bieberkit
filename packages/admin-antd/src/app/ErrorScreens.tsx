/**
 * BieberKit
 *
 * @file        packages/admin-antd/src/app/ErrorScreens.tsx
 * @description The error boundaries of the admin: one for each route and one for the whole application, each with a retry (UI-19).
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

import { Button, Result } from 'antd';
import { Component } from 'react';
import type { ErrorInfo, JSX, ReactNode } from 'react';
import { reloadForChunk } from './chunk.ts';
import { useT } from './language.tsx';

/** What a route shows when its screen fails: the retry, or for a missing chunk the reload that a deploy needs (UI-19, UI-22). */
export function ErrorScreen(props: { readonly error: unknown; readonly reset: () => void }): JSX.Element {
  const t = useT();
  const chunk = reloadForChunk(props.error);
  if (chunk !== 'ignore') {
    return (
      <Result
        status="warning"
        title={t('error.updated')}
        extra={
          <Button type="primary" onClick={() => window.location.reload()}>
            {t('error.reload')}
          </Button>
        }
      />
    );
  }
  return (
    <Result
      status="error"
      title={t('error.title')}
      subTitle={props.error instanceof Error ? props.error.message : undefined}
      extra={
        <Button type="primary" onClick={props.reset}>
          {t('error.retry')}
        </Button>
      }
    />
  );
}

interface BoundaryState {
  readonly error: unknown;
  readonly failed: boolean;
}

/** The last net of the application: what the routes do not catch, such as the frame of the page. */
export class ErrorBoundary extends Component<{ readonly children: ReactNode }, BoundaryState> {
  override state: BoundaryState = { error: undefined, failed: false };

  static getDerivedStateFromError(error: unknown): BoundaryState {
    return { error, failed: true };
  }

  override componentDidCatch(_error: Error, _info: ErrorInfo): void {
    // The report of UI-21 is sent from here when the reporting is on.
  }

  override render(): ReactNode {
    if (!this.state.failed) return this.props.children;
    return <ErrorScreen error={this.state.error} reset={() => this.setState({ error: undefined, failed: false })} />;
  }
}
