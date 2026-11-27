<!--
  BieberKit

  @file        packages/server/api/index.api.md
  @description API report of @bieberkit/server: its public surface, checked in CI and reviewed in pull requests.
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

# API report: @bieberkit/server

Generated from the built declaration files by `pnpm api:update`. Do not edit by hand. A change here is a change to the public API and needs a changeset (spec section 22.3).

```ts
import { AuditPrune, Database, MadeMigration, PluginRun } from "@bieberkit/data/orm";
import { BkError, CoreEnv, EnvSource, ModuleDef, Role } from "@bieberkit/core";
import { ExtensionRef, PluginMigrationStep, ResolvedEntities } from "@bieberkit/data";
import { HttpServer } from "@bieberkit/http";
import { Theme } from "@bieberkit/tokens";
import { a as envOwnersOf, c as loadConfig, i as ProjectConfig, l as loadProject, n as LoadedPlugin, o as findProjectRoot, r as Project, s as importFile, t as CONFIG_FILE, u as COLLECTORS } from "./project-CQtj2qHf.js";
export declare const ADMIN_PACKAGE = "@bieberkit/admin-antd";
export declare const ADMIN_PREFIX = "/admin";
interface AdminLocation {
  readonly origin: string;
  readonly host: string | undefined;
  readonly prefix: string;
}
export declare function adminLocation(appUrl: string, adminUrl: string | undefined): AdminLocation;
export declare const ADMIN_POLICY: string;
export declare function adminDirectory(root: string): string | undefined;
export declare function registerAdmin(server: HttpServer, root: string, location: AdminLocation, theme?: Theme, retained?: string, storage?: string): boolean;
type BootRole = Role | "dev";
interface BootOptions {
  readonly role: BootRole;
  readonly cwd?: string;
  readonly env?: EnvSource;
  readonly process?: boolean;
}
interface Running {
  readonly roles: readonly Role[];
  readonly port: number | undefined;
  readonly metricsPort: number | undefined;
  readonly database: Database;
  stop(): Promise<number>;
}
export declare function roleOf(argv: readonly string[]): BootRole;
export declare function boot(options: BootOptions): Promise<Running>;
interface Finding {
  readonly id: string;
  readonly level: "ok" | "warning" | "error";
  readonly message: string;
  readonly fix?: string;
}
interface DoctorOptions {
  readonly cwd?: string;
  readonly env?: EnvSource;
}
export declare function diagnose(options?: DoctorOptions): Promise<Finding[]>;
export declare function main(argv?: readonly string[]): Promise<number>;
interface Migrated {
  readonly applied: readonly string[];
  readonly statements: number;
}
export declare function migrate(db: Database, env: Pick<CoreEnv, "APP_ENV" | "QUEUE_DRIVER"> & {
  readonly DEPLOY_ID?: string | undefined;
}): Promise<Migrated>;
export declare const MIGRATIONS_DIR = "migrations";
interface MigrationsOptions {
  readonly cwd?: string;
  readonly env?: EnvSource;
  readonly deployId?: string;
}
export declare function stepsOf(env: Pick<CoreEnv, "QUEUE_DRIVER">, pluginSteps: readonly PluginMigrationStep[], plugins: readonly string[]): {
  steps: PluginMigrationStep[];
  order: string[];
};
export declare function makeMigration(options: MigrationsOptions & {
  readonly name?: string;
}): Promise<MadeMigration | null>;
interface RunMigrationsOptions extends MigrationsOptions {
  readonly allowDestructive?: boolean;
}
interface MigrationsRun {
  readonly steps: PluginRun;
  readonly migrations: readonly string[];
}
export declare function runMigrations(options?: RunMigrationsOptions): Promise<MigrationsRun>;
export declare function rollbackMigration(options?: MigrationsOptions): Promise<string[]>;
interface MigrationsStatus {
  readonly executed: readonly string[];
  readonly pending: readonly string[];
  readonly steps: {
    readonly applied: readonly string[];
    readonly pending: readonly string[];
  };
}
export declare function migrationStatus(options?: MigrationsOptions): Promise<MigrationsStatus>;
interface PruneAuditOptions extends MigrationsOptions {
  readonly before: Date;
  readonly apply: boolean;
}
export declare function pruneAudit(options: PruneAuditOptions): Promise<AuditPrune>;
interface SeedOptions {
  readonly cwd?: string;
  readonly env?: EnvSource;
}
interface Seeded {
  readonly ran: readonly string[];
}
export declare function seed(options?: SeedOptions): Promise<Seeded>;
export declare class ServerError extends BkError {}
export declare const MODULES_DIR = "apps/server/src/modules";
export declare function projectModules(root: string): Promise<ModuleDef[]>;
export declare function allModules(project: Project): Promise<ModuleDef[]>;
export declare function contributed<T>(modules: readonly ModuleDef[], key: string): T[];
export declare function contributedRecord<T>(modules: readonly ModuleDef[], key: string): Record<string, T>;
export declare function extensionRefsOf(modules: readonly ModuleDef[]): ExtensionRef[];
export declare function entitiesOf(modules: readonly ModuleDef[]): ResolvedEntities;
export declare const packageName = "@bieberkit/server";
export { type AdminLocation, type BootOptions, type BootRole, COLLECTORS, CONFIG_FILE, type DoctorOptions, type Finding, type LoadedPlugin, type Migrated, type MigrationsOptions, type MigrationsRun, type MigrationsStatus, type Project, type ProjectConfig, type PruneAuditOptions, type RunMigrationsOptions, type Running, type SeedOptions, type Seeded, envOwnersOf, findProjectRoot, importFile, loadConfig, loadProject };
```
