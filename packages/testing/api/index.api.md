<!--
  BieberKit

  @file        packages/testing/api/index.api.md
  @description API report of @bieberkit/testing: its public surface, checked in CI and reviewed in pull requests.
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

# API report: @bieberkit/testing

Generated from the built declaration files by `pnpm api:update`. Do not edit by hand. A change here is a change to the public API and needs a changeset (spec section 22.3).

```ts
import { AccessAuthorizer } from "@bieberkit/auth";
import { ApiField } from "@bieberkit/data/schema";
import { BkError, Dialect, LogFields, Logger, ModuleDef, ServiceRegistry } from "@bieberkit/core";
import { Database, DatabaseOptions, OrmSchema } from "@bieberkit/data/orm";
import { EntityDef } from "@bieberkit/data";
import { HttpServer } from "@bieberkit/http";
import { MemoryDisk } from "@bieberkit/storage";
import { Queue } from "@bieberkit/queue";
interface Reply {
  readonly status: number;
  readonly headers: Readonly<Record<string, string | string[] | number | undefined>>;
  readonly body: Readonly<Record<string, unknown>>;
}
interface Client {
  get(url: string, headers?: Record<string, string>): Promise<Reply>;
  post(url: string, payload?: object, headers?: Record<string, string>): Promise<Reply>;
  patch(url: string, payload: object, version: number, headers?: Record<string, string>): Promise<Reply>;
  delete(url: string, version: number, headers?: Record<string, string>): Promise<Reply>;
}
export declare const USER_HEADER = "x-test-user";
export declare const TENANT_HEADER = "x-test-tenant";
export declare function createClient(server: HttpServer, userId: string | undefined, tenant: () => string): Client;
declare module "vitest" {
  interface ProvidedContext {
    dialectUrls: {
      postgres: string;
      mysql: string;
      require: string;
    };
  }
}
type OpenDatabase = (entities: readonly OrmSchema[], options?: Pick<DatabaseOptions, "queryLog">) => Promise<Database>;
interface DialectContext {
  readonly dialect: Dialect;
  readonly open: OpenDatabase;
}
export declare const openMemoryDatabase: OpenDatabase;
export declare function describeDialects(name: string, suite: (context: DialectContext) => void): void;
type Overrides = Readonly<Record<string, unknown>>;
interface Factory {
  build(overrides?: Overrides): Record<string, unknown>;
  create(overrides?: Overrides): Promise<Record<string, unknown>>;
  createMany(count: number, overrides?: Overrides): Promise<Record<string, unknown>[]>;
}
interface FactoryContext {
  readonly db: Database;
  readonly schemas: readonly OrmSchema[];
  readonly tenant: () => string;
  readonly next: (entity: string) => number;
  readonly factoryOf: (entity: EntityDef<string>) => Factory;
}
export declare function createFactory(entity: EntityDef<string>, context: FactoryContext): Factory;
interface LoggedLine {
  readonly level: string;
  readonly message: string;
  readonly fields: LogFields;
}
interface MemoryLogger extends Logger {
  readonly lines: readonly LoggedLine[];
}
export declare function createMemoryLogger(bindings?: LogFields, lines?: LoggedLine[]): MemoryLogger;
interface TestUser {
  readonly id: string;
}
interface TestAppOptions {
  readonly modules?: readonly ModuleDef[];
  readonly entities?: readonly EntityDef<string>[];
  readonly roles?: Readonly<Record<string, readonly string[]>>;
  readonly open?: OpenDatabase;
  readonly tenant?: string;
  readonly pluginEnv?: Readonly<Record<string, unknown>>;
}
interface TestApp {
  readonly db: Database;
  readonly server: HttpServer;
  readonly queue: Queue;
  readonly schemas: readonly OrmSchema[];
  readonly entities: readonly EntityDef<string>[];
  readonly authorizer: AccessAuthorizer;
  readonly services: ServiceRegistry;
  readonly disk: MemoryDisk;
  readonly logger: MemoryLogger;
  readonly tenant: string;
  newUser(): TestUser;
  actingAs(user: TestUser | string, roles?: readonly string[]): Promise<Client>;
  anonymous(): Client;
  withTenant(tenant: string): TestApp;
  factory(entity: EntityDef<string>): Factory;
  close(): Promise<void>;
}
export declare function createTestApp(options?: TestAppOptions): Promise<TestApp>;
interface InvalidCase {
  readonly name: string;
  readonly field: string;
  readonly key: string;
  readonly change: {
    readonly omit: true;
  } | {
    readonly value: unknown;
  };
}
export declare function invalidCasesOf(field: ApiField): InvalidCase[];
interface PageCase {
  readonly name: string;
  readonly query: string;
  readonly code: string;
}
export declare const REFUSED_PAGES: readonly PageCase[];
interface EntityContractOptions {
  readonly modules: readonly ModuleDef[];
  readonly open?: OpenDatabase;
  readonly values?: Readonly<Record<string, Readonly<Record<string, unknown>>>>;
  readonly only?: readonly string[];
}
export declare function describeEntityContracts(options: EntityContractOptions): void;
export declare class TestingError extends BkError {}
interface NetworkGuardOptions {
  readonly allow?: readonly string[];
}
export declare function isLocalHost(host: string): boolean;
export declare function installNetworkGuard(options?: NetworkGuardOptions): () => void;
export declare function sampleOf(entity: string, field: ApiField, n: number): unknown;
export declare const packageName = "@bieberkit/testing";
export type { Client, DialectContext, EntityContractOptions, Factory, FactoryContext, InvalidCase, LoggedLine, MemoryLogger, NetworkGuardOptions, OpenDatabase, Overrides, PageCase, Reply, TestApp, TestAppOptions, TestUser };
```
