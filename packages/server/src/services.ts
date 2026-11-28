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
import type { Container, CoreEnv, Logger, ModuleDef, SettingDef } from '@bieberkit/core';
import type { Cache } from '@bieberkit/cache';
import { createCacheFromConfig } from '@bieberkit/cache/bentocache';
import { MAIL_JOB, parseSender } from '@bieberkit/mail';
import type { Mail } from '@bieberkit/mail';
import { createMailerFromConfig } from '@bieberkit/mail/nodemailer';
import { applySubscriptions } from '@bieberkit/queue';
import type { Queue, QueueSubscription } from '@bieberkit/queue';
import { createQueueFromConfig } from '@bieberkit/queue/redis';
import type { QueueFromConfigOptions } from '@bieberkit/queue/redis';
import type { Database } from '@bieberkit/data/orm';
import type { RouteDef } from '@bieberkit/http';
import type { Storage } from '@bieberkit/storage';
import { createStorageFromConfig } from '@bieberkit/storage/flydrive';
import { adminLocation, hasAdmin } from './admin.ts';
import { authMessages } from './auth-mail.ts';
import { settingsOf, settingsPolicyReader } from './policy.ts';
import { contributed, contributedRecord, entitiesOf } from './modules.ts';
import type { Project } from './project.ts';

/** Every permission that the project knows: its entities, its routes, its plugins and its scoped permissions, sorted and without repeats. */
export function permissionCatalog(project: Pick<Project, 'plugins'>, modules: readonly ModuleDef[]): string[] {
  const all = new Set<string>();
  for (const entry of buildPermissionRegistry(entitiesOf(modules).entities).entries) all.add(entry.permission);
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
  options: QueueFromConfigOptions & { readonly logger: Logger; readonly subscriptions?: readonly QueueSubscription[] },
): Promise<RuntimePlatform> {
  const acquired: (() => Promise<void>)[] = [];
  try {
    const mailer = createMailerFromConfig(env, options);
    acquired.push(() => mailer.close());
    const cache = createCacheFromConfig(env, options);
    acquired.push(() => cache.close());
    const queue = await createQueueFromConfig(env, { ...options, jobs: [...options.jobs, mailer.job] });
    acquired.push(() => queue.close());
    queue.subscribe(MAIL_JOB, mailer.job);
    applySubscriptions(queue, options.subscriptions ?? []);
    return {
      mail: mailer.over(queue),
      queue,
      cache,
      close: async () => {
        const results = await Promise.allSettled(acquired.toReversed().map((close) => close()));
        const rejected = results.find((result) => result.status === 'rejected');
        if (rejected?.status === 'rejected') throw rejected.reason;
      },
    };
  } catch (error) {
    await Promise.allSettled(acquired.toReversed().map((close) => close()));
    throw error;
  }
}

/**
 * What the authentication takes from the project: the name that an authenticator app shows, the one of the brand or the one of the
 * config (AUTH-03), and when the project has an admin, its reset page for the password links (USR-10).
 */
function authOfProject(project: Pick<Project, 'root' | 'config'>, env: Pick<CoreEnv, 'APP_URL' | 'ADMIN_URL'>) {
  const admin = adminLocation(env.APP_URL, env.ADMIN_URL);
  return {
    // The second factor is always there: a person who does not set it up sees no difference, and a role or a policy can ask for it.
    methods: { totp: { issuer: project.config.admin?.brand?.name ?? project.config.name } },
    // The admin may have a host of its own, and a sign in from there is not a cross site request (UI-14).
    trustedOrigins: [admin.origin],
    ...(!hasAdmin(project.root) ? {} : { pages: { resetPassword: `${admin.origin}${admin.prefix}/reset-password` } }),
  };
}

/** Registers framework services before the modules, including mail, queue and cache for every role. */

export function registerRuntimeServices(
  container: Container,
  input: {
    project: Pick<Project, 'root' | 'config'>;
    env: CoreEnv;
    extra: Readonly<Record<string, unknown>>;
    db: Database;
    permissions: readonly string[];
    /** The `settings` contributions of the modules (SET-01). */
    settings: readonly SettingDef[];
    mail: Mail;
    queue: Queue;
    cache: Cache;
  },
): void {
  const { project, env, extra, db, permissions, settings, mail, queue, cache } = input;
  container.register('mail', { scope: 'singleton', create: () => mail });
  container.register('queue', { scope: 'singleton', create: () => queue });
  container.register('cache', { scope: 'singleton', create: () => cache });
  container.register('config', { scope: 'singleton', create: () => env });
  container.register('pluginEnv', { scope: 'singleton', create: () => extra });
  container.register('storage', { scope: 'singleton', create: (): Storage => createStorageFromConfig(env) });
  container.register('permissions', { scope: 'singleton', create: () => permissions });
  container.register('settingDeclarations', { scope: 'singleton', create: () => settings });
  container.register('database', { scope: 'singleton', create: () => db });
  container.register('auth', {
    scope: 'singleton',
    deps: ['mail'],
    create: (services) =>
      createAuth({
        db,
        policy: settingsPolicyReader(settingsOf(services)),
        dialect: db.dialect,
        secret: env.AUTH_SECRET,
        baseUrl: env.APP_URL,
        mail: authMessages(services.mail, parseSender(env.MAIL_FROM)),
        ...authOfProject(project, env),
        ...(env.APP_KEY_PREVIOUS === undefined ? {} : { previousSecrets: [env.APP_KEY_PREVIOUS] }),
      }),
  });
}
