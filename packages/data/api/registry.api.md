<!--
  BieberKit

  @file        packages/data/api/registry.api.md
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
import { a as EntityDef } from "./define-entity-B93nbOOC.js";
interface EntityRegistry {}
type Row<N extends keyof EntityRegistry> = EntityRegistry[N] extends {
  row: infer R;
} ? R : never;
type CreateInput<N extends keyof EntityRegistry> = EntityRegistry[N] extends {
  create: infer R;
} ? R : never;
type UpdateInput<N extends keyof EntityRegistry> = EntityRegistry[N] extends {
  update: infer R;
} ? R : never;
interface RegistryOptions {
  readonly header: string;
  readonly module?: string;
}
declare function generateRegistrySource(defs: readonly EntityDef<string>[], options: RegistryOptions): string;
export { UpdateInput as a, Row as i, EntityRegistry as n, generateRegistrySource as o, RegistryOptions as r, CreateInput as t };
```
