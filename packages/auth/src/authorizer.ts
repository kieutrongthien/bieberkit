/**
 * BieberKit
 *
 * @file        packages/auth/src/authorizer.ts
 * @description The authorizer of the HTTP server: the permission of a route, the rows and the fields of an entity, the ability of one request and the audit of a denial (AUTHZ-01 to AUTHZ-06).
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

import { requestContext } from '@bieberkit/core';
import type { EntityDef } from '@bieberkit/data';
import { AuditLog } from '@bieberkit/data/orm';
import type { Database, OrmSchema } from '@bieberkit/data/orm';
import { HttpError } from '@bieberkit/http';
import type { AccessAnswer, Authorizer, HttpServer, Principal, RequestInfo, StageContext } from '@bieberkit/http';
import { buildAbility } from './ability.ts';
import type { Ability, EntityShape, ScopedPermission } from './ability.ts';
import { buildPermissionRegistry } from './registry.ts';
import { isAction } from './registry.ts';
import { loadGrants } from './roles.ts';
import type { GrantLoader } from './roles.ts';

export interface AuthorizerOptions {
  readonly db: Database;
  readonly entities: readonly EntityDef<string>[];
  /** The compiled schemas of the entities. They are the ones that the routes use. */
  readonly schemas: readonly OrmSchema[];
  /** The permissions that carry a condition, by permission string. */
  readonly scoped?: Readonly<Record<string, ScopedPermission>>;
  /** Where the grants of a caller come from. Defaults to the roles tables. */
  readonly grants?: GrantLoader;
}

export interface AccessAuthorizer extends Authorizer {
  access(principal: Principal, entity: string, action: string, request: RequestInfo): Promise<AccessAnswer>;
  allows(
    principal: Principal,
    entity: string,
    action: string,
    row: Readonly<Record<string, unknown>>,
    request: RequestInfo,
  ): Promise<boolean>;
  /** Adds the hook that audits a denial and drops the ability of the request (AUTHZ-01, AUTHZ-05). Call it once, before the server starts. */
  install(server: HttpServer): void;
}

interface Denial {
  readonly permission?: string;
  readonly entity?: string;
  readonly action?: string;
  readonly reason: 'no-permission' | 'unsupported-condition';
}

/** The ability of one caller in one request, and whether his roles ask for a second factor. */
interface Loaded {
  readonly ability: Ability;
  readonly requireMfa: boolean;
}

interface RequestRecord {
  readonly abilities: Map<string, Promise<Loaded>>;
  denial: Denial | undefined;
}

const STANDARD = new Set(['id', 'createdAt', 'updatedAt', 'hasOne', 'hasMany']);
/** An authorizer that is used outside a request (a script, a test) never sees `onResponse`, so the records are bounded. */
const MAX_RECORDS = 2000;

/** The properties that a condition may name and the fields that a mask may close, for one entity. */
export function shapeOf(entity: EntityDef<string>): EntityShape {
  const own = Object.entries(entity.fields).filter(([, field]) => !['hasOne', 'hasMany'].includes(field.kind));
  return {
    name: entity.name,
    properties: new Set(['id', 'createdAt', 'updatedAt', ...own.map(([name]) => name)]),
    fields: own.filter(([, field]) => !STANDARD.has(field.kind)).map(([name]) => name),
  };
}

const AUDIT_ACTIONS: Readonly<Record<string, string>> = {
  AUTHZ_DENIED: 'authz.denied',
  AUTHZ_FIELD_FORBIDDEN: 'authz.field-forbidden',
  AUTHZ_UNSUPPORTED_CONDITION: 'authz.unsupported-condition',
  AUTH_MFA_REQUIRED: 'authz.mfa-required',
};

const textOf = (value: unknown): string | undefined => (typeof value === 'string' ? value : undefined);

/**
 * The authorizer of the HTTP server (AUTHZ-01). It answers the permission of a route, and the rows and fields that a caller may use
 * for an entity. The ability is built from the grants of (user, tenant) when the request first asks, kept for the request only, and
 * dropped when the response is sent, so a change of roles shows in the next request.
 */
export function createAuthorizer(options: AuthorizerOptions): AccessAuthorizer {
  const registry = buildPermissionRegistry(options.entities);
  const shapes = new Map(options.entities.map((entity) => [entity.name, shapeOf(entity)]));
  const load = options.grants ?? loadGrants;
  const records = new Map<string, RequestRecord>();

  const recordOf = (): RequestRecord | undefined => {
    const id = requestContext.get()?.requestId;
    if (id === undefined) return undefined;
    let record = records.get(id);
    if (record === undefined) {
      if (records.size >= MAX_RECORDS) {
        const oldest = records.keys().next();
        if (oldest.done !== true) records.delete(oldest.value);
      }
      record = { abilities: new Map(), denial: undefined };
      records.set(id, record);
    }
    return record;
  };

  const abilityFor = (principal: Principal): Promise<Loaded> => {
    const tenantId = requestContext.get()?.tenantId;
    const build = async (): Promise<Loaded> => {
      // A machine client has the permissions of its key and no roles. A user has the roles that he holds in the tenant.
      const grants =
        principal.grants === undefined
          ? await load(options.db, tenantId, principal.id)
          : { permissions: new Set(principal.grants), roles: [], requireMfa: false };
      return {
        requireMfa: grants.requireMfa,
        ability: buildAbility({
          registry,
          granted: grants.permissions,
          ...(options.scoped === undefined ? {} : { scoped: options.scoped }),
          user: { id: principal.id, ...(tenantId === undefined ? {} : { tenantId }) },
        }),
      };
    };
    const record = recordOf();
    if (record === undefined) return build();
    const key = `${principal.id}|${tenantId ?? ''}`;
    let loaded = record.abilities.get(key);
    if (loaded === undefined) {
      loaded = build();
      record.abilities.set(key, loaded);
    }
    return loaded;
  };

  /** The ability of the caller, unless a role of his asks for a second factor that his session does not have (AUTH-05). */
  const ready = async (principal: Principal): Promise<Ability> => {
    const loaded = await abilityFor(principal);
    if (loaded.requireMfa && principal.mfa !== true) {
      throw new HttpError(
        'AUTH_MFA_REQUIRED',
        403,
        'A second factor is needed for this.',
        'Turn on two-factor sign in (POST /api/auth/two-factor/enable), then sign in with the code.',
      );
    }
    return loaded.ability;
  };

  const deny = (denial: Denial): void => {
    const record = recordOf();
    if (record !== undefined && record.denial === undefined) record.denial = denial;
  };

  return {
    async can(principal, permission) {
      const ability = await ready(principal);
      if (ability.covers(permission)) return true;
      const entry = registry.entriesOf(permission).find((candidate) => candidate.field === undefined);
      deny({
        permission,
        reason: 'no-permission',
        ...(entry === undefined ? {} : { entity: entry.subject, action: entry.action }),
      });
      return false;
    },

    async access(principal: Principal, entity: string, action: string, _request: RequestInfo): Promise<AccessAnswer> {
      const shape = shapes.get(entity);
      if (shape === undefined || !isAction(action)) return { allowed: false, reason: 'no-permission' };
      const answer = (await ready(principal)).access(shape, action);
      if (!answer.allowed) deny({ entity, action, reason: answer.reason ?? 'no-permission' });
      return answer;
    },

    async allows(principal, entity, action, row) {
      const shape = shapes.get(entity);
      if (shape === undefined || !isAction(action)) return false;
      const allowed = (await ready(principal)).allows(shape, action, { ...row });
      if (!allowed) deny({ entity, action, reason: 'no-permission' });
      return allowed;
    },

    install(server) {
      server.stage('onResponse', async (context: StageContext) => {
        const id = requestContext.get()?.requestId ?? context.requestId;
        const record = records.get(id) ?? records.get(context.requestId);
        records.delete(id);
        records.delete(context.requestId);
        if (context.status !== 403 || context.principal === undefined) return;
        const code = context.code ?? '';
        const details = context.details ?? {};
        const denial = record?.denial;
        let action = AUDIT_ACTIONS[code];
        if (action === undefined && denial === undefined) return;
        if (action === undefined)
          action = denial?.reason === 'unsupported-condition' ? 'authz.unsupported-condition' : 'authz.denied';
        const fields = Array.isArray(details['fields'])
          ? details['fields'].filter((item) => typeof item === 'string')
          : undefined;
        const entity = textOf(details['entity']) ?? denial?.entity;
        const data = {
          ...(denial?.permission === undefined ? {} : { permission: denial.permission }),
          ...((textOf(details['action']) ?? denial?.action) === undefined
            ? {}
            : { action: textOf(details['action']) ?? denial?.action }),
          ...(fields === undefined ? {} : { fields }),
        };
        const em = options.db.fork();
        em.create(AuditLog, {
          action,
          at: new Date(),
          entity: entity ?? null,
          recordId: null,
          reason: null,
          data: JSON.stringify(data),
          tenant: context.tenantId ?? null,
          actorId: context.principal.id,
          requestId: context.requestId,
        });
        await em.flush();
      });
    },
  };
}
