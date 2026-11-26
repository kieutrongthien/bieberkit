/**
 * BieberKit
 *
 * @file        packages/testing/src/app.ts
 * @description The test app: the modules booted over a database with their entities, routes, jobs and conditions, and callers that act as a user with roles in a tenant (TST-02).
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

import { createAuth, createAuthorizer, assignRole, buildPermissionRegistry, createRole } from '@bieberkit/auth';
import type { AccessAuthorizer, ScopedPermission } from '@bieberkit/auth';
import { createContainer, loadEnv, registerModule } from '@bieberkit/core';
import type { ModuleDef, ServiceRegistry, SettingDef } from '@bieberkit/core';
import { uuid7 } from '@bieberkit/data';
import type { EntityDef } from '@bieberkit/data';
import { compileEntities, createOutboxDispatcher, currentEntityManager, emitEvent } from '@bieberkit/data/orm';
import { createCache, createMemoryEngine } from '@bieberkit/cache';
import { createMailer, createMemoryTransport, MAIL_JOB, prepareMessage } from '@bieberkit/mail';
import type { Message, PreparedMessage } from '@bieberkit/mail';
import type { Database, OrmSchema } from '@bieberkit/data/orm';
import { createHttpServer, registerEntityRoutes } from '@bieberkit/http';
import type { HttpServer, Principal, RouteDef } from '@bieberkit/http';
import { applySubscriptions, createQueue } from '@bieberkit/queue';
import { createMemoryDisk, createStorage } from '@bieberkit/storage';
import type { MemoryDisk, MemoryDiskOptions } from '@bieberkit/storage';
import type { JobDef, Queue, QueueSubscription } from '@bieberkit/queue';
import { createClient, TENANT_HEADER, USER_HEADER } from './client.ts';
import type { Client } from './client.ts';
import { openMemoryDatabase } from './database.ts';
import type { OpenDatabase } from './database.ts';
import { testingError } from './errors.ts';
import { createFactory } from './factory.ts';
import type { Factory } from './factory.ts';
import { createMemoryLogger } from './logger.ts';
import type { MemoryLogger } from './logger.ts';

/** A user of a test. `newUser()` makes one, and a string is the id of one. */
export interface TestUser {
  readonly id: string;
}

export interface TestAppOptions {
  /** The modules under test. Their entities, routes, jobs and conditions are booted. */
  readonly modules?: readonly ModuleDef[];
  /** Entities that no module declares, for a test that needs one more. */
  readonly entities?: readonly EntityDef<string>[];
  /**
   * The roles that `actingAs` can give, by name, with their permissions. `admin` always exists and has every permission that the entities
   * declare. A role is made in a tenant the first time that a caller of the tenant needs it.
   */
  readonly roles?: Readonly<Record<string, readonly string[]>>;
  /** Makes the database. Defaults to SQLite in memory. A suite on every dialect gives the `open` of `describeDialects`. */
  readonly open?: OpenDatabase;
  /** The tenant of callers and factories until `withTenant` says another. A new one by default. */
  readonly tenant?: string;
  /** The values of the env keys that plugins declare, for the services of the app. */
  readonly pluginEnv?: Readonly<Record<string, unknown>>;
  /** The options of the memory disk behind `storage`. Defaults to a disk that signs URLs and has no public URL. */
  readonly disk?: MemoryDiskOptions;
}

export interface TestApp {
  readonly db: Database;
  readonly server: HttpServer;
  /** The queue of the modules' jobs. It runs a job when it is dispatched (the `sync` driver). */
  readonly queue: Queue;
  /** Messages sent by the in-memory mailer, shared by the tenant views. */
  readonly mailbox: readonly PreparedMessage[];
  /** Dispatches one committed outbox batch and returns the number of rows claimed. */
  runOutbox(): Promise<number>;
  readonly schemas: readonly OrmSchema[];
  readonly entities: readonly EntityDef<string>[];
  readonly authorizer: AccessAuthorizer;
  /** The services of the app: `config`, `pluginEnv`, `database`, `auth`, `mail`, `queue`, `cache`, and what the modules registered. The seeds of plugins take them. */
  readonly services: ServiceRegistry;
  /** The disk behind the `storage` service. A test sends the bytes of a signed upload to it. */
  readonly disk: MemoryDisk;
  /** What the app logged, so a test can read it and the run stays quiet. */
  readonly logger: MemoryLogger;
  /** The tenant that this view of the app acts in. */
  readonly tenant: string;
  /** A user that has no roles yet. */
  newUser(): TestUser;
  /**
   * A caller that acts as `user` in the tenant of this view, with `roles` (names from `options.roles`, or `admin`). Without roles the user
   * can do nothing that needs a permission. Calling it again with other roles gives the user those as well.
   */
  actingAs(user: TestUser | string, roles?: readonly string[]): Promise<Client>;
  /** A caller with no principal. */
  anonymous(): Client;
  /** The same app, with callers and factories in `tenant`. Roles and rows of another tenant stay out of sight. */
  withTenant(tenant: string): TestApp;
  /** Makes rows of `entity`, valid for it, in the tenant of this view. */
  factory(entity: EntityDef<string>): Factory;
  /** Closes the server, platform services and database. */
  close(): Promise<void>;
}

const first = (value: string | string[] | undefined): string | undefined => (Array.isArray(value) ? value[0] : value);

function contributed<T>(modules: readonly ModuleDef[], key: string): T[] {
  return modules.flatMap((module) => {
    const value: unknown = module.contributions[key];
    // A module that declares the key gives a list of the type that the package of the key declared.
    // oxlint-disable-next-line typescript/no-unsafe-type-assertion
    return Array.isArray(value) ? (value as T[]) : [];
  });
}

/** Boots the modules over a fresh database, so a test calls the API as a user would (TST-02). */
export async function createTestApp(options: TestAppOptions = {}): Promise<TestApp> {
  const modules = options.modules ?? [];
  const byName = new Map<string, EntityDef<string>>();
  for (const entity of [...contributed<EntityDef<string>>(modules, 'entities'), ...(options.entities ?? [])])
    byName.set(entity.name, entity);
  const entities = [...byName.values()];
  const schemas = compileEntities(entities);
  const db = await (options.open ?? openMemoryDatabase)(schemas);
  const acquired: (() => Promise<unknown>)[] = [() => db.close()];
  try {
    const scoped: Record<string, ScopedPermission> = {};
    for (const module of modules) {
      const found: unknown = module.contributions['scopedPermissions'];
      if (typeof found === 'object' && found !== null) Object.assign(scoped, found);
    }
    const authorizer = createAuthorizer({ db, entities, schemas, scoped });
    const logger = createMemoryLogger();
    const registry = buildPermissionRegistry(entities);
    const everything = [
      ...new Set([
        ...registry.entries.map((entry) => entry.permission),
        ...contributed<RouteDef>(modules, 'routes').flatMap((route) =>
          route.permission === undefined ? [] : [route.permission],
        ),
      ]),
    ];
    const { env } = loadEnv({ source: { APP_ENV: 'test' } });
    const memory = createMemoryTransport();
    const from = { name: 'BieberKit Test', address: 'hello@example.test' };
    const mailer = createMailer({
      transport: memory,
      logger,
      from,
    });
    acquired.push(() => mailer.close());
    const queue = await createQueue({
      driver: 'sync',
      jobs: [...contributed<JobDef>(modules, 'jobs'), mailer.job],
      logger,
    });
    acquired.push(() => queue.close());
    queue.subscribe(MAIL_JOB, mailer.job);
    applySubscriptions(queue, contributed<QueueSubscription>(modules, 'subscriptions'));
    const mail = mailer.over(queue);
    const sendAuthMessage = async (message: Message): Promise<void> => {
      const em = currentEntityManager();
      if (em?.isInTransaction() === true) {
        emitEvent(em, { name: MAIL_JOB, payload: prepareMessage(message, from) });
        return;
      }
      await mail.send(message);
    };
    const cache = createCache({ engine: createMemoryEngine() });
    acquired.push(() => cache.close());
    const dispatcher = createOutboxDispatcher(db, { publisher: queue.publisher, logger });
    const container = createContainer();
    container.register('mail', { scope: 'singleton', create: () => mail });
    container.register('queue', { scope: 'singleton', create: () => queue });
    container.register('cache', { scope: 'singleton', create: () => cache });
    container.register('config', { scope: 'singleton', create: () => env });
    container.register('pluginEnv', { scope: 'singleton', create: () => options.pluginEnv ?? {} });
    const disk = createMemoryDisk({ signing: true, ...options.disk });
    container.register('storage', { scope: 'singleton', create: () => createStorage({ disk }) });
    container.register('permissions', { scope: 'singleton', create: () => everything });
    container.register('settingDeclarations', {
      scope: 'singleton',
      create: () => contributed<SettingDef>(modules, 'settings'),
    });
    container.register('database', { scope: 'singleton', create: () => db });
    container.register('auth', {
      scope: 'singleton',
      deps: ['mail'],
      create: () =>
        createAuth({
          db,
          dialect: db.dialect,
          secret: env.AUTH_SECRET,
          baseUrl: env.APP_URL,
          mail: {
            sendResetPassword: async ({ to, url }) => {
              await sendAuthMessage({ to, subject: 'Reset your password', text: url });
            },
            sendVerification: async ({ to, url }) => {
              await sendAuthMessage({ to, subject: 'Verify your email address', text: url });
            },
            sendInvite: async ({ to, url }) => {
              await sendAuthMessage({ to, subject: 'You are invited', text: url });
            },
            sendMfaReset: async ({ to }) => {
              await sendAuthMessage({ to, subject: 'Your second factor was removed', text: 'Set it up again.' });
            },
          },
        }),
    });
    for (const module of modules) registerModule(container, module);
    await container.boot();
    const server = createHttpServer(
      { APP_ENV: 'test', APP_PORT: 0, TRUST_PROXY: false, API_DOCS_PUBLIC: false },
      {
        authenticator: {
          authenticate: async (request): Promise<Principal | undefined> => {
            const id = first(request.headers[USER_HEADER]);
            return id === undefined || id === '' ? undefined : { id, kind: 'user', via: 'token' };
          },
        },
        tenantResolver: {
          resolve: async (request) => {
            const tenant = first(request.headers[TENANT_HEADER]);
            return tenant === undefined || tenant === '' ? undefined : tenant;
          },
        },
        authorizer,
        logger,
        services: container.services,
      },
    );
    acquired.push(() => server.stop({ drainMs: 0 }));
    authorizer.install(server);
    registerEntityRoutes(server, schemas, { db });
    for (const route of contributed<RouteDef>(modules, 'routes')) server.route(route);

    const catalog = new Map<string, readonly string[]>(Object.entries(options.roles ?? {}));
    catalog.set('admin', everything);
    // One role row for each tenant and name, shared by the views of the app.
    const made = new Map<string, Promise<string>>();
    const views = new Map<string, TestApp>();
    const counters = new Map<string, number>();
    const next = (entity: string): number => {
      const value = (counters.get(entity) ?? 0) + 1;
      counters.set(entity, value);
      return value;
    };

    const viewOf = (tenant: string): TestApp => {
      const known = views.get(tenant);
      if (known !== undefined) return known;
      const factories = new Map<string, Factory>();
      const factory = (entity: EntityDef<string>): Factory => {
        let found = factories.get(entity.name);
        if (found === undefined) {
          found = createFactory(entity, { db, schemas, tenant: () => tenant, next, factoryOf: factory });
          factories.set(entity.name, found);
        }
        return found;
      };
      const roleOf = (name: string): Promise<string> => {
        const permissions = catalog.get(name);
        if (permissions === undefined) {
          throw testingError(
            'TEST_ROLE_UNKNOWN',
            `The role "${name}" is not one of this test app.`,
            `Declare it in the roles of createTestApp, or use admin. Known: ${[...catalog.keys()].join(', ')}.`,
          );
        }
        const key = `${tenant}\u0000${name}`;
        let id = made.get(key);
        if (id === undefined) {
          id = createRole(db, { tenantId: tenant, name, permissions });
          made.set(key, id);
        }
        return id;
      };
      const view: TestApp = {
        db,
        server,
        queue,
        mailbox: memory.sent,
        runOutbox: async () => {
          const { claimed } = await dispatcher.dispatchOnce();
          // The sync queue runs the jobs of the batch after the transaction of the dispatcher; the batch is done when they are.
          await queue.settle();
          return claimed;
        },
        schemas,
        entities,
        authorizer,
        services: container.services,
        disk,
        logger,
        tenant,
        newUser: () => ({ id: uuid7() }),
        async actingAs(user, roles = []) {
          const userId = typeof user === 'string' ? user : user.id;
          for (const name of roles) await assignRole(db, { tenantId: tenant, userId, roleId: await roleOf(name) });
          return createClient(server, userId, () => tenant);
        },
        anonymous: () => createClient(server, undefined, () => tenant),
        withTenant: (other) => viewOf(other),
        factory,
        close: async () => {
          await server.stop({ drainMs: 0 });
          await Promise.all([queue.close(), mailer.close(), cache.close()]);
          await db.close();
        },
      };
      views.set(tenant, view);
      return view;
    };
    return viewOf(options.tenant ?? uuid7());
  } catch (error) {
    await Promise.allSettled(acquired.toReversed().map((close) => close()));
    throw error;
  }
}
