<!--
  BieberKit

  @file        packages/data/api/extend.api.md
  @description API report of @bieberkit/data: its public surface, checked in CI and reviewed in pull requests.
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

# API report: @bieberkit/data

Generated from the built declaration files by `pnpm api:update`. Do not edit by hand. A change here is a change to the public API and needs a changeset (spec section 22.3).

```ts
import { S as FieldDef, a as EntityDef, c as FieldLike } from "./define-entity-CiRXYWez.js";
interface ExtensionPermissions {
  readonly fields?: Readonly<Record<string, {
    readonly read?: string;
    readonly update?: string;
  }>>;
}
interface ExtensionOptions {
  readonly table: string;
  readonly fields: Readonly<Record<string, FieldLike>>;
  readonly permissions?: ExtensionPermissions;
}
interface ExtensionDef {
  readonly kind: "extension";
  readonly table: string;
  readonly fields: Readonly<Record<string, FieldDef>>;
  readonly permissions: {
    readonly fields: Readonly<Record<string, {
      readonly read?: string;
      readonly update?: string;
    }>>;
  };
}
interface ExtensionRef {
  readonly module: string;
  readonly target: string;
  readonly extension: ExtensionDef;
}
interface ResolvedExtension extends ExtensionRef {
  readonly fields: readonly string[];
  readonly entity: EntityDef<string>;
}
interface ResolvedEntities {
  readonly entities: EntityDef<string>[];
  readonly extensions: ResolvedExtension[];
}
declare function defineExtension(options: ExtensionOptions): ExtensionDef;
declare function resolveExtensions(entities: readonly EntityDef<string>[], refs: readonly ExtensionRef[]): ResolvedEntities;
export { ResolvedEntities as a, resolveExtensions as c, ExtensionRef as i, ExtensionOptions as n, ResolvedExtension as o, ExtensionPermissions as r, defineExtension as s, ExtensionDef as t };
```
