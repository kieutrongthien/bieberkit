/**
 * BieberKit
 *
 * @file        packages/core/src/container/container.ts
 * @description The service container: typed names through ServiceRegistry, declared dependencies checked at boot, and three scopes (CORE-03 to CORE-09).
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

import type { CoreEnv } from '../config/core-env.ts';
import { BkError, ContainerError } from '../errors/errors.ts';
import type { SettingDef } from '../settings/define-setting.ts';

/**
 * Names and types of the services. Packages and modules add theirs by declaration merging:
 * `declare module '@bieberkit/core' { interface ServiceRegistry { pipeline: PipelineService } }`.
 */
export interface ServiceRegistry {
  /** The validated environment of the process. The server registers it, so that a service reads configuration and never `process.env` (P8). */
  config: CoreEnv;
  /** The validated values of the env keys that plugins declare, by key (`USERS_ADMIN_EMAIL`). */
  pluginEnv: Readonly<Record<string, unknown>>;
  /** Every setting that the modules declare, in module order (SET-01). The settings plugin checks and serves them. */
  settingDeclarations: readonly SettingDef[];
}

export type ServiceName = Extract<keyof ServiceRegistry, string>;

/** `singleton`: one per process. `request`: one per scope. `transient`: new on every access. */
export type ServiceScope = 'singleton' | 'request' | 'transient';

interface RegistrationBase {
  /** Every service the factory reads. The container refuses any other (CORE-07) and checks them all at boot (CORE-04). */
  readonly deps?: readonly ServiceName[];
}

export type Registration<N extends ServiceName> =
  | (RegistrationBase & {
      readonly scope: 'singleton';
      /** May be async. It runs once at boot, after the factories of its dependencies (CORE-08). */
      create(services: ServiceRegistry): ServiceRegistry[N] | Promise<ServiceRegistry[N]>;
    })
  | (RegistrationBase & {
      readonly scope: 'request' | 'transient';
      create(services: ServiceRegistry): ServiceRegistry[N];
    });

export interface RequestScope {
  readonly services: ServiceRegistry;
}

export interface Container {
  register<N extends ServiceName>(name: N, registration: Registration<N>): void;
  /** Checks the graph, then builds every singleton in dependency order. Runs once. */
  boot(): Promise<void>;
  /** Singletons and transient services. A request service needs a scope. Available after boot. */
  readonly services: ServiceRegistry;
  createScope(): RequestScope;
}

interface Entry {
  readonly name: string;
  readonly scope: ServiceScope;
  readonly deps: readonly string[];
  readonly create: (services: ServiceRegistry) => unknown;
}

type State = 'open' | 'booting' | 'booted' | 'failed';

function fail(code: string, message: string, fix: string): never {
  throw new ContainerError(message, { code, fix });
}

function registryOf(read: (name: string) => unknown): ServiceRegistry {
  const target = {};
  const proxy = new Proxy(target, {
    get: (_target, property) => (typeof property === 'string' && property !== 'then' ? read(property) : undefined),
  });
  // A proxy answers for every registered name, and the types of those names live in `ServiceRegistry`.
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion
  return proxy as ServiceRegistry;
}

function isThenable(value: unknown): boolean {
  return typeof value === 'object' && value !== null && 'then' in value && typeof value.then === 'function';
}

export function createContainer(): Container {
  const entries = new Map<string, Entry>();
  const singletons = new Map<string, unknown>();
  let state: State = 'open';

  const entryOf = (name: string): Entry => {
    const entry = entries.get(name);
    if (entry === undefined)
      fail(
        'CORE_SERVICE_MISSING',
        `Service "${name}" is not registered.`,
        `Register "${name}", or remove it from deps.`,
      );
    return entry;
  };

  const build = (entry: Entry, cache: Map<string, unknown> | undefined): unknown => {
    const services = registryOf((name) => {
      if (!entry.deps.includes(name)) {
        fail(
          'CORE_SERVICE_UNDECLARED',
          `Service "${entry.name}" reads "${name}" but does not declare it.`,
          `Add "${name}" to deps of "${entry.name}".`,
        );
      }
      return resolve(name, cache);
    });
    let result: unknown;
    try {
      result = entry.create(services);
    } catch (error) {
      if (error instanceof BkError) throw error;
      throw new ContainerError(
        `Service "${entry.name}" failed to start: ${error instanceof Error ? error.message : 'unknown error'}`,
        {
          code: 'CORE_SERVICE_FACTORY',
          fix: 'See the cause for the original error.',
          cause: error,
        },
      );
    }
    if (entry.scope !== 'singleton' && isThenable(result)) {
      fail(
        'CORE_SERVICE_ASYNC',
        `Service "${entry.name}" is ${entry.scope}, and its factory returned a promise.`,
        'Only singleton factories may be async. Build the value at boot in a singleton.',
      );
    }
    return result;
  };

  const resolve = (name: string, cache: Map<string, unknown> | undefined): unknown => {
    const entry = entryOf(name);
    if (entry.scope === 'singleton') {
      if (!singletons.has(name))
        fail('CORE_CONTAINER_STATE', `Singleton "${name}" is not built yet.`, 'Call boot() first.');
      return singletons.get(name);
    }
    if (entry.scope === 'transient') return build(entry, cache);
    if (cache === undefined) {
      fail(
        'CORE_SERVICE_SCOPE',
        `Service "${name}" is request-scoped and was read outside a request scope.`,
        'Read it from container.createScope().services.',
      );
    }
    if (!cache.has(name)) cache.set(name, build(entry, cache));
    return cache.get(name);
  };

  const validate = (): void => {
    const missing: string[] = [];
    for (const entry of entries.values()) {
      for (const dep of entry.deps) if (!entries.has(dep)) missing.push(`"${dep}" (needed by "${entry.name}")`);
    }
    if (missing.length > 0) {
      fail(
        'CORE_SERVICE_MISSING',
        `Missing services: ${missing.join(', ')}.`,
        'Register each of them, or remove them from deps.',
      );
    }

    const visiting: string[] = [];
    const done = new Set<string>();
    const visit = (name: string): void => {
      if (done.has(name)) return;
      const at = visiting.indexOf(name);
      if (at >= 0) {
        const cycle = [...visiting.slice(at), name].join(' -> ');
        fail(
          'CORE_SERVICE_CYCLE',
          `Services depend on each other in a cycle: ${cycle}.`,
          'Break the cycle, for example by moving the shared part into a third service.',
        );
      }
      visiting.push(name);
      for (const dep of entryOf(name).deps) visit(dep);
      visiting.pop();
      done.add(name);
    };
    for (const name of entries.keys()) visit(name);

    const bound = new Map<string, boolean>();
    const requestBound = (name: string): boolean => {
      const known = bound.get(name);
      if (known !== undefined) return known;
      const entry = entryOf(name);
      const value = entry.scope === 'request' || entry.deps.some(requestBound);
      bound.set(name, value);
      return value;
    };
    for (const entry of entries.values()) {
      if (entry.scope !== 'singleton') continue;
      for (const dep of entry.deps) {
        if (requestBound(dep)) {
          fail(
            'CORE_SERVICE_SCOPE',
            `Singleton "${entry.name}" depends on "${dep}", which needs a request.`,
            'Pass the request service as an argument of the method that needs it, or change a scope.',
          );
        }
      }
    }
  };

  const order = (): string[] => {
    const seen = new Set<string>();
    const sorted: string[] = [];
    const visit = (name: string): void => {
      if (seen.has(name)) return;
      seen.add(name);
      for (const dep of entryOf(name).deps) visit(dep);
      if (entryOf(name).scope === 'singleton') sorted.push(name);
    };
    for (const name of entries.keys()) visit(name);
    return sorted;
  };

  const ready = (): void => {
    if (state !== 'booted')
      fail(
        'CORE_CONTAINER_STATE',
        'The container is not booted.',
        'Call boot() and wait for it before reading services.',
      );
  };

  return {
    register: (name, registration) => {
      if (state !== 'open')
        fail(
          'CORE_CONTAINER_STATE',
          `Service "${name}" was registered after boot.`,
          'Register every service before boot().',
        );
      if (entries.has(name))
        fail('CORE_SERVICE_DUPLICATE', `Service "${name}" is registered twice.`, 'Register a name once.');
      entries.set(name, {
        name,
        scope: registration.scope,
        deps: registration.deps ?? [],
        create: (services) => registration.create(services),
      });
    },
    boot: async () => {
      if (state !== 'open') fail('CORE_CONTAINER_STATE', 'boot() runs once.', 'Create a new container.');
      state = 'booting';
      try {
        validate();
        for (const name of order()) {
          singletons.set(name, await build(entryOf(name), undefined));
        }
      } catch (error) {
        state = 'failed';
        throw error;
      }
      state = 'booted';
    },
    services: registryOf((name) => {
      ready();
      return resolve(name, undefined);
    }),
    createScope: () => {
      ready();
      const cache = new Map<string, unknown>();
      return { services: registryOf((name) => resolve(name, cache)) };
    },
  };
}
