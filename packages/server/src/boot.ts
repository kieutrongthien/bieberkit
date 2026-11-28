/**
 * BieberKit
 *
 * @file        packages/server/src/boot.ts
 * @description Boots the process roles from one entry point: the config, the plugins, the database, and then web, worker, scheduler or migrate, or all of the first three in one process for development (section 7, section 7.2, ADR 0024).
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

import { join } from 'node:path';
import {
  authEntities,
  auditNetworkDenied,
  createAuthenticator,
  restrictedRoleLookup,
  securitySettings,
  createAuthorizer,
  createTenantResolver,
  registerAuthRoutes,
} from '@bieberkit/auth';
import type { ScopedPermission } from '@bieberkit/auth';
import { createContainer, createLifecycle, exitCode, loadEnv, parseRole, registerModule } from '@bieberkit/core';
import type { EnvSource, Role, SettingDef } from '@bieberkit/core';
import { compileEntities, createDatabase, createOutboxDispatcher } from '@bieberkit/data/orm';
import type { Database } from '@bieberkit/data/orm';
import { createHttpServer, registerEntityRoutes, registerMeta, registerOpenApi } from '@bieberkit/http';
import type { HttpServer, RouteDef } from '@bieberkit/http';
import { createScheduler, schedulesOf } from '@bieberkit/queue';
import type { JobDef, QueueSubscription } from '@bieberkit/queue';
import { pluginAdminOf } from './plugin-admin.ts';
import { registerClientReports } from './client-reports.ts';
import { ServerError } from './errors.ts';
import { parseTheme } from '@bieberkit/tokens';
import { adminDirectory, adminLocation, hasAdmin, registerAdmin, storageOrigin } from './admin.ts';
import { migrate } from './migrate.ts';
import { settingsOf, settingsPolicyReader } from './policy.ts';
import { createRuntimePlatform, permissionCatalog, registerRuntimeServices } from './services.ts';
import { runMigrations } from './migrations.ts';
import { allModules, contributed, contributedRecord, entitiesOf } from './modules.ts';
import { observe } from './observe.ts';
import { envOwnersOf, loadProject } from './project.ts';

/** `dev` is web, worker and scheduler in one process, with the tables made first (section 5.2). */
export type BootRole = Role | 'dev';

export interface BootOptions {
  readonly role: BootRole;
  /** The directory to start the search for the project from. Defaults to the working directory. */
  readonly cwd?: string;
  /** The variables to read. Without it, the real environment (core reads it, P8). A test gives its own. */
  readonly env?: EnvSource;
  /** Install the handlers of the process signals and of uncaught errors. For a real process, not for a test. */
  readonly process?: boolean;
}

export interface Running {
  readonly roles: readonly Role[];
  /** The port that the web role listens on. */
  readonly port: number | undefined;
  readonly metricsPort: number | undefined;
  readonly database: Database;
  /** Runs the shutdown of section 19.4 and answers the exit code: 0, or 1 after a timeout or a failed hook. */
  stop(): Promise<number>;
}

const ROLES_OF: Readonly<Record<BootRole, readonly Role[]>> = {
  web: ['web'],
  worker: ['worker'],
  scheduler: ['scheduler'],
  migrate: ['migrate'],
  dev: ['web', 'worker', 'scheduler'],
};

/** The role that a list of arguments names, or `dev`. */
export function roleOf(argv: readonly string[]): BootRole {
  return argv.includes('dev') || argv.includes('--role=dev') ? 'dev' : parseRole(argv);
}

/**
 * Steps 1 to 6 of section 7.2: the plugins are resolved, the environment is validated against the merged schema, the services are
 * registered, the modules boot in dependency order, the database connects, and then the role starts. Shutdown is the reverse.
 */
export async function boot(options: BootOptions): Promise<Running> {
  const roles = ROLES_OF[options.role];
  const project = await loadProject(options.cwd ?? process.cwd());
  const modules = await allModules(project);
  const { env, extra } = loadEnv({
    ...(options.env === undefined ? {} : { source: options.env }),
    envFile: join(project.root, '.env'),
    extra: envOwnersOf(project),
  });

  const { entities, extensions } = entitiesOf(modules);
  const schemas = compileEntities(entities, { extensions });
  const owners = envOwnersOf(project);
  const seen = await observe({
    role: options.role,
    env,
    extra,
    owners,
    entities,
    metricsServer: roles.some((role) => role !== 'migrate'),
    processHandlers: options.process === true,
  });
  const { logger, tracer, metrics, reporter } = seen;

  const lifecycle = createLifecycle();
  lifecycle.onShutdown('observability', () => seen.close());
  try {
    const db = await createDatabase(env, {
      entities: [...schemas, ...authEntities],
      audit: 'table',
      // The audit-log plugin copies each entry to the log after commit when it is asked to (AUD-07).
      auditMirror: extra['AUDIT_LOG_MIRROR'] === true,
      // The key ring of encrypted fields, such as secret settings (SEC-08, SET-03).
      encryption: {
        current: env.APP_KEY,
        ...(env.APP_KEY_PREVIOUS === undefined ? {} : { previous: [env.APP_KEY_PREVIOUS] }),
      },
      logger,
      tracer,
      metrics,
    });
    lifecycle.onShutdown('database', () => db.close());

    if (roles.includes('migrate') && env.APP_ENV === 'production') {
      // Production: the steps, then the files of the project, under the lock, on the connection of the migrate role (DATA-25).
      const done = await runMigrations({
        cwd: project.root,
        ...(options.env === undefined ? {} : { env: options.env }),
      });
      logger.info('the database is ready', { steps: done.steps.applied.length, migrations: done.migrations.length });
    } else if (options.role === 'dev' || roles.includes('migrate')) {
      const done = await migrate(db, env);
      logger.info('the database is ready', { steps: done.applied.length, statements: done.statements });
    }

    let port: number | undefined;
    let server: HttpServer | undefined;
    const platform = await createRuntimePlatform(env, {
      jobs: contributed<JobDef>(modules, 'jobs'),
      subscriptions: contributed<QueueSubscription>(modules, 'subscriptions'),
      db,
      logger,
      errorReporter: reporter,
      tracer,
      metrics,
    });
    const { queue } = platform;
    lifecycle.onShutdown('platform', () => platform.close());
    const container = createContainer();
    registerRuntimeServices(container, {
      project,
      env,
      extra,
      db,
      ...platform,
      permissions: permissionCatalog(project, modules),
      // The policies of the authenticator are declared by `@bieberkit/auth`, which is not a module (ADR 0031).
      settings: [...securitySettings, ...contributed<SettingDef>(modules, 'settings')],
    });
    for (const module of modules) registerModule(container, module);
    await container.boot();

    // A web role that would answer nothing at the address of the admin stops, and says what to do. In dev, Vite serves the admin.
    if (roles.includes('web') && options.role !== 'dev' && hasAdmin(project.root) && !adminDirectory(project.root)) {
      throw new ServerError('The project has an admin in apps/admin, and it is not built.', {
        code: 'BK_ADMIN_NOT_BUILT',
        fix: 'Run bieberkit build before bieberkit start web, or bieberkit dev, which serves the admin from its source.',
      });
    }

    if (roles.includes('web')) {
      const scoped = contributedRecord<ScopedPermission>(modules, 'scopedPermissions');
      const authorizer = createAuthorizer({ db, entities, schemas, scoped });
      // Sign in with Better Auth under /api/auth, and the session cookie that gives a request its principal (AUTH-01, AUTH-09).
      const { auth } = container.services;
      server = createHttpServer(env, {
        logger,
        tracer,
        metrics,
        errorReporter: reporter,
        authorizer,
        services: container.services,
        authenticator: createAuthenticator(auth, {
          policy: settingsPolicyReader(settingsOf(container.services)),
          restricted: restrictedRoleLookup(db),
          onDenied: auditNetworkDenied(db),
        }),
        tenantResolver: createTenantResolver({ db }),
      });
      authorizer.install(server);
      registerAuthRoutes(server, { auth, db });
      registerEntityRoutes(server, schemas, { db });
      // What the admin reads to draw its menu, its lists and its forms (UI-02).
      // What the plugins add to the admin: read and checked here, shown by `_meta`, served by `registerAdmin` (UI-04).
      const pluginAdmin = pluginAdminOf(project);
      registerMeta(server, entities, {
        extensions: pluginAdmin.extensions,
        permissions: permissionCatalog(project, modules),
      });
      // What the admin tells about itself: its errors and its Core Web Vitals (UI-21).
      registerClientReports(server, { reporter, metrics });
      for (const route of contributed<RouteDef>(modules, 'routes')) server.route(route);
      registerOpenApi(server, { title: project.config.name, version: '0.0.0' });
      registerAdmin(
        server,
        project.root,
        adminLocation(env.APP_URL, env.ADMIN_URL),
        parseTheme(project.config.theme),
        // The hashed files of the releases before stay for a day, so a tab that is open at a deploy keeps working (UI-22).
        env.ADMIN_ASSETS_DIR ?? join(project.root, 'data', 'admin-assets'),
        // A file goes from the browser to the bucket with a signed URL, so the policy of the admin names that origin (ADR 0036).
        storageOrigin(env),
        pluginAdmin.folders,
        project.config.admin,
      );
      const web = server;
      lifecycle.onBoot('http', async () => {
        port = (await web.listen({ port: env.APP_PORT })).port;
        web.markReady();
      });
      lifecycle.onShutdown('http', async () => {
        // Section 19.4: ready says 503 while the requests that run are finished, and a timeout is a failure of the hook.
        // Behind a load balancer the pause lets it see the 503. A developer's machine has none, so it does not wait (section 19.4).
        if ((await web.stop({ drainMs: env.APP_ENV === 'production' ? 5_000 : 0 })).timedOut) {
          throw new ServerError('Requests were still running when the shutdown timeout passed.', {
            code: 'BK_SHUTDOWN_TIMEOUT',
            fix: 'Find the request that does not finish.',
          });
        }
      });
    }

    if (roles.includes('worker')) {
      const worker = queue.createWorker();
      const dispatcher = createOutboxDispatcher(db, { publisher: queue.publisher, logger });
      lifecycle.onBoot('worker', () => {
        worker.start();
        dispatcher.start();
      });
      lifecycle.onShutdown('worker', async () => {
        await dispatcher.stop();
        await worker.stop();
      });
    }

    if (roles.includes('scheduler')) {
      // The schedules of the modules, ticked under the lock of Q-07, so only one scheduler runs each tick.
      const scheduler = await createScheduler(queue, schedulesOf(modules), { db });
      lifecycle.onBoot('scheduler', () => scheduler.start());
      lifecycle.onShutdown('scheduler', () => scheduler.stop());
    }

    try {
      await lifecycle.boot();
    } catch (error) {
      await lifecycle.stop();
      throw new ServerError(`The process did not start: ${error instanceof Error ? error.message : String(error)}`, {
        code: 'BK_BOOT_FAILED',
        fix: 'Read the line above in the log. The database, Valkey and the port must be reachable (bieberkit doctor).',
        cause: error,
      });
    }
    logger.info('ready', { roles, port });

    return {
      roles,
      port,
      metricsPort: seen.metricsPort,
      database: db,
      stop: async () => exitCode(await lifecycle.stop()),
    };
  } catch (error) {
    await lifecycle.stop();
    throw error;
  }
}
