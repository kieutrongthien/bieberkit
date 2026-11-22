<!--
  BieberKit

  @file        packages/data/api/steps.api.md
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
import { BkError, Dialect } from "@bieberkit/core";
import { Transaction } from "kysely";
declare class DataError extends BkError {}
declare function dataError(code: string, status: number, message: string, fix: string, cause?: unknown): DataError;
type DestructiveKind = "drop-column" | "drop-table" | "rename" | "alter-type" | "not-null-without-default";
interface DestructiveFinding {
  readonly kind: DestructiveKind;
  readonly statement: string;
}
declare function detectDestructive(statements: readonly string[]): DestructiveFinding[];
declare function upStatementsOfMigration(source: string): string[];
type StepDatabase = Record<string, Record<string, unknown>>;
type StepKind = "expand" | "migrate" | "contract";
interface PluginMigrationStep {
  readonly plugin: string;
  readonly version: string;
  readonly id: string;
  readonly kind: StepKind;
  readonly after?: string;
  up(trx: Transaction<StepDatabase>, dialect: Dialect): Promise<void>;
}
declare function compareVersions(a: string, b: string): number;
declare function stepName(step: Pick<PluginMigrationStep, "plugin" | "id">): string;
declare function orderSteps(steps: readonly PluginMigrationStep[], pluginOrder: readonly string[]): PluginMigrationStep[];
declare function validateSteps(steps: readonly PluginMigrationStep[], pluginOrder: readonly string[]): void;
interface StepRisk {
  readonly kind: "mysql-unguarded-ddl" | "destructive-before-contract";
  readonly step: string;
  readonly message: string;
}
declare function findStepRisks(steps: readonly PluginMigrationStep[]): StepRisk[];
export { compareVersions as a, stepName as c, DestructiveKind as d, detectDestructive as f, dataError as h, StepRisk as i, validateSteps as l, DataError as m, StepDatabase as n, findStepRisks as o, upStatementsOfMigration as p, StepKind as r, orderSteps as s, PluginMigrationStep as t, DestructiveFinding as u };
```
