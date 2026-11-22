/**
 * BieberKit
 *
 * @file        packages/core/src/container/container.test.ts
 * @description Tests for the service container: typed names, boot-time checks, scopes and declared dependencies (CORE-03 to CORE-09).
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

import { describe, expect, it, vi } from 'vitest';
import { BkError } from '../errors/errors.ts';
import { createContainer } from './container.ts';

// Augmented through the package entry, as every other package does. Mixing it with a deep path would split the interface.
declare module '../index.ts' {
  interface ServiceRegistry {
    clock: { now(): number };
    db: { name: string };
    repo: { db: { name: string } };
    session: { id: number };
    audit: { session: { id: number } };
    mailer: { sent: number };
  }
}

function codeOf(run: () => unknown): string | undefined {
  try {
    run();
  } catch (error) {
    return error instanceof BkError ? error.code : 'NOT_A_BKERROR';
  }
  return undefined;
}

/** Boots the container and returns the BkError it must reject with. */
async function bootFailure(container: ReturnType<typeof createContainer>): Promise<BkError> {
  try {
    await container.boot();
  } catch (error) {
    if (error instanceof BkError) return error;
    throw error;
  }
  throw new Error('Expected boot to reject.');
}

async function bootCode(container: ReturnType<typeof createContainer>): Promise<string | undefined> {
  try {
    await container.boot();
  } catch (error) {
    return error instanceof BkError ? error.code : 'NOT_A_BKERROR';
  }
  return undefined;
}

describe('CORE-03 typed resolution', () => {
  it('CORE-03 a registered service resolves by name with its type', async () => {
    const container = createContainer();
    container.register('db', { scope: 'singleton', create: () => ({ name: 'main' }) });
    await container.boot();
    expect(container.services.db.name).toBe('main');
  });

  it('CORE-03 a service receives its declared dependencies, whatever the registration order', async () => {
    const container = createContainer();
    container.register('repo', { scope: 'singleton', deps: ['db'], create: (s) => ({ db: s.db }) });
    container.register('db', { scope: 'singleton', create: () => ({ name: 'main' }) });
    await container.boot();
    expect(container.services.repo.db).toBe(container.services.db);
  });
});

describe('CORE-04 missing dependency', () => {
  it('CORE-04 fails at boot before any factory runs, naming the service and the dependent', async () => {
    const container = createContainer();
    const factory = vi.fn<() => { name: string }>(() => ({ name: 'main' }));
    container.register('db', { scope: 'singleton', create: factory });
    container.register('repo', { scope: 'singleton', deps: ['db', 'clock'], create: (s) => ({ db: s.db }) });
    const error = await bootFailure(container);
    expect(error.code).toBe('CORE_SERVICE_MISSING');
    expect(error.message).toContain('clock');
    expect(error.message).toContain('repo');
    expect(factory).not.toHaveBeenCalled();
  });

  it('CORE-04 lists every missing dependency together', async () => {
    const container = createContainer();
    container.register('repo', { scope: 'singleton', deps: ['db', 'clock'], create: () => ({ db: { name: 'x' } }) });
    const error = await bootFailure(container);
    expect(error.message).toContain('db');
    expect(error.message).toContain('clock');
  });
});

describe('CORE-05 cycles', () => {
  it('CORE-05 fails at boot and names the cycle', async () => {
    const container = createContainer();
    const factory = vi.fn<() => { name: string }>(() => ({ name: 'x' }));
    container.register('db', { scope: 'singleton', deps: ['repo'], create: factory });
    container.register('repo', { scope: 'singleton', deps: ['audit'], create: () => ({ db: { name: 'x' } }) });
    container.register('audit', { scope: 'singleton', deps: ['db'], create: () => ({ session: { id: 1 } }) });
    const error = await bootFailure(container);
    expect(error.code).toBe('CORE_SERVICE_CYCLE');
    expect(error.message).toMatch(
      /(db -> repo -> audit -> db|repo -> audit -> db -> repo|audit -> db -> repo -> audit)/,
    );
    expect(factory).not.toHaveBeenCalled();
  });

  it('CORE-05 a service that depends on itself is a cycle', async () => {
    const container = createContainer();
    container.register('db', { scope: 'singleton', deps: ['db'], create: () => ({ name: 'x' }) });
    expect(await bootCode(container)).toBe('CORE_SERVICE_CYCLE');
  });
});

describe('CORE-06 scope rule', () => {
  it('CORE-06 a singleton cannot depend on a request service', async () => {
    const container = createContainer();
    container.register('session', { scope: 'request', create: () => ({ id: 1 }) });
    container.register('audit', { scope: 'singleton', deps: ['session'], create: (s) => ({ session: s.session }) });
    expect(await bootCode(container)).toBe('CORE_SERVICE_SCOPE');
  });

  it('CORE-06 also not through a transient service in between', async () => {
    const container = createContainer();
    container.register('session', { scope: 'request', create: () => ({ id: 1 }) });
    container.register('audit', { scope: 'transient', deps: ['session'], create: (s) => ({ session: s.session }) });
    container.register('mailer', { scope: 'singleton', deps: ['audit'], create: () => ({ sent: 0 }) });
    expect(await bootCode(container)).toBe('CORE_SERVICE_SCOPE');
  });

  it('CORE-06 a request service may depend on singletons and on other request services', async () => {
    const container = createContainer();
    container.register('db', { scope: 'singleton', create: () => ({ name: 'main' }) });
    container.register('session', { scope: 'request', deps: ['db'], create: () => ({ id: 1 }) });
    container.register('audit', { scope: 'request', deps: ['session'], create: (s) => ({ session: s.session }) });
    expect(await bootCode(container)).toBeUndefined();
  });
});

describe('CORE-07 declared dependencies', () => {
  it('CORE-07 a factory that resolves a service it did not declare throws', async () => {
    const container = createContainer();
    container.register('db', { scope: 'singleton', create: () => ({ name: 'main' }) });
    container.register('repo', { scope: 'singleton', create: (s) => ({ db: s.db }) });
    expect(await bootCode(container)).toBe('CORE_SERVICE_UNDECLARED');
  });

  it('CORE-07 the same rule holds for request and transient factories', async () => {
    const container = createContainer();
    container.register('db', { scope: 'singleton', create: () => ({ name: 'main' }) });
    container.register('session', { scope: 'request', create: () => ({ id: 1 }) });
    container.register('audit', { scope: 'request', create: (s) => ({ session: s.session }) });
    await container.boot();
    expect(codeOf(() => container.createScope().services.audit)).toBe('CORE_SERVICE_UNDECLARED');
  });
});

describe('CORE-08 singleton factories', () => {
  it('CORE-08 run once, in dependency order, awaited at boot', async () => {
    const order: string[] = [];
    const container = createContainer();
    container.register('repo', {
      scope: 'singleton',
      deps: ['db'],
      create: async (s) => {
        order.push('repo');
        return { db: s.db };
      },
    });
    container.register('db', {
      scope: 'singleton',
      create: async () => {
        await new Promise((resolve) => setTimeout(resolve, 5));
        order.push('db');
        return { name: 'main' };
      },
    });
    await container.boot();
    expect(order).toEqual(['db', 'repo']);
    expect(container.services.repo.db.name).toBe('main');
    void container.services.repo;
    expect(order).toEqual(['db', 'repo']);
  });

  it('CORE-08 a request or transient factory that returns a promise is refused', async () => {
    const container = createContainer();
    // @ts-expect-error a request factory must be synchronous, and the types say so
    container.register('session', { scope: 'request', create: async () => ({ id: 1 }) });
    await container.boot();
    expect(codeOf(() => container.createScope().services.session)).toBe('CORE_SERVICE_ASYNC');
  });

  it('CORE-08 a factory that throws fails boot, keeping a BkError and wrapping anything else', async () => {
    const wrapped = createContainer();
    wrapped.register('db', {
      scope: 'singleton',
      create: () => {
        throw new Error('connection refused');
      },
    });
    const error = await bootFailure(wrapped);
    expect(error.code).toBe('CORE_SERVICE_FACTORY');
    expect(error.message).toContain('db');
    expect(error.cause).toBeInstanceOf(Error);

    const own = new BkError('no', { code: 'X_OWN' });
    const kept = createContainer();
    kept.register('db', {
      scope: 'singleton',
      create: () => {
        throw own;
      },
    });
    await expect(kept.boot()).rejects.toBe(own);
  });
});

async function booted() {
  const container = createContainer();
  let sessions = 0;
  let mailers = 0;
  container.register('db', { scope: 'singleton', create: () => ({ name: 'main' }) });
  container.register('session', { scope: 'request', create: () => ({ id: ++sessions }) });
  container.register('mailer', { scope: 'transient', create: () => ({ sent: ++mailers }) });
  await container.boot();
  return container;
}

describe('CORE-09 scopes', () => {
  it('CORE-09 a scope creates a request service once, and each scope has its own', async () => {
    const container = await booted();
    const a = container.createScope();
    const b = container.createScope();
    expect(a.services.session).toBe(a.services.session);
    expect(a.services.session).not.toBe(b.services.session);
    expect(a.services.session.id).toBe(1);
    expect(b.services.session.id).toBe(2);
  });

  it('CORE-09 a transient service is new on every access', async () => {
    const container = await booted();
    const scope = container.createScope();
    expect(scope.services.mailer).not.toBe(scope.services.mailer);
    expect(container.services.mailer.sent).toBeGreaterThan(0);
  });

  it('CORE-09 a singleton is shared by the container and all scopes', async () => {
    const container = await booted();
    expect(container.createScope().services.db).toBe(container.services.db);
  });

  it('CORE-09 a request service cannot be read from the container without a scope', async () => {
    const container = await booted();
    expect(codeOf(() => container.services.session)).toBe('CORE_SERVICE_SCOPE');
  });

  it('CORE-09 a request service created in a scope sees the request services of that scope', async () => {
    const container = createContainer();
    container.register('session', { scope: 'request', create: () => ({ id: Math.random() }) });
    container.register('audit', { scope: 'request', deps: ['session'], create: (s) => ({ session: s.session }) });
    await container.boot();
    const scope = container.createScope();
    expect(scope.services.audit.session).toBe(scope.services.session);
  });
});

describe('CORE-03 container state', () => {
  it('CORE-03 registering the same name twice is CORE_SERVICE_DUPLICATE', () => {
    const container = createContainer();
    container.register('db', { scope: 'singleton', create: () => ({ name: 'a' }) });
    expect(codeOf(() => container.register('db', { scope: 'singleton', create: () => ({ name: 'b' }) }))).toBe(
      'CORE_SERVICE_DUPLICATE',
    );
  });

  it('CORE-03 registering after boot, booting twice and reading before boot are CORE_CONTAINER_STATE', async () => {
    const container = createContainer();
    container.register('db', { scope: 'singleton', create: () => ({ name: 'a' }) });
    expect(codeOf(() => container.services.db)).toBe('CORE_CONTAINER_STATE');
    expect(codeOf(() => container.createScope())).toBe('CORE_CONTAINER_STATE');
    await container.boot();
    expect(codeOf(() => container.register('clock', { scope: 'singleton', create: () => ({ now: () => 0 }) }))).toBe(
      'CORE_CONTAINER_STATE',
    );
    expect(await bootCode(container)).toBe('CORE_CONTAINER_STATE');
  });
});
