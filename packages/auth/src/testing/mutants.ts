/**
 * BieberKit
 *
 * @file        packages/auth/src/testing/mutants.ts
 * @description Six faults of the authorizer, for mutation testing of the generated permission matrix: each must break at least one case (ADR 0013, decision 9).
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

import { createAuthorizer } from '../authorizer.ts';
import type { AccessAuthorizer, AuthorizerOptions } from '../authorizer.ts';
import { loadGrants } from '../roles.ts';
import type { Grants } from '../roles.ts';

export interface Mutant {
  readonly id:
    | 'ignore-conditions'
    | 'no-read-mask'
    | 'no-write-mask'
    | 'write-checks-read'
    | 'unsupported-allows-all'
    | 'tenant-blind-grants';
  readonly description: string;
  /** An authorizer with the fault. `tenants` are the tenants that the tests use. */
  build(options: AuthorizerOptions, tenants: readonly string[]): AccessAuthorizer;
}

const WRITES = new Set(['create', 'update', 'delete']);
const EMPTY = { method: 'GET', path: '/', headers: {}, ip: '127.0.0.1' } as const;

/** The faults that a generated suite has to catch. A suite that passes with one of them has lost its power. */
export const MUTANTS: readonly Mutant[] = [
  {
    id: 'ignore-conditions',
    description: 'the conditions of a role are ignored',
    build: (options) => {
      const real = createAuthorizer(options);
      return {
        ...real,
        access: async (principal, entity, action, request) => {
          const { scope: _scope, ...rest } = await real.access(principal, entity, action, request);
          return rest;
        },
        allows: async (principal, entity, action) => (await real.access(principal, entity, action, EMPTY)).allowed,
      };
    },
  },
  {
    id: 'no-read-mask',
    description: 'a read shows the masked fields',
    build: (options) => {
      const real = createAuthorizer(options);
      return {
        ...real,
        access: async (principal, entity, action, request) => {
          const { readable: _readable, ...rest } = await real.access(principal, entity, action, request);
          return rest;
        },
      };
    },
  },
  {
    id: 'no-write-mask',
    description: 'a write may touch the masked fields',
    build: (options) => {
      const real = createAuthorizer(options);
      return {
        ...real,
        access: async (principal, entity, action, request) => {
          const { writable: _writable, ...rest } = await real.access(principal, entity, action, request);
          return rest;
        },
      };
    },
  },
  {
    id: 'write-checks-read',
    description: 'a write is allowed by the read permission',
    build: (options) => {
      const real = createAuthorizer(options);
      return {
        ...real,
        can: async (principal, permission, request) => {
          if (await real.can(principal, permission, request)) return true;
          // The fault: a permission for a write is also given by any read permission of the same entity.
          const entity = options.entities.find(
            (candidate) =>
              candidate.permissions.update === permission ||
              candidate.permissions.create === permission ||
              candidate.permissions.delete === permission,
          );
          const read = entity?.permissions.read;
          return read === undefined ? false : real.can(principal, read, request);
        },
        access: async (principal, entity, action, request) =>
          real.access(
            principal,
            entity,
            WRITES.has(action) || action.startsWith('transition:') ? 'read' : action,
            request,
          ),
        allows: async (principal, entity, action, row, request) =>
          real.allows(principal, entity, WRITES.has(action) ? 'read' : action, row, request),
      };
    },
  },
  {
    id: 'unsupported-allows-all',
    description: 'a condition that the language does not have allows every row',
    build: (options) => {
      const real = createAuthorizer(options);
      return {
        ...real,
        access: async (principal, entity, action, request) => {
          const answer = await real.access(principal, entity, action, request);
          return answer.reason === 'unsupported-condition' ? { allowed: true } : answer;
        },
      };
    },
  },
  {
    id: 'tenant-blind-grants',
    description: 'the roles of every tenant grant, not only those of the tenant of the request',
    build: (options, tenants) =>
      createAuthorizer({
        ...options,
        grants: async (db, _tenant, userId): Promise<Grants> => {
          const permissions = new Set<string>();
          const roles: string[] = [];
          let requireMfa = false;
          let ipRestricted = false;
          for (const tenant of tenants) {
            const grants = await loadGrants(db, tenant, userId);
            for (const permission of grants.permissions) permissions.add(permission);
            roles.push(...grants.roles);
            requireMfa ||= grants.requireMfa;
            ipRestricted ||= grants.ipRestricted;
          }
          return { permissions, roles, requireMfa, ipRestricted };
        },
      }),
  },
];
