/**
 * BieberKit
 *
 * @file        packages/admin-antd/src/app/Welcome.tsx
 * @description The first screen of the admin: the entities that the user may read, each with a link to its list (UI-02).
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

import { labelOf } from '@bieberkit/admin-core';
import { Link } from '@tanstack/react-router';
import { Card, Empty, List, Typography } from 'antd';
import type { JSX } from 'react';
import { useMeta } from './context.ts';

export function Welcome(): JSX.Element {
  const meta = useMeta();
  const entities = (meta.data?.entities ?? []).filter((entity) => entity.operations.list && entity.can.read);
  return (
    <Card loading={meta.isPending}>
      <Typography.Title level={3}>Welcome</Typography.Title>
      {entities.length === 0 ? (
        <Empty description="Nothing here is open to you yet. Ask an administrator for a role." />
      ) : (
        <List
          dataSource={entities}
          renderItem={(entity) => (
            <List.Item>
              <Link to={`/${entity.path.replace('/api/v1/', '')}`}>{labelOf(entity, 'en')}</Link>
            </List.Item>
          )}
        />
      )}
    </Card>
  );
}
