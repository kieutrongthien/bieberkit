/**
 * BieberKit
 *
 * @file        packages/server/src/index.ts
 * @description Public API of @bieberkit/server: finding a project and booting its process roles (section 7, ADR 0024).
 * @author      Bieber Kieu <kieutrongthien@gmail.com>
 * @copyright   Copyright (c) 2026 Bieber Kieu
 * @license     Apache-2.0
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 *
 * SPDX-License-Identifier: Apache-2.0
 */

/** npm name of this package. */
export const packageName = '@bieberkit/server';

export {
  ADMIN_PACKAGE,
  ADMIN_POLICY,
  ADMIN_PREFIX,
  adminDirectory,
  adminLocation,
  adminPageOf,
  registerAdmin,
} from './admin.ts';
export type { AdminLocation } from './admin.ts';
export { boot, roleOf } from './boot.ts';
export type { BootOptions, BootRole, Running } from './boot.ts';
export { diagnose } from './doctor.ts';
export type { DoctorOptions, Finding } from './doctor.ts';
export { main } from './main.ts';
export { migrate } from './migrate.ts';
export {
  makeMigration,
  MIGRATIONS_DIR,
  migrationStatus,
  pruneAudit,
  rollbackMigration,
  runMigrations,
  stepsOf,
} from './migrations.ts';
export type {
  MigrationsOptions,
  MigrationsRun,
  MigrationsStatus,
  PruneAuditOptions,
  RunMigrationsOptions,
} from './migrations.ts';
export type { Migrated } from './migrate.ts';
export { seed } from './seed.ts';
export type { SeedOptions, Seeded } from './seed.ts';
export { ServerError } from './errors.ts';
export { COLLECTORS } from './manifest.ts';
export {
  allModules,
  contributed,
  contributedRecord,
  entitiesOf,
  extensionRefsOf,
  MODULES_DIR,
  projectModules,
} from './modules.ts';
export { CONFIG_FILE, envOwnersOf, findProjectRoot, importFile, loadConfig, loadProject } from './project.ts';
export type { LoadedPlugin, Project, ProjectConfig } from './project.ts';
