/**
 * BieberKit
 *
 * @file        packages/admin-antd/src/components/AdminLink.tsx
 * @description A link to a route of the admin, which keeps the application open (UI-38).
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

import { Link } from '@tanstack/react-router';
import type { JSX, ReactNode } from 'react';

export function AdminLink(props: {
  /** A route of the admin, such as `/crm/accounts`. */
  readonly to: string;
  readonly search?: Readonly<Record<string, string>>;
  readonly children: ReactNode;
}): JSX.Element {
  return (
    <Link to={props.to} {...(props.search === undefined ? {} : { search: props.search })}>
      {props.children}
    </Link>
  );
}
