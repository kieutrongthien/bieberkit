/**
 * BieberKit
 *
 * @file        packages/admin-antd/src/app/ExtensionPage.tsx
 * @description A page that a plugin adds, at `/ext/<plugin>/<path>`: the module of the page drawn in the frame of the admin (UI-04, ADR 0037).
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

import { labelText, pageFor } from '@bieberkit/admin-core';
import { useParams } from '@tanstack/react-router';
import { Card, Result } from 'antd';
import type { JSX } from 'react';
import { useMeta } from './context.ts';
import { useLanguage, useT } from './language.tsx';
import { PluginSlot, useExtensions } from './Plugins.tsx';

export function ExtensionPage(): JSX.Element {
  const params = useParams({ strict: false });
  const meta = useMeta();
  const extensions = useExtensions();
  const { locale } = useLanguage();
  const t = useT();
  if (meta.isPending) return <Card loading />;
  const page = pageFor(extensions, String(params.plugin), String(params.page));
  // A page that the person may not use is not in the metadata, so it is the same as a page that does not exist.
  if (page === undefined) return <Result status="404" title={t('plugin.missing')} />;
  return (
    <Card title={labelText(page.title, locale, page.path)}>
      <PluginSlot module={page.module} name={`${page.plugin}/${page.path}`} />
    </Card>
  );
}
