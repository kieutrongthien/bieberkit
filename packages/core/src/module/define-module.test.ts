/**
 * BieberKit
 *
 * @file        packages/core/src/module/define-module.test.ts
 * @description Tests for defineModule and registerModule (MOD-01, MOD-02).
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

import { describe, expect, it } from 'vitest';
import { createContainer } from '../container/container.ts';
import { BkError } from '../errors/errors.ts';
import { defineModule, registerModule } from './define-module.ts';

declare module '../index.ts' {
  interface ServiceRegistry {
    crmDeals: { count(): number };
    crmReport: { total: number };
  }
  interface ModuleContributions {
    jobs?: readonly string[];
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

describe('MOD-01 defineModule', () => {
  it('MOD-01 returns a frozen definition with its name, services and contributions', () => {
    const def = defineModule({ name: 'crm', jobs: ['sync'] });
    expect(def.kind).toBe('module');
    expect(def.name).toBe('crm');
    expect(def.services).toEqual({});
    expect(def.contributions).toEqual({ jobs: ['sync'] });
    expect(Object.isFrozen(def)).toBe(true);
    expect(Object.isFrozen(def.contributions)).toBe(true);
  });

  it('MOD-01 keeps contribution keys that core does not know, for the package that does', () => {
    // @ts-expect-error `entities` is typed only when @bieberkit/data adds it to ModuleContributions
    const def = defineModule({ name: 'crm', entities: ['Deal'] });
    expect(def.contributions).toEqual({ entities: ['Deal'] });
  });

  it('MOD-01 does not change or keep a reference to its input', () => {
    const jobs = ['sync'];
    const input = { name: 'crm', jobs };
    const def = defineModule(input);
    jobs.push('later');
    expect(def.contributions['jobs']).toEqual(['sync']);
    expect(Object.isFrozen(input)).toBe(false);
  });

  it.each([[''], ['Crm'], ['crm.deals'], ['crm deals'], ['1crm'], ['crm_x']])(
    'MOD-01 refuses the name %j with MOD_NAME_INVALID',
    (name) => {
      expect(codeOf(() => defineModule({ name }))).toBe('MOD_NAME_INVALID');
    },
  );

  it.each([['crm'], ['audit-log'], ['a1']])('MOD-01 accepts the name %j', (name) => {
    expect(defineModule({ name }).name).toBe(name);
  });
});

describe('MOD-02 registerModule', () => {
  it('MOD-02 registers the services of a module, which then resolve by name with their types', async () => {
    const def = defineModule({
      name: 'crm',
      services: {
        crmDeals: { scope: 'singleton', create: () => ({ count: () => 3 }) },
        crmReport: {
          scope: 'singleton',
          deps: ['crmDeals'],
          create: (services) => ({ total: services.crmDeals.count() }),
        },
      },
    });
    const container = createContainer();
    registerModule(container, def);
    await container.boot();
    expect(container.services.crmReport.total).toBe(3);
  });

  it('MOD-02 a service name used by two modules is CORE_SERVICE_DUPLICATE', () => {
    const container = createContainer();
    const service = { crmDeals: { scope: 'singleton', create: () => ({ count: () => 0 }) } } as const;
    registerModule(container, defineModule({ name: 'crm', services: service }));
    expect(codeOf(() => registerModule(container, defineModule({ name: 'other', services: service })))).toBe(
      'CORE_SERVICE_DUPLICATE',
    );
  });

  it('MOD-02 a module without services registers nothing', async () => {
    const container = createContainer();
    registerModule(container, defineModule({ name: 'empty' }));
    await container.boot();
  });
});
