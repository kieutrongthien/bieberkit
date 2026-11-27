<!--
  BieberKit

  @file        packages/core/api/errors.api.md
  @description API report of @bieberkit/core: its public surface, checked in CI and reviewed in pull requests.
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

# API report: @bieberkit/core

Generated from the built declaration files by `pnpm api:update`. Do not edit by hand. A change here is a change to the public API and needs a changeset (spec section 22.3).

```ts
export interface ErrorBody {
  readonly code: string;
  readonly status: number;
  readonly message: string;
  readonly fix: string;
}
export interface BkErrorOptions {
  readonly code: string;
  readonly status?: number;
  readonly safeMessage?: string;
  readonly fix?: string;
  readonly cause?: unknown;
}
export declare class BkError extends Error {
  readonly code: string;
  readonly status: number;
  readonly safeMessage: string;
  readonly fix: string;
  constructor(message: string, options: BkErrorOptions);
  toJSON(): ErrorBody;
}
export declare class ConfigError extends BkError {}
export declare class ContainerError extends BkError {}
export interface EnvProblem {
  readonly key: string;
  readonly code: "CFG_ENV_MISSING" | "CFG_ENV_INVALID";
  readonly message: string;
  readonly fix: string;
}
export declare class EnvValidationError extends ConfigError {
  readonly problems: readonly EnvProblem[];
  constructor(problems: readonly EnvProblem[]);
}
export interface ConfigProblem {
  readonly key: string;
  readonly code: "CFG_CONFIG_INVALID" | "CFG_CONFIG_UNKNOWN" | "CFG_CONFIG_SECRET";
  readonly message: string;
  readonly fix: string;
}
export declare class ConfigValidationError extends ConfigError {
  readonly problems: readonly ConfigProblem[];
  constructor(problems: readonly ConfigProblem[]);
}
export declare function toBkError(value: unknown): BkError;
```
