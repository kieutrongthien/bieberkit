/**
 * BieberKit
 *
 * @file        packages/auth/src/drift.ts
 * @description The drift check: the schema that Better Auth expects and the entities of BieberKit must agree on the properties, the nullability and the unique keys (AUTH-10).
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

import { getAuthTables } from 'better-auth/db';
import type { BetterAuthOptions } from 'better-auth';
import type { Database } from '@bieberkit/data/orm';
import {
  AuthAccount,
  AuthPasskey,
  AuthRateLimit,
  AuthSession,
  AuthTwoFactor,
  AuthUser,
  AuthVerification,
} from './tables.ts';

export interface DriftProperty {
  nullable?: boolean;
  unique?: boolean;
}

/** What the check looks at in an entity: its properties, with their nullability and whether a unique key covers them alone. */
export interface DriftEntity {
  properties: Record<string, DriftProperty>;
}

const MODELS = {
  authUser: AuthUser,
  authSession: AuthSession,
  authAccount: AuthAccount,
  authVerification: AuthVerification,
  authRateLimit: AuthRateLimit,
  authTwoFactor: AuthTwoFactor,
  authPasskey: AuthPasskey,
} as const;

/** The entities of the auth tables as the check wants them, read from the metadata of the ORM. */
export function driftEntities(db: Database): Record<string, DriftEntity> {
  const metadata = db.orm.getMetadata();
  const out: Record<string, DriftEntity> = {};
  for (const [name, schema] of Object.entries(MODELS)) {
    const meta = metadata.get(schema);
    const single = new Set(
      (meta.uniques ?? []).flatMap((unique) => {
        const properties = Array.isArray(unique.properties) ? unique.properties : [unique.properties];
        return properties.length === 1 ? properties.map(String) : [];
      }),
    );
    out[name] = {
      properties: Object.fromEntries(
        Object.entries(meta.properties).map(([property, definition]) => [
          property,
          { nullable: definition.nullable === true, unique: definition.unique === true || single.has(property) },
        ]),
      ),
    };
  }
  return out;
}

/**
 * Compares `getAuthTables(options)` with the entities and lists every difference: a model without an entity, a field without a
 * property, a field that may be empty on one side only, and a unique field without a unique key. An empty list means that they
 * agree. It runs as a test on every change of the options and of the version of Better Auth (AUTH-10).
 */
export function checkAuthDrift(options: BetterAuthOptions, entities: Record<string, DriftEntity>): string[] {
  const problems: string[] = [];
  for (const definition of Object.values(getAuthTables(options))) {
    const entity = entities[definition.modelName];
    if (entity === undefined) {
      problems.push(`missing entity "${definition.modelName}"`);
      continue;
    }
    for (const [field, attributes] of Object.entries(definition.fields)) {
      const property = entity.properties[attributes.fieldName ?? field];
      const label = `${definition.modelName}.${field}`;
      if (property === undefined) {
        problems.push(`${label}: the entity has no property`);
        continue;
      }
      const wantNull = attributes.required === false;
      if ((property.nullable === true) !== wantNull)
        problems.push(`${label}: the property ${wantNull ? 'must allow null' : 'must not allow null'}`);
      if (attributes.unique === true && property.unique !== true)
        problems.push(`${label}: the property must be unique`);
    }
  }
  return problems;
}
