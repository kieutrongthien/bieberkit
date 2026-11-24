/**
 * BieberKit
 *
 * @file        packages/server/src/services.ts
 * @description The services that the server registers for every role: the validated config, the database and Better Auth, so that a plugin reads them from the container and never builds its own (P8, CORE-07).
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

import { buildPermissionRegistry, createAuth } from '@bieberkit/auth';
import type { Container, CoreEnv, Logger, ModuleDef } from '@bieberkit/core';
import type { Cache } from '@bieberkit/cache';
import { createCacheFromConfig } from '@bieberkit/cache/bentocache';
import type { Mail } from '@bieberkit/mail';
import { createMailerFromConfig } from '@bieberkit/mail/nodemailer';
import type { Queue } from '@bieberkit/queue';
import { createQueueFromConfig } from '@bieberkit/queue/redis';
import type { QueueFromConfigOptions } from '@bieberkit/queue/redis';
import type { EntityDef } from '@bieberkit/data';
import type { Database } from '@bieberkit/data/orm';
import type { RouteDef } from '@bieberkit/http';
import type { Storage } from '@bieberkit/storage';
import { createStorageFromConfig } from '@bieberkit/storage/flydrive';
import { adminLocation } from './admin.ts';
import { authMessages } from './auth-mail.ts';
import { contributed, contributedRecord } from './modules.ts';
import type { Project } from './project.ts';

/** Every permission that the project knows: its entities, its routes, its plugins and its scoped permissions, sorted and without repeats. */
export function permissionCatalog(project: Pick<Project, 'plugins'>, modules: readonly ModuleDef[]): string[] {
  const all = new Set<string>();
  for (const entry of buildPermissionRegistry(contributed<EntityDef<string>>(modules, 'entities')).entries)
    all.add(entry.permission);
  for (const route of contributed<RouteDef>(modules, 'routes'))
    if (route.permission !== undefined) all.add(route.permission);
  for (const { def } of project.plugins) for (const permission of def.permissions) all.add(permission);
  for (const module of modules)
    for (const name of Object.keys(contributedRecord<unknown>([module], 'scopedPermissions'))) all.add(name);
  return [...all].toSorted((a, b) => a.localeCompare(b));
}

interface RuntimePlatform {
  readonly mail: Mail;
  readonly queue: Queue;
  readonly cache: Cache;
  close(): Promise<void>;
}

/** The platform shared by process boot and seeders, with one owner for its resources. */
export async function createRuntimePlatform(
  env: CoreEnv,
  options: QueueFromConfigOptions & { readonly logger: Logger },
): Promise<RuntimePlatform> {
  const mailer = createMailerFromConfig(env, options);
  const cache = createCacheFromConfig(env, options);
  try {
    const queue = await createQueueFromConfig(env, { ...options, jobs: [...options.jobs, mailer.job] });
    return {
      mail: mailer.over(queue),
      queue,
      cache,
      close: async () => {
        await Promise.all([queue.close(), mailer.close(), cache.close()]);
      },
    };
  } catch (error) {
    await Promise.allSettled([mailer.close(), cache.close()]);
    throw error;
  }
}

/** Registers framework services before the modules, including mail, queue and cache for every role. */

export function registerRuntimeServices(
  container: Container,
  input: {
    env: CoreEnv;
    extra: Readonly<Record<string, unknown>>;
    db: Database;
    permissions: readonly string[];
    mail: Mail;
    queue: Queue;
    cache: Cache;
  },
): void {
  const { env, extra, db, permissions, mail, queue, cache } = input;
  container.register('mail', { scope: 'singleton', create: () => mail });
  container.register('queue', { scope: 'singleton', create: () => queue });
  container.register('cache', { scope: 'singleton', create: () => cache });
  container.register('config', { scope: 'singleton', create: () => env });
  container.register('pluginEnv', { scope: 'singleton', create: () => extra });
  container.register('storage', { scope: 'singleton', create: (): Storage => createStorageFromConfig(env) });
  container.register('permissions', { scope: 'singleton', create: () => permissions });
  container.register('database', { scope: 'singleton', create: () => db });
  container.register('auth', {
    scope: 'singleton',
    deps: ['mail'],
    create: (services) =>
      createAuth({
        db,
        dialect: db.dialect,
        secret: env.AUTH_SECRET,
        baseUrl: env.APP_URL,
        mail: authMessages(services.mail),
        // The admin may have a host of its own, and a sign in from there is not a cross site request (UI-14).
        trustedOrigins: [adminLocation(env.APP_URL, env.ADMIN_URL).origin],
        ...(env.APP_KEY_PREVIOUS === undefined ? {} : { previousSecrets: [env.APP_KEY_PREVIOUS] }),
      }),
  });
}
