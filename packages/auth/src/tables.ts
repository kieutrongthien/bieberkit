/**
 * BieberKit
 *
 * @file        packages/auth/src/tables.ts
 * @description The five tables that Better Auth uses, as ORM schemas and as the migration steps that make them (AUTH-09, AUTH-10, DATA-24).
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

import { DateTimeType, EntitySchema } from '@mikro-orm/core';
import { uuid7 } from '@bieberkit/data';
import type { PluginMigrationStep } from '@bieberkit/data';
import { Uuid7Type, uuidType } from '@bieberkit/data/orm';
import { authStep } from './plugin.ts';

export interface AuthUserRow {
  id: string;
  name: string;
  email: string;
  emailVerified: boolean;
  image?: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface AuthSessionRow {
  id: string;
  userId: string;
  token: string;
  expiresAt: Date;
  ipAddress?: string | null;
  userAgent?: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface AuthAccountRow {
  id: string;
  userId: string;
  /** The id of the account at the provider. It is `external_account_ref` and not `account_id`, which MikroORM would read as the key (ADR 0012). */
  externalId: string;
  providerId: string;
  accessToken?: string | null;
  refreshToken?: string | null;
  idToken?: string | null;
  accessTokenExpiresAt?: Date | null;
  refreshTokenExpiresAt?: Date | null;
  scope?: string | null;
  password?: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface AuthVerificationRow {
  id: string;
  identifier: string;
  value: string;
  expiresAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

export interface AuthRateLimitRow {
  id: string;
  key: string;
  count: number;
  lastRequest: number;
}

const id = (): { type: typeof Uuid7Type; primary: true; onCreate: () => string } => ({
  type: Uuid7Type,
  primary: true,
  onCreate: () => uuid7(),
});
const instant = (fieldName: string): { type: typeof DateTimeType; length: 3; fieldName: string } => ({
  type: DateTimeType,
  length: 3,
  fieldName,
});

/** The model names are the entity names, and Better Auth is told them with `modelName`. */
export const AuthUser: EntitySchema<AuthUserRow> = new EntitySchema<AuthUserRow>({
  name: 'authUser',
  tableName: 'auth_users',
  properties: {
    id: id(),
    name: { type: 'string', length: 200 },
    email: { type: 'string', length: 254 },
    emailVerified: { type: 'boolean', fieldName: 'email_verified', onCreate: () => false },
    image: { type: 'string', length: 500, nullable: true },
    createdAt: instant('created_at'),
    updatedAt: instant('updated_at'),
  },
  uniques: [{ name: 'auth_users_email_unique', properties: ['email'] }],
});

// The relation is typed by the entity of the target, which the row type does not know, so the schema has no row type.
export const AuthSession: EntitySchema = new EntitySchema({
  name: 'authSession',
  tableName: 'auth_sessions',
  properties: {
    id: id(),
    userId: { kind: 'm:1', entity: () => AuthUser, mapToPk: true, fieldName: 'user_id', deleteRule: 'cascade' },
    token: { type: 'string', length: 255 },
    expiresAt: instant('expires_at'),
    ipAddress: { type: 'string', length: 64, fieldName: 'ip_address', nullable: true },
    userAgent: { type: 'string', length: 500, fieldName: 'user_agent', nullable: true },
    createdAt: instant('created_at'),
    updatedAt: instant('updated_at'),
  },
  uniques: [{ name: 'auth_sessions_token_unique', properties: ['token'] }],
  indexes: [{ name: 'auth_sessions_user_index', properties: ['userId'] }],
});

// The relation is typed by the entity of the target, which the row type does not know, so the schema has no row type.
export const AuthAccount: EntitySchema = new EntitySchema({
  name: 'authAccount',
  tableName: 'auth_accounts',
  properties: {
    id: id(),
    userId: { kind: 'm:1', entity: () => AuthUser, mapToPk: true, fieldName: 'user_id', deleteRule: 'cascade' },
    externalId: { type: 'string', length: 255, fieldName: 'external_account_ref' },
    providerId: { type: 'string', length: 100, fieldName: 'provider_id' },
    accessToken: { type: 'text', fieldName: 'access_token', nullable: true },
    refreshToken: { type: 'text', fieldName: 'refresh_token', nullable: true },
    idToken: { type: 'text', fieldName: 'id_token', nullable: true },
    accessTokenExpiresAt: { ...instant('access_token_expires_at'), nullable: true },
    refreshTokenExpiresAt: { ...instant('refresh_token_expires_at'), nullable: true },
    scope: { type: 'text', nullable: true },
    password: { type: 'text', nullable: true },
    createdAt: instant('created_at'),
    updatedAt: instant('updated_at'),
  },
  indexes: [{ name: 'auth_accounts_user_index', properties: ['userId'] }],
});

export const AuthVerification: EntitySchema<AuthVerificationRow> = new EntitySchema<AuthVerificationRow>({
  name: 'authVerification',
  tableName: 'auth_verifications',
  properties: {
    id: id(),
    identifier: { type: 'string', length: 255 },
    value: { type: 'text' },
    expiresAt: instant('expires_at'),
    createdAt: instant('created_at'),
    updatedAt: instant('updated_at'),
  },
  indexes: [{ name: 'auth_verifications_identifier_index', properties: ['identifier'] }],
});

export const AuthRateLimit: EntitySchema<AuthRateLimitRow> = new EntitySchema<AuthRateLimitRow>({
  name: 'authRateLimit',
  tableName: 'auth_rate_limits',
  properties: {
    id: id(),
    key: { type: 'string', length: 255 },
    count: { type: 'integer' },
    lastRequest: { type: 'bigint', fieldName: 'last_request' },
  },
  uniques: [{ name: 'auth_rate_limits_key_unique', properties: ['key'] }],
});

export const authTableEntities: readonly EntitySchema[] = [
  AuthUser,
  AuthSession,
  AuthAccount,
  AuthVerification,
  AuthRateLimit,
];

const VERSION = '0.2.0';
const instantType = (dialect: string): 'timestamptz' | 'datetime' =>
  dialect === 'postgres' ? 'timestamptz' : 'datetime';

/** The steps of the five tables, one statement each (version 0.2.0). */
export const authTableSteps: readonly PluginMigrationStep[] = [
  authStep(VERSION, 'users-create', async (trx, dialect) => {
    await trx.schema
      .createTable('auth_users')
      .addColumn('id', uuidType(dialect), (c) => c.notNull())
      .addColumn('name', 'varchar(200)', (c) => c.notNull())
      .addColumn('email', 'varchar(254)', (c) => c.notNull())
      .addColumn('email_verified', 'boolean', (c) => c.notNull())
      .addColumn('image', 'varchar(500)')
      .addColumn('created_at', instantType(dialect), (c) => c.notNull())
      .addColumn('updated_at', instantType(dialect), (c) => c.notNull())
      .addPrimaryKeyConstraint('auth_users_pkey', ['id'])
      .addUniqueConstraint('auth_users_email_unique', ['email'])
      .execute();
  }),
  authStep(VERSION, 'sessions-create', async (trx, dialect) => {
    await trx.schema
      .createTable('auth_sessions')
      .addColumn('id', uuidType(dialect), (c) => c.notNull())
      .addColumn('user_id', uuidType(dialect), (c) => c.notNull())
      .addColumn('token', 'varchar(255)', (c) => c.notNull())
      .addColumn('expires_at', instantType(dialect), (c) => c.notNull())
      .addColumn('ip_address', 'varchar(64)')
      .addColumn('user_agent', 'varchar(500)')
      .addColumn('created_at', instantType(dialect), (c) => c.notNull())
      .addColumn('updated_at', instantType(dialect), (c) => c.notNull())
      .addPrimaryKeyConstraint('auth_sessions_pkey', ['id'])
      .addUniqueConstraint('auth_sessions_token_unique', ['token'])
      .addForeignKeyConstraint('auth_sessions_user_fk', ['user_id'], 'auth_users', ['id'], (c) => c.onDelete('cascade'))
      .execute();
  }),
  authStep(VERSION, 'sessions-user-index', async (trx) => {
    await trx.schema.createIndex('auth_sessions_user_index').on('auth_sessions').column('user_id').execute();
  }),
  authStep(VERSION, 'accounts-create', async (trx, dialect) => {
    await trx.schema
      .createTable('auth_accounts')
      .addColumn('id', uuidType(dialect), (c) => c.notNull())
      .addColumn('user_id', uuidType(dialect), (c) => c.notNull())
      .addColumn('external_account_ref', 'varchar(255)', (c) => c.notNull())
      .addColumn('provider_id', 'varchar(100)', (c) => c.notNull())
      .addColumn('access_token', 'text')
      .addColumn('refresh_token', 'text')
      .addColumn('id_token', 'text')
      .addColumn('access_token_expires_at', instantType(dialect))
      .addColumn('refresh_token_expires_at', instantType(dialect))
      .addColumn('scope', 'text')
      .addColumn('password', 'text')
      .addColumn('created_at', instantType(dialect), (c) => c.notNull())
      .addColumn('updated_at', instantType(dialect), (c) => c.notNull())
      .addPrimaryKeyConstraint('auth_accounts_pkey', ['id'])
      .addForeignKeyConstraint('auth_accounts_user_fk', ['user_id'], 'auth_users', ['id'], (c) => c.onDelete('cascade'))
      .execute();
  }),
  authStep(VERSION, 'accounts-user-index', async (trx) => {
    await trx.schema.createIndex('auth_accounts_user_index').on('auth_accounts').column('user_id').execute();
  }),
  authStep(VERSION, 'verifications-create', async (trx, dialect) => {
    await trx.schema
      .createTable('auth_verifications')
      .addColumn('id', uuidType(dialect), (c) => c.notNull())
      .addColumn('identifier', 'varchar(255)', (c) => c.notNull())
      .addColumn('value', 'text', (c) => c.notNull())
      .addColumn('expires_at', instantType(dialect), (c) => c.notNull())
      .addColumn('created_at', instantType(dialect), (c) => c.notNull())
      .addColumn('updated_at', instantType(dialect), (c) => c.notNull())
      .addPrimaryKeyConstraint('auth_verifications_pkey', ['id'])
      .execute();
  }),
  authStep(VERSION, 'verifications-identifier-index', async (trx) => {
    await trx.schema
      .createIndex('auth_verifications_identifier_index')
      .on('auth_verifications')
      .column('identifier')
      .execute();
  }),
  authStep(VERSION, 'rate-limits-create', async (trx, dialect) => {
    await trx.schema
      .createTable('auth_rate_limits')
      .addColumn('id', uuidType(dialect), (c) => c.notNull())
      .addColumn('key', 'varchar(255)', (c) => c.notNull())
      .addColumn('count', 'integer', (c) => c.notNull())
      .addColumn('last_request', 'bigint', (c) => c.notNull())
      .addPrimaryKeyConstraint('auth_rate_limits_pkey', ['id'])
      .addUniqueConstraint('auth_rate_limits_key_unique', ['key'])
      .execute();
  }),
];
