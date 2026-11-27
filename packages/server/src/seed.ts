/**
 * BieberKit
 *
 * @file        packages/server/src/seed.ts
 * @description Runs the seeders of the project: the seed function of each plugin in boot order, then the seed of the project itself, each idempotent (section 5.2, section 6, step 10).
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

import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { createContainer, createLogger, loadEnv, registerModule } from '@bieberkit/core';
import type { JobDef, QueueSubscription } from '@bieberkit/queue';
import type { EnvSource, ServiceRegistry, SettingDef } from '@bieberkit/core';
import { createDatabase, compileEntities } from '@bieberkit/data/orm';
import type { EntityDef } from '@bieberkit/data';
import { authEntities } from '@bieberkit/auth';
import { allModules, contributed } from './modules.ts';
import { createRuntimePlatform, permissionCatalog, registerRuntimeServices } from './services.ts';
import { envOwnersOf, importFile, loadProject } from './project.ts';
import { ServerError } from './errors.ts';

export interface SeedOptions {
  readonly cwd?: string;
  readonly env?: EnvSource;
}

export interface Seeded {
  /** The seeders that ran, in order: the plugins by name, then `project`. */
  readonly ran: readonly string[];
}

/** The seed of the project: `apps/server/src/seed.ts`, whose default export is a function of the services. */
const PROJECT_SEED = 'apps/server/src/seed.ts';

/**
 * Boots the container over the database, without any role, and runs the seeders. A seeder must be idempotent: running it twice leaves
 * the data as running it once does.
 */
export async function seed(options: SeedOptions = {}): Promise<Seeded> {
  const project = await loadProject(options.cwd ?? process.cwd());
  const modules = await allModules(project);
  const { env, extra } = loadEnv({
    ...(options.env === undefined ? {} : { source: options.env }),
    envFile: join(project.root, '.env'),
    extra: envOwnersOf(project),
  });
  const entities = contributed<EntityDef<string>>(modules, 'entities');
  const db = await createDatabase(env, {
    entities: [...compileEntities(entities), ...authEntities],
    audit: 'table',
    auditMirror: extra['AUDIT_LOG_MIRROR'] === true,
    encryption: {
      current: env.APP_KEY,
      ...(env.APP_KEY_PREVIOUS === undefined ? {} : { previous: [env.APP_KEY_PREVIOUS] }),
    },
  });
  let platform: Awaited<ReturnType<typeof createRuntimePlatform>> | undefined;
  let result: Seeded;
  try {
    platform = await createRuntimePlatform(env, {
      jobs: contributed<JobDef>(modules, 'jobs'),
      subscriptions: contributed<QueueSubscription>(modules, 'subscriptions'),
      db,
      logger: createLogger({ level: env.LOG_LEVEL, role: 'migrate' }),
    });
    const container = createContainer();
    registerRuntimeServices(container, {
      env,
      extra,
      db,
      ...platform,
      permissions: permissionCatalog(project, modules),
      settings: contributed<SettingDef>(modules, 'settings'),
    });
    for (const module of modules) registerModule(container, module);
    await container.boot();
    const services: ServiceRegistry = container.services;
    const ran: string[] = [];
    for (const { def } of project.plugins) {
      if (def.seed === undefined) continue;
      await def.seed(services);
      ran.push(def.name);
    }
    const file = join(project.root, PROJECT_SEED);
    if (existsSync(file)) {
      const exported = await importFile(file);
      if (typeof exported !== 'function') {
        throw new ServerError(`${PROJECT_SEED} does not export a function as its default export.`, {
          code: 'BK_SEED_NOT_EXPORTED',
          fix: 'The file is `export default async function seed(services) { ... }`.',
        });
      }
      await exported(services);
      ran.push('project');
    }
    result = { ran };
  } catch (error) {
    await Promise.allSettled([platform?.close(), db.close()]);
    throw error;
  }
  try {
    await platform.close();
  } finally {
    await db.close();
  }
  return result;
}
