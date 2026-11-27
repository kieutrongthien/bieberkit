/**
 * BieberKit
 *
 * @file        packages/admin-antd/src/app/main.tsx
 * @description The entry of the admin application: it fills the root of the page with the application (UI-01).
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

import { createRoot } from 'react-dom/client';
// The stylesheets are imported for their effect: Vite bundles them. The font comes with the admin and from no other origin
// (UI-14, ADR 0039), and a browser reads only the files of the scripts that the page shows.
// oxlint-disable-next-line import/no-unassigned-import
import '@fontsource/be-vietnam-pro/400.css';
// oxlint-disable-next-line import/no-unassigned-import
import '@fontsource/be-vietnam-pro/500.css';
// oxlint-disable-next-line import/no-unassigned-import
import '@fontsource/be-vietnam-pro/600.css';
// oxlint-disable-next-line import/no-unassigned-import
import '@fontsource/be-vietnam-pro/700.css';
// oxlint-disable-next-line import/no-unassigned-import
import './app.css';
import { App } from './App.tsx';
import { reloadForChunk } from './chunk.ts';
import { startReports } from './reports.ts';

// Vite says so when the file of a screen is gone: a deploy replaced it while this tab was open (UI-22).
window.addEventListener('vite:preloadError', (event) => {
  if (reloadForChunk(new Error('Failed to fetch dynamically imported module')) === 'reload') event.preventDefault();
});

startReports();

const root = document.getElementById('root');
if (root === null) throw new Error('The page has no #root.');
createRoot(root).render(<App />);
