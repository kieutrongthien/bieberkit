/**
 * BieberKit
 *
 * @file        e2e/fixtures/crm/src/admin/CrmNotice.tsx
 * @description A notice of the fixture plugin over the frame. It shows only when a test asks for it, so that the other tests see no extra alert (UI-35, slot 4).
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

import { useText } from '@bieberkit/admin-antd';
import type { NoticeProps } from '@bieberkit/admin-antd';
import { Alert } from 'antd';
import type { JSX } from 'react';

export default function CrmNotice(props: NoticeProps): JSX.Element | null {
  const text = useText();
  if (window.localStorage.getItem('crm-notice') !== 'on') return null;
  return (
    <Alert
      type="info"
      showIcon
      title={text('crm.notice')}
      closable={{ 'aria-label': text('crm.closeNotice'), onClose: props.close }}
    />
  );
}
