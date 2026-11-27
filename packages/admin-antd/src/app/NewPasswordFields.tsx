/**
 * BieberKit
 *
 * @file        packages/admin-antd/src/app/NewPasswordFields.tsx
 * @description The two fields of a new password inside a form, with the rules of the server said early and the advice of a longer one (AUTH-04, UI-26).
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

import { passwordIsShort, passwordProblem } from '@bieberkit/admin-core';
import { Form, Input } from 'antd';
import type { JSX } from 'react';
import { useT } from './language.tsx';

/** The names of the two fields. The form that holds them reads `password`. */
export interface NewPassword {
  readonly password: string;
  readonly repeat: string;
}

export function NewPasswordFields(): JSX.Element {
  const t = useT();
  const form = Form.useFormInstance<NewPassword>();
  const typed = Form.useWatch<string | undefined>('password', form) ?? '';
  return (
    <>
      <Form.Item
        label={t('password.new')}
        name="password"
        extra={passwordIsShort(typed) ? t('password.advice') : undefined}
        rules={[
          { required: true },
          {
            validator: async (_rule, value: unknown) => {
              const problem = typeof value === 'string' && value !== '' ? passwordProblem(value) : undefined;
              if (problem !== undefined) throw new Error(t(`password.${problem}`));
            },
          },
        ]}
      >
        <Input.Password autoComplete="new-password" />
      </Form.Item>
      <Form.Item
        label={t('password.repeat')}
        name="repeat"
        dependencies={['password']}
        rules={[
          { required: true },
          {
            validator: async (_rule, value: unknown) => {
              if (value !== undefined && value !== '' && value !== form.getFieldValue('password'))
                throw new Error(t('password.mismatch'));
            },
          },
        ]}
      >
        <Input.Password autoComplete="new-password" />
      </Form.Item>
    </>
  );
}
