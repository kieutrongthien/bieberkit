<!--
  BieberKit

  @file        packages/admin-antd/api/index.api.md
  @description API report of @bieberkit/admin-antd: its public surface, checked in CI and reviewed in pull requests.
  @author      Bieber Kieu <kieutrongthien@gmail.com>
  @generated   pnpm api:update
  @copyright   Copyright (c) 2026 Bieber Kieu
  @license     Apache-2.0

  Licensed under the Apache License, Version 2.0 (the "License");
  you may not use this file except in compliance with the License.
  You may obtain a copy of the License at

      http://www.apache.org/licenses/LICENSE-2.0

  Unless required by applicable law or agreed to in writing, software
  distributed under the License is distributed on an "AS IS" BASIS,
  WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
  See the License for the specific language governing permissions and
  limitations under the License.

  SPDX-License-Identifier: Apache-2.0
-->

# API report: @bieberkit/admin-antd

Generated from the built declaration files by `pnpm api:update`. Do not edit by hand. A change here is a change to the public API and needs a changeset (spec section 22.3).

```ts
import { AdminComponent } from "./app/slots.js";
import { AdminLanguage, AdminNotice, NavigateOptions, Text, useAdminAddress, useAdminClient, useAdminNavigate, useCan, useLanguage, useMeta, useNotice, usePluginText, useSession } from "./app/hooks.js";
import { AdminLink } from "./app/AdminLink.js";
import { AdminPart, StartOptions, startAdmin } from "./app/start.js";
import { AuthLinks, AuthShell, CodeInput } from "./app/AuthShell.js";
import { FieldProps, GateProps, NoticeProps, RecordTabProps, ScreenProps, SignInProps } from "./app/slot-props.js";
import { FolderArt, Icon } from "./app/icons.js";
import { GateShell } from "./app/GateShell.js";
export declare const packageName: string;
export { type AdminComponent, type AdminLanguage, AdminLink, type AdminNotice, type AdminPart, AuthLinks, AuthShell, CodeInput, type FieldProps, FolderArt, type GateProps, GateShell, Icon, type NavigateOptions, type NoticeProps, type RecordTabProps, type ScreenProps, type SignInProps, type StartOptions, type Text, startAdmin, useAdminAddress, useAdminClient, useAdminNavigate, useCan, useLanguage, useMeta, useNotice, useSession, usePluginText as useText };
```
