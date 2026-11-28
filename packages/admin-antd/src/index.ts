/**
 * BieberKit
 *
 * @file        packages/admin-antd/src/index.ts
 * @description Public entry point of @bieberkit/admin-antd.
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

// The public API of @bieberkit/admin-antd: the shell that a project builds its admin from, and what the admin part of a plugin uses.

export { startAdmin } from './app/start.tsx';
export type { AdminComponent, AdminPart, StartOptions } from './app/start.tsx';

// What the screens of a plugin use (UI-38).
export {
  useAdminClient,
  useAdminNavigate,
  useCan,
  useLanguage,
  useMeta,
  useNotice,
  useSession,
  usePluginText as useText,
} from './app/hooks.ts';
export type { AdminLanguage, AdminNotice, NavigateOptions, Text } from './app/hooks.ts';
export { AuthShell } from './app/AuthShell.tsx';
export { FolderArt, Icon } from './app/icons.tsx';
export type { FieldProps, GateProps, NoticeProps, RecordTabProps, ScreenProps, SignInProps } from './app/slot-props.ts';

/** npm name of this package. */
export const packageName: string = '@bieberkit/admin-antd';
