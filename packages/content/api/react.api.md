<!--
  BieberKit

  @file        packages/content/api/react.api.md
  @description API report of @bieberkit/content: its public surface, checked in CI and reviewed in pull requests.
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

# API report: @bieberkit/content

Generated from the built declaration files by `pnpm api:update`. Do not edit by hand. A change here is a change to the public API and needs a changeset (spec section 22.3).

```ts
import { ReactNode } from "react";
import { a as Block, k as RenderOptions, t as Content } from "./content-ssMgeg54.js";
export type BlockComponent = (props: {
  readonly block: Block;
  readonly children: ReactNode;
}) => ReactNode;
export type BlockComponents = Readonly<Record<string, BlockComponent>>;
export interface ReactRenderOptions extends RenderOptions {
  readonly components?: BlockComponents;
}
export declare function renderContent(content: Content, input: unknown, options?: ReactRenderOptions): ReactNode;
```
