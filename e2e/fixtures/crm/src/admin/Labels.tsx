/**
 * BieberKit
 *
 * @file        e2e/fixtures/crm/src/admin/Labels.tsx
 * @description The screen that the fixture plugin draws in place of the generic list of labels (UI-04).
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
import type { ScreenProps } from '@bieberkit/admin-antd';
import type { JSX } from 'react';

export default function Labels(props: ScreenProps): JSX.Element {
  const text = useText();
  return <div data-replaced={props.entity.name}>{text('crm.labels')}</div>;
}
