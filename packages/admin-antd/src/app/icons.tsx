/**
 * BieberKit
 *
 * @file        packages/admin-antd/src/app/icons.tsx
 * @description The icons of the admin, drawn as strokes so that no icon dependency is needed, and the drawing of an empty folder (UI-23, UI-24).
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

import type { JSX } from 'react';

const BELL = 'M6 17V11a6 6 0 0 1 12 0v6l1.5 2h-15zM10 21h4';

const PATHS: Readonly<Record<string, string>> = {
  users:
    'M9 11.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7zM2.5 20a6.5 6.5 0 0 1 13 0M16 4.8a3.5 3.5 0 0 1 0 6.4M18 14.5a6.5 6.5 0 0 1 3.5 5.5',
  roles: 'M12 3l8 3v6c0 4.5-3.4 7.8-8 9-4.6-1.2-8-4.5-8-9V6z',
  folder: 'M3 6h6l2 2h10v11H3z',
  media: 'M3 6h6l2 2h10v11H3z',
  bell: BELL,
  notifications: BELL,
  settings: 'M4 7h10M18 7h2M4 17h4M12 17h8M18 7a2 2 0 1 1-4 0 2 2 0 0 1 4 0zM12 17a2 2 0 1 1-4 0 2 2 0 0 1 4 0z',
  'audit-log': 'M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0zM12 7v5l3 2',
  search: 'M17 10.5a6.5 6.5 0 1 1-13 0 6.5 6.5 0 0 1 13 0zM15.5 15.5L21 21',
  plain: 'M6 4h9l4 4v12H6zM15 4v4h4',
};

/** The first of the names that the admin draws, or a plain sheet. It is decoration: the text beside it names the entry. */
export function Icon(props: { readonly names: readonly string[]; readonly size?: number }): JSX.Element {
  const size = props.size ?? 18;
  const name = props.names.find((candidate) => Object.hasOwn(PATHS, candidate)) ?? 'plain';
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinejoin="round"
      strokeLinecap="round"
      aria-hidden="true"
      focusable="false"
    >
      <path d={PATHS[name]} />
    </svg>
  );
}

/** An empty folder: what the admin shows where there is nothing, and while it opens. */
export function FolderArt(props: { readonly className?: string }): JSX.Element {
  return (
    <svg className={props.className ?? 'bk-folder-art'} viewBox="0 0 64 48" aria-hidden="true" focusable="false">
      <path
        className="bk-folder-back"
        d="M2 8a4 4 0 0 1 4-4h18l6 6h28a4 4 0 0 1 4 4v28a4 4 0 0 1-4 4H6a4 4 0 0 1-4-4z"
      />
      <rect className="bk-folder-front" x="2" y="18" width="60" height="28" rx="4" />
      <rect className="bk-folder-mark" x="10" y="28" width="12" height="6" />
    </svg>
  );
}
