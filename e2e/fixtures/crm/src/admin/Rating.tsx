/**
 * BieberKit
 *
 * @file        e2e/fixtures/crm/src/admin/Rating.tsx
 * @description The control that the fixture plugin gives to every field whose widget is `rating` (UI-35, slot 6).
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
import type { FieldProps } from '@bieberkit/admin-antd';
import { Button, Space } from 'antd';
import type { JSX } from 'react';

export default function Rating(props: FieldProps): JSX.Element {
  const text = useText();
  const value = typeof props.value === 'number' ? props.value : 0;
  return (
    <Space id={props.id} role="group" aria-label={props.label ?? text('crm.rating')}>
      {[1, 2, 3, 4, 5].map((star) => (
        <Button
          key={star}
          size="small"
          type={star <= value ? 'primary' : 'default'}
          aria-pressed={star === value}
          onClick={() => props.onChange?.(star)}
        >
          {star}
        </Button>
      ))}
    </Space>
  );
}
