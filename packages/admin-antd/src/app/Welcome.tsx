/**
 * BieberKit
 *
 * @file        packages/admin-antd/src/app/Welcome.tsx
 * @description The first screen after the sign in: the pages of the menu by group, as folders, and the widgets that plugins add to the dashboard (UI-02, UI-04, UI-23, UI-24).
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

import { labelText, menuOf, widgetsIn } from '@bieberkit/admin-core';
import { Link } from '@tanstack/react-router';
import { Card, Col, Empty, Row, Skeleton, Typography } from 'antd';
import type { JSX } from 'react';
import { SETTINGS } from './Brand.tsx';
import { useMeta } from './context.ts';
import { useGroupName } from './Gate.tsx';
import { FolderArt, Icon } from './icons.tsx';
import { useLanguage, useT } from './language.tsx';
import { PluginSlot, useExtensions } from './Plugins.tsx';

export function Welcome(): JSX.Element {
  const meta = useMeta();
  const t = useT();
  const { locale } = useLanguage();
  const groupName = useGroupName();
  const widgets = widgetsIn(useExtensions(), 'dashboard');
  const groups = meta.data === undefined ? [] : menuOf(meta.data, SETTINGS.menu);
  return (
    <>
      <div className="bk-page-head">
        <Typography.Title level={1} className="bk-title">
          {t('welcome.title')}
        </Typography.Title>
        {groups.length === 0 ? null : <Typography.Text type="secondary">{t('welcome.subtitle')}</Typography.Text>}
      </div>
      {meta.isPending ? <Skeleton active /> : null}
      {!meta.isPending && groups.length === 0 ? <Empty image={<FolderArt />} description={t('welcome.empty')} /> : null}
      {groups.map((group) => (
        <section key={group.id} className="bk-home-group">
          <Typography.Title level={2}>{groupName(group)}</Typography.Title>
          <ul className="bk-home-list">
            {group.entries.map((entry) => (
              <li key={entry.key}>
                <Link to={entry.path}>
                  <span className="bk-home-icon">
                    <Icon names={entry.icons} size={20} />
                  </span>
                  {labelText(entry.label, locale, entry.name)}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ))}
      {widgets.length === 0 ? null : (
        <Row gutter={[16, 16]} style={{ marginTop: 24 }}>
          {widgets.map((widget) => (
            <Col key={widget.module} xs={24} md={12}>
              <Card size="small" title={labelText(widget.title, locale, widget.slot)}>
                <PluginSlot module={widget.module} name={`${widget.plugin}/${widget.slot}`} />
              </Card>
            </Col>
          ))}
        </Row>
      )}
    </>
  );
}
