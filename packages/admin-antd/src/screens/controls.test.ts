/**
 * BieberKit
 *
 * @file        packages/admin-antd/src/screens/controls.test.ts
 * @description The control of a file field of the shell: without a plugin that gives one, the value that is held is shown and cannot be changed, with the reason (UI-34, UI-35).
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

import { composeAdmin, createAdminClient, defineAdminPlugin } from '@bieberkit/admin-core';
import type { MetaField } from '@bieberkit/admin-core';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { ClientContext } from '../lib/context.ts';
import { Control } from './controls.tsx';
import { RegistryContext } from '../slots/slots.tsx';
import type { AdminComponent, Registry } from '../slots/slots.tsx';

const field: MetaField = {
  key: 'attachment',
  kind: 'file',
  widget: 'file',
  required: false,
  readOnly: false,
  filterable: false,
  sortable: false,
};

const draw = (registry: Registry): string =>
  renderToStaticMarkup(
    createElement(
      ClientContext.Provider,
      { value: createAdminClient() },
      createElement(
        QueryClientProvider,
        { client: new QueryClient() },
        createElement(RegistryContext.Provider, { value: registry }, createElement(Control, { field, value: 'm-17' })),
      ),
    ),
  );

const SENTENCE = 'No plugin gives a control for files';
const load = async (): Promise<{ default: AdminComponent }> => ({ default: () => null });

describe('UI-34 a file field of a project without a plugin for files', () => {
  it('UI-34 shows the id that it holds, which cannot be changed, and says why', () => {
    const markup = draw(composeAdmin<AdminComponent>([]).admin);
    expect(markup).toMatch(/<input[^>]*readOnly=""[^>]*value="m-17"/i);
    expect(markup).toContain(SENTENCE);
    expect(markup).not.toContain('type="file"');
  });

  it('UI-35 is drawn by the control of the plugin that gives one for its widget, and the sentence is gone', () => {
    const part = defineAdminPlugin({
      name: 'bieberkit-plugin-files',
      fields: [{ id: 'file', widget: 'file', load }],
    });
    expect(draw(composeAdmin([part]).admin)).not.toContain(SENTENCE);
  });
});
