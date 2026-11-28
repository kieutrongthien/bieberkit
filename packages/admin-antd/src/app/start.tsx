/**
 * BieberKit
 *
 * @file        packages/admin-antd/src/app/start.tsx
 * @description What starts the admin in a page: the styles and the font, the reports, the reload after a deploy, and the application with the admin parts of the project (UI-37, UI-14, UI-21, UI-22).
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

import { composeAdmin } from '@bieberkit/admin-core';
import type { AdminPart as CorePart } from '@bieberkit/admin-core';
import { createRoot } from 'react-dom/client';
// The stylesheets are imported for their effect: the build of the project bundles them. The font comes with the admin and from no
// other origin (UI-14, ADR 0039), and a browser reads only the files of the scripts that the page shows.
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
import { createApp } from './App.tsx';
import { reloadForChunk } from './chunk.ts';
import { reportClientError, startReports } from './reports.ts';
import type { AdminComponent } from './slots.tsx';

export type { AdminComponent };

/** The admin part of a plugin for this adapter: what its entry `./admin` exports by default. */
export type AdminPart = CorePart<AdminComponent>;

export interface StartOptions {
  /** The admin parts of the project, in the boot order of its plugins. The build of the project makes the list (UI-37). */
  readonly parts: readonly AdminPart[];
}

/** Draws the admin in `root`. A project calls it once, from the entry of `apps/admin`. */
export function startAdmin(root: HTMLElement, options: StartOptions): void {
  // Vite says so when the file of a screen is gone: a deploy replaced it while this tab was open (UI-22).
  window.addEventListener('vite:preloadError', (event) => {
    if (reloadForChunk(new Error('Failed to fetch dynamically imported module')) === 'reload') event.preventDefault();
  });
  startReports();
  // The build of the project stops on a mistake in a part. What reaches a browser anyway is reported, and the rest is drawn.
  const { admin, problems } = composeAdmin(options.parts);
  for (const problem of problems)
    if (problem.code !== 'no-sign-in') reportClientError(new Error(`${problem.plugin}: ${problem.message}`));
  const App = createApp(admin);
  createRoot(root).render(<App />);
}
