<!--
  BieberKit

  @file        packages/cli/api/oxlint.api.md
  @description API report of bieberkit: its public surface, checked in CI and reviewed in pull requests.
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

# API report: bieberkit

Generated from the built declaration files by `pnpm api:update`. Do not edit by hand. A change here is a change to the public API and needs a changeset (spec section 22.3).

```ts
export interface OxlintContext {
  readonly filename?: string;
  readonly physicalFilename?: string;
  readonly options?: readonly unknown[];
  readonly sourceCode: {
    readonly text: string;
  };
  report(descriptor: {
    message: string;
    loc: {
      start: {
        line: number;
        column: number;
      };
      end: {
        line: number;
        column: number;
      };
    };
  }): void;
}
export interface OxlintRule {
  readonly meta: {
    readonly type: "problem";
    readonly docs: {
      readonly description: string;
    };
    readonly schema: readonly object[];
  };
  create(context: OxlintContext): Record<string, () => void>;
}
export interface OxlintPlugin {
  readonly meta: {
    readonly name: string;
  };
  readonly rules: Readonly<Record<string, OxlintRule>>;
}
declare const plugin: OxlintPlugin;
export { plugin as default };
```
