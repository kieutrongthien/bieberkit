<!--
  BieberKit

  @file        packages/data/api/build.api.md
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
import AjvModule from "ajv/dist/2020.js";
import { Options } from "ajv";
import { a as EntityDef } from "./define-entity-CMoIdUz2.js";
declare const Ajv: typeof AjvModule.default;
type AjvInstance = InstanceType<typeof Ajv>;
export declare function createAjv(options?: Options): AjvInstance;
interface StandaloneManifest {
  readonly version: number;
  readonly hash: string;
  readonly entities: readonly string[];
}
interface StandaloneFiles {
  readonly validators: string;
  readonly serializers: string;
  readonly manifest: StandaloneManifest;
}
interface StandaloneOptions {
  readonly runtime?: string;
}
export declare function emitStandalone(defs: readonly EntityDef<string>[], options?: StandaloneOptions): StandaloneFiles;
export declare function writeStandalone(defs: readonly EntityDef<string>[], directory: string, options?: StandaloneOptions): Promise<StandaloneFiles>;
interface ValidationIssue {
  readonly path: string;
  readonly keyword: string;
  readonly message: string;
}
type ValidationResult = {
  readonly ok: true;
  readonly value: unknown;
} | {
  readonly ok: false;
  readonly issues: ValidationIssue[];
};
interface AjvError {
  readonly instancePath: string;
  readonly keyword: string;
  readonly message?: string;
  readonly params: Readonly<Record<string, unknown>>;
}
type Validator = ((data: unknown) => boolean) & {
  errors?: AjvError[] | null;
};
type Serializer = (data: unknown) => string;
interface StandaloneParts {
  readonly validators: Readonly<Record<string, Validator>>;
  readonly serializers: Readonly<Record<string, Serializer>>;
  readonly manifest: StandaloneManifest;
}
interface StandaloneRuntime {
  readonly manifest: StandaloneManifest;
  validate(entity: string, mode: "create" | "update", input: unknown): ValidationResult;
  serialize(entity: string, row: unknown): string;
  serializeMany(entity: string, rows: readonly unknown[]): string;
  assertCurrent(defs: readonly EntityDef<string>[]): void;
}
export declare function issuesOf(errors: readonly AjvError[] | null | undefined): ValidationIssue[];
export declare function createStandaloneRuntime(parts: StandaloneParts): StandaloneRuntime;
export declare function loadStandalone(directory: string): Promise<StandaloneRuntime>;
export type { AjvError, AjvInstance, StandaloneFiles, StandaloneManifest, StandaloneOptions, StandaloneParts, StandaloneRuntime, ValidationIssue, ValidationResult };
```
