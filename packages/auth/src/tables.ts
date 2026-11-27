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
import type { OptionalProps } from '@mikro-orm/core';
import { uuid7 } from '@bieberkit/data';
import type { PluginMigrationStep } from '@bieberkit/data';
import { Uuid7Type, uuidType } from '@bieberkit/data/orm';
import { authStep } from './plugin.ts';
import { sql } from 'kysely';

export interface AuthUserRow {
  [OptionalProps]?: 'source';
  id: string;
  name: string;
  email: string;
  emailVerified: boolean;
  image?: string | null;
  /** Set by the two factor plugin. Empty until a user has turned it on or off. */
  twoFactorEnabled?: boolean | null;
  disabledAt?: Date | null;
  disabledReason?: string | null;
  disabledBy?: string | null;
  /** The identity provider; defaults to local when a row is created. */
  source: string;
  externalId?: string | null;
  /** Written by the session-create hook. Sessions are deleted on revoke and expiry, so they cannot tell this. */
  lastSignInAt?: Date | null;
  /** Set when the user is deleted: the row stays, anonymized, so foreign keys and audit actors stay valid (USR-06). */
  deletedAt?: Date | null;
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

export interface AuthTwoFactorRow {
  id: string;
  userId: string;
  /** The TOTP secret, encrypted by Better Auth with the secret of the application. */
  secret: string;
  /** The backup codes, encrypted the same way. */
  backupCodes: string;
  verified?: boolean | null;
  failedVerificationCount?: number | null;
  lockedUntil?: Date | null;
}

export interface AuthPasskeyRow {
  id: string;
  userId: string;
  name?: string | null;
  publicKey: string;
  credentialID: string;
  counter: number;
  deviceType: string;
  backedUp: boolean;
  transports?: string | null;
  createdAt?: Date | null;
  aaguid?: string | null;
}

export interface AuthApiKeyRow {
  id: string;
  configId: string;
  name?: string | null;
  /** The first characters of the key, to recognise it in a list. */
  start?: string | null;
  /** The user who owns the key. */
  referenceId: string;
  prefix?: string | null;
  /** The hash of the key. The key itself is shown once and never stored. */
  key: string;
  refillInterval?: number | null;
  refillAmount?: number | null;
  lastRefillAt?: Date | null;
  enabled?: boolean | null;
  rateLimitEnabled?: boolean | null;
  rateLimitTimeWindow?: number | null;
  rateLimitMax?: number | null;
  requestCount?: number | null;
  remaining?: number | null;
  lastRequest?: Date | null;
  expiresAt?: Date | null;
  createdAt: Date;
  updatedAt: Date;
  permissions?: string | null;
  /** JSON: the tenant and the permission strings of the key (AUTH-07). */
  metadata?: string | null;
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
  tableName: 'bk_auth_users',
  properties: {
    id: id(),
    name: { type: 'string', length: 200 },
    email: { type: 'string', length: 254 },
    emailVerified: { type: 'boolean', fieldName: 'email_verified', onCreate: () => false },
    image: { type: 'string', length: 500, nullable: true },
    twoFactorEnabled: { type: 'boolean', fieldName: 'two_factor_enabled', nullable: true },
    disabledAt: { ...instant('disabled_at'), nullable: true },
    disabledReason: { type: 'string', length: 500, fieldName: 'disabled_reason', nullable: true },
    disabledBy: { type: Uuid7Type, fieldName: 'disabled_by', nullable: true },
    source: { type: 'string', length: 60, onCreate: () => 'local', default: 'local' },
    externalId: { type: 'string', length: 255, fieldName: 'external_id', nullable: true },
    lastSignInAt: { ...instant('last_sign_in_at'), nullable: true },
    deletedAt: { ...instant('deleted_at'), nullable: true },
    createdAt: instant('created_at'),
    updatedAt: instant('updated_at'),
  },
  uniques: [
    { name: 'bk_auth_users_email_unique', properties: ['email'] },
    { name: 'bk_auth_users_source_external_unique', properties: ['source', 'externalId'] },
  ],
});

// The relation is typed by the entity of the target, which the row type does not know, so the schema has no row type.
export const AuthSession: EntitySchema = new EntitySchema({
  name: 'authSession',
  tableName: 'bk_auth_sessions',
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
  uniques: [{ name: 'bk_auth_sessions_token_unique', properties: ['token'] }],
  indexes: [{ name: 'bk_auth_sessions_user_index', properties: ['userId'] }],
});

// The relation is typed by the entity of the target, which the row type does not know, so the schema has no row type.
export const AuthAccount: EntitySchema = new EntitySchema({
  name: 'authAccount',
  tableName: 'bk_auth_accounts',
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
  indexes: [{ name: 'bk_auth_accounts_user_index', properties: ['userId'] }],
});

export const AuthVerification: EntitySchema<AuthVerificationRow> = new EntitySchema<AuthVerificationRow>({
  name: 'authVerification',
  tableName: 'bk_auth_verifications',
  properties: {
    // Better Auth names some rows by a digest (the reservation of a single-use value), which is no UUID, so this id is text.
    id: { type: 'string', length: 64, primary: true, onCreate: () => uuid7() },
    identifier: { type: 'string', length: 255 },
    value: { type: 'text' },
    expiresAt: instant('expires_at'),
    createdAt: instant('created_at'),
    updatedAt: instant('updated_at'),
  },
  indexes: [{ name: 'bk_auth_verifications_identifier_index', properties: ['identifier'] }],
});

export const AuthRateLimit: EntitySchema<AuthRateLimitRow> = new EntitySchema<AuthRateLimitRow>({
  name: 'authRateLimit',
  tableName: 'bk_auth_rate_limits',
  properties: {
    id: id(),
    key: { type: 'string', length: 255 },
    count: { type: 'integer' },
    lastRequest: { type: 'bigint', fieldName: 'last_request' },
  },
  uniques: [{ name: 'bk_auth_rate_limits_key_unique', properties: ['key'] }],
});

/** A device that a user signed in from, by a hash of its user agent (POL-04). Not a Better Auth model. */
export const AuthKnownDevice: EntitySchema = new EntitySchema({
  name: 'authKnownDevice',
  tableName: 'bk_auth_known_devices',
  properties: {
    id: id(),
    userId: { kind: 'm:1', entity: () => AuthUser, mapToPk: true, fieldName: 'user_id', deleteRule: 'cascade' },
    fingerprint: { type: 'string', length: 64 },
    firstSeenAt: instant('first_seen_at'),
    lastSeenAt: instant('last_seen_at'),
  },
  uniques: [{ name: 'bk_auth_known_devices_user_fingerprint_unique', properties: ['userId', 'fingerprint'] }],
});

// Better Auth names the model `twoFactor` and the table option `twoFactorTable`; both are set to `authTwoFactor`.
export const AuthTwoFactor: EntitySchema = new EntitySchema({
  name: 'authTwoFactor',
  tableName: 'bk_auth_two_factors',
  properties: {
    id: id(),
    userId: { kind: 'm:1', entity: () => AuthUser, mapToPk: true, fieldName: 'user_id', deleteRule: 'cascade' },
    secret: { type: 'text' },
    backupCodes: { type: 'text', fieldName: 'backup_codes' },
    verified: { type: 'boolean', nullable: true },
    failedVerificationCount: { type: 'integer', fieldName: 'failed_verification_count', nullable: true },
    lockedUntil: { ...instant('locked_until'), nullable: true },
  },
  indexes: [{ name: 'bk_auth_two_factors_user_index', properties: ['userId'] }],
});

export const AuthPasskey: EntitySchema = new EntitySchema({
  name: 'authPasskey',
  tableName: 'bk_auth_passkeys',
  properties: {
    id: id(),
    userId: { kind: 'm:1', entity: () => AuthUser, mapToPk: true, fieldName: 'user_id', deleteRule: 'cascade' },
    name: { type: 'string', length: 255, nullable: true },
    publicKey: { type: 'text', fieldName: 'public_key' },
    credentialID: { type: 'string', length: 512, fieldName: 'credential_id' },
    counter: { type: 'integer' },
    deviceType: { type: 'string', length: 32, fieldName: 'device_type' },
    backedUp: { type: 'boolean', fieldName: 'backed_up' },
    transports: { type: 'string', length: 255, nullable: true },
    createdAt: { ...instant('created_at'), nullable: true },
    aaguid: { type: 'string', length: 64, nullable: true },
  },
  uniques: [{ name: 'bk_auth_passkeys_credential_unique', properties: ['credentialID'] }],
  indexes: [{ name: 'bk_auth_passkeys_user_index', properties: ['userId'] }],
});

export const AuthApiKey: EntitySchema = new EntitySchema({
  name: 'authApiKey',
  tableName: 'bk_auth_api_keys',
  properties: {
    id: id(),
    configId: { type: 'string', length: 64, fieldName: 'config_id' },
    name: { type: 'string', length: 255, nullable: true },
    start: { type: 'string', length: 32, nullable: true },
    referenceId: {
      kind: 'm:1',
      entity: () => AuthUser,
      mapToPk: true,
      fieldName: 'reference_id',
      deleteRule: 'cascade',
    },
    prefix: { type: 'string', length: 64, nullable: true },
    key: { type: 'string', length: 255 },
    refillInterval: { type: 'integer', fieldName: 'refill_interval', nullable: true },
    refillAmount: { type: 'integer', fieldName: 'refill_amount', nullable: true },
    lastRefillAt: { ...instant('last_refill_at'), nullable: true },
    enabled: { type: 'boolean', nullable: true },
    rateLimitEnabled: { type: 'boolean', fieldName: 'rate_limit_enabled', nullable: true },
    rateLimitTimeWindow: { type: 'integer', fieldName: 'rate_limit_time_window', nullable: true },
    rateLimitMax: { type: 'integer', fieldName: 'rate_limit_max', nullable: true },
    requestCount: { type: 'integer', fieldName: 'request_count', nullable: true },
    remaining: { type: 'integer', nullable: true },
    lastRequest: { ...instant('last_request'), nullable: true },
    expiresAt: { ...instant('expires_at'), nullable: true },
    createdAt: instant('created_at'),
    updatedAt: instant('updated_at'),
    permissions: { type: 'text', nullable: true },
    metadata: { type: 'text', nullable: true },
  },
  uniques: [{ name: 'bk_auth_api_keys_key_unique', properties: ['key'] }],
  indexes: [{ name: 'bk_auth_api_keys_user_index', properties: ['referenceId'] }],
});

export const authTableEntities: readonly EntitySchema[] = [
  AuthUser,
  AuthSession,
  AuthAccount,
  AuthVerification,
  AuthRateLimit,
  AuthTwoFactor,
  AuthPasskey,
  AuthApiKey,
  AuthKnownDevice,
];

const VERSION = '0.2.0';
const STRONG = '0.3.0';
const KEYS = '0.4.0';
const PROFILE = '0.5.0';
const LIFECYCLE = '0.6.0';
const NETWORK = '0.7.0';
const instantType = (dialect: string): 'timestamptz' | 'datetime' =>
  dialect === 'postgres' ? 'timestamptz' : 'datetime';

/** The steps of the five tables, one statement each (version 0.2.0). */
export const authTableSteps: readonly PluginMigrationStep[] = [
  authStep(VERSION, 'users-create', async (trx, dialect) => {
    await trx.schema
      .createTable('bk_auth_users')
      .addColumn('id', uuidType(dialect), (c) => c.notNull())
      .addColumn('name', 'varchar(200)', (c) => c.notNull())
      .addColumn('email', 'varchar(254)', (c) => c.notNull())
      .addColumn('email_verified', 'boolean', (c) => c.notNull())
      .addColumn('image', 'varchar(500)')
      .addColumn('created_at', instantType(dialect), (c) => c.notNull())
      .addColumn('updated_at', instantType(dialect), (c) => c.notNull())
      .addPrimaryKeyConstraint('bk_auth_users_pkey', ['id'])
      .addUniqueConstraint('bk_auth_users_email_unique', ['email'])
      .execute();
  }),
  authStep(VERSION, 'sessions-create', async (trx, dialect) => {
    await trx.schema
      .createTable('bk_auth_sessions')
      .addColumn('id', uuidType(dialect), (c) => c.notNull())
      .addColumn('user_id', uuidType(dialect), (c) => c.notNull())
      .addColumn('token', 'varchar(255)', (c) => c.notNull())
      .addColumn('expires_at', instantType(dialect), (c) => c.notNull())
      .addColumn('ip_address', 'varchar(64)')
      .addColumn('user_agent', 'varchar(500)')
      .addColumn('created_at', instantType(dialect), (c) => c.notNull())
      .addColumn('updated_at', instantType(dialect), (c) => c.notNull())
      .addPrimaryKeyConstraint('bk_auth_sessions_pkey', ['id'])
      .addUniqueConstraint('bk_auth_sessions_token_unique', ['token'])
      .addForeignKeyConstraint('bk_auth_sessions_user_fk', ['user_id'], 'bk_auth_users', ['id'], (c) =>
        c.onDelete('cascade'),
      )
      .execute();
  }),
  authStep(VERSION, 'sessions-user-index', async (trx) => {
    await trx.schema.createIndex('bk_auth_sessions_user_index').on('bk_auth_sessions').column('user_id').execute();
  }),
  authStep(VERSION, 'accounts-create', async (trx, dialect) => {
    await trx.schema
      .createTable('bk_auth_accounts')
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
      .addPrimaryKeyConstraint('bk_auth_accounts_pkey', ['id'])
      .addForeignKeyConstraint('bk_auth_accounts_user_fk', ['user_id'], 'bk_auth_users', ['id'], (c) =>
        c.onDelete('cascade'),
      )
      .execute();
  }),
  authStep(VERSION, 'accounts-user-index', async (trx) => {
    await trx.schema.createIndex('bk_auth_accounts_user_index').on('bk_auth_accounts').column('user_id').execute();
  }),
  authStep(VERSION, 'verifications-create', async (trx, dialect) => {
    await trx.schema
      .createTable('bk_auth_verifications')
      .addColumn('id', 'varchar(64)', (c) => c.notNull())
      .addColumn('identifier', 'varchar(255)', (c) => c.notNull())
      .addColumn('value', 'text', (c) => c.notNull())
      .addColumn('expires_at', instantType(dialect), (c) => c.notNull())
      .addColumn('created_at', instantType(dialect), (c) => c.notNull())
      .addColumn('updated_at', instantType(dialect), (c) => c.notNull())
      .addPrimaryKeyConstraint('bk_auth_verifications_pkey', ['id'])
      .execute();
  }),
  authStep(VERSION, 'verifications-identifier-index', async (trx) => {
    await trx.schema
      .createIndex('bk_auth_verifications_identifier_index')
      .on('bk_auth_verifications')
      .column('identifier')
      .execute();
  }),
  authStep(VERSION, 'rate-limits-create', async (trx, dialect) => {
    await trx.schema
      .createTable('bk_auth_rate_limits')
      .addColumn('id', uuidType(dialect), (c) => c.notNull())
      .addColumn('key', 'varchar(255)', (c) => c.notNull())
      .addColumn('count', 'integer', (c) => c.notNull())
      .addColumn('last_request', 'bigint', (c) => c.notNull())
      .addPrimaryKeyConstraint('bk_auth_rate_limits_pkey', ['id'])
      .addUniqueConstraint('bk_auth_rate_limits_key_unique', ['key'])
      .execute();
  }),
  // Version 0.3.0: the second factor and the passkeys.
  authStep(STRONG, 'users-two-factor-flag', async (trx) => {
    await trx.schema.alterTable('bk_auth_users').addColumn('two_factor_enabled', 'boolean').execute();
  }),
  authStep(STRONG, 'two-factors-create', async (trx, dialect) => {
    await trx.schema
      .createTable('bk_auth_two_factors')
      .addColumn('id', uuidType(dialect), (c) => c.notNull())
      .addColumn('user_id', uuidType(dialect), (c) => c.notNull())
      .addColumn('secret', 'text', (c) => c.notNull())
      .addColumn('backup_codes', 'text', (c) => c.notNull())
      .addColumn('verified', 'boolean')
      .addColumn('failed_verification_count', 'integer')
      .addColumn('locked_until', instantType(dialect))
      .addPrimaryKeyConstraint('bk_auth_two_factors_pkey', ['id'])
      .addForeignKeyConstraint('bk_auth_two_factors_user_fk', ['user_id'], 'bk_auth_users', ['id'], (c) =>
        c.onDelete('cascade'),
      )
      .execute();
  }),
  authStep(STRONG, 'two-factors-user-index', async (trx) => {
    await trx.schema
      .createIndex('bk_auth_two_factors_user_index')
      .on('bk_auth_two_factors')
      .column('user_id')
      .execute();
  }),
  authStep(STRONG, 'passkeys-create', async (trx, dialect) => {
    await trx.schema
      .createTable('bk_auth_passkeys')
      .addColumn('id', uuidType(dialect), (c) => c.notNull())
      .addColumn('user_id', uuidType(dialect), (c) => c.notNull())
      .addColumn('name', 'varchar(255)')
      .addColumn('public_key', 'text', (c) => c.notNull())
      .addColumn('credential_id', 'varchar(512)', (c) => c.notNull())
      .addColumn('counter', 'integer', (c) => c.notNull())
      .addColumn('device_type', 'varchar(32)', (c) => c.notNull())
      .addColumn('backed_up', 'boolean', (c) => c.notNull())
      .addColumn('transports', 'varchar(255)')
      .addColumn('created_at', instantType(dialect))
      .addColumn('aaguid', 'varchar(64)')
      .addPrimaryKeyConstraint('bk_auth_passkeys_pkey', ['id'])
      .addUniqueConstraint('bk_auth_passkeys_credential_unique', ['credential_id'])
      .addForeignKeyConstraint('bk_auth_passkeys_user_fk', ['user_id'], 'bk_auth_users', ['id'], (c) =>
        c.onDelete('cascade'),
      )
      .execute();
  }),
  authStep(STRONG, 'passkeys-user-index', async (trx) => {
    await trx.schema.createIndex('bk_auth_passkeys_user_index').on('bk_auth_passkeys').column('user_id').execute();
  }),
  // Version 0.4.0: the API keys.
  authStep(KEYS, 'api-keys-create', async (trx, dialect) => {
    await trx.schema
      .createTable('bk_auth_api_keys')
      .addColumn('id', uuidType(dialect), (c) => c.notNull())
      .addColumn('config_id', 'varchar(64)', (c) => c.notNull())
      .addColumn('name', 'varchar(255)')
      .addColumn('start', 'varchar(32)')
      .addColumn('reference_id', uuidType(dialect), (c) => c.notNull())
      .addColumn('prefix', 'varchar(64)')
      .addColumn('key', 'varchar(255)', (c) => c.notNull())
      .addColumn('refill_interval', 'integer')
      .addColumn('refill_amount', 'integer')
      .addColumn('last_refill_at', instantType(dialect))
      .addColumn('enabled', 'boolean')
      .addColumn('rate_limit_enabled', 'boolean')
      .addColumn('rate_limit_time_window', 'integer')
      .addColumn('rate_limit_max', 'integer')
      .addColumn('request_count', 'integer')
      .addColumn('remaining', 'integer')
      .addColumn('last_request', instantType(dialect))
      .addColumn('expires_at', instantType(dialect))
      .addColumn('created_at', instantType(dialect), (c) => c.notNull())
      .addColumn('updated_at', instantType(dialect), (c) => c.notNull())
      .addColumn('permissions', 'text')
      .addColumn('metadata', 'text')
      .addPrimaryKeyConstraint('bk_auth_api_keys_pkey', ['id'])
      .addUniqueConstraint('bk_auth_api_keys_key_unique', ['key'])
      .addForeignKeyConstraint('bk_auth_api_keys_user_fk', ['reference_id'], 'bk_auth_users', ['id'], (c) =>
        c.onDelete('cascade'),
      )
      .execute();
  }),
  authStep(KEYS, 'api-keys-user-index', async (trx) => {
    await trx.schema.createIndex('bk_auth_api_keys_user_index').on('bk_auth_api_keys').column('reference_id').execute();
  }),
  // Version 0.5.0: disabled users and provider-owned identities. Each step is one additive statement.
  authStep(PROFILE, 'users-disabled-at', async (trx, dialect) => {
    await trx.schema.alterTable('bk_auth_users').addColumn('disabled_at', instantType(dialect)).execute();
  }),
  authStep(PROFILE, 'users-disabled-reason', async (trx) => {
    await trx.schema.alterTable('bk_auth_users').addColumn('disabled_reason', 'varchar(500)').execute();
  }),
  authStep(PROFILE, 'users-disabled-by', async (trx, dialect) => {
    await trx.schema.alterTable('bk_auth_users').addColumn('disabled_by', uuidType(dialect)).execute();
  }),
  authStep(PROFILE, 'users-source', async (trx) => {
    await trx.schema
      .alterTable('bk_auth_users')
      .addColumn('source', 'varchar(60)', (column) => column.notNull().defaultTo('local'))
      .execute();
  }),
  authStep(PROFILE, 'users-external-id', async (trx) => {
    await trx.schema.alterTable('bk_auth_users').addColumn('external_id', 'varchar(255)').execute();
  }),
  authStep(PROFILE, 'users-source-external-index', async (trx) => {
    await trx.schema
      .createIndex('bk_auth_users_source_external_unique')
      .on('bk_auth_users')
      .columns(['source', 'external_id'])
      .unique()
      .execute();
  }),
  // Version 0.6.0: the life of an account (USR-01, USR-06). Each step is one additive statement.
  authStep(LIFECYCLE, 'users-last-sign-in-at', async (trx, dialect) => {
    await trx.schema.alterTable('bk_auth_users').addColumn('last_sign_in_at', instantType(dialect)).execute();
  }),
  authStep(LIFECYCLE, 'users-deleted-at', async (trx, dialect) => {
    await trx.schema.alterTable('bk_auth_users').addColumn('deleted_at', instantType(dialect)).execute();
  }),
  // The prefix search of the list on the name, in any case. The double parentheses are what MySQL needs for an index on an expression,
  // and PostgreSQL and SQLite read them as one expression.
  authStep(LIFECYCLE, 'users-name-lower-index', async (trx) => {
    await sql`create index bk_auth_users_name_lower_index on bk_auth_users ((lower(name)))`.execute(trx);
  }),
  // The sort of the users list by name (OPS-05), ending in the id that the list is ordered by.
  authStep(NETWORK, 'users-name-index', async (trx) => {
    await trx.schema.createIndex('bk_auth_users_name_index').on('bk_auth_users').columns(['name', 'id']).execute();
  }),
  // PostgreSQL reads a prefix search (`like 'an%'`) through an index only when the index has the pattern operator class (OPS-05).
  // MySQL and SQLite use the indexes above for it.
  authStep(NETWORK, 'users-name-lower-like-index', async (trx, dialect) => {
    if (dialect !== 'postgres') return;
    await sql`create index bk_auth_users_name_lower_like_index on bk_auth_users ((lower(name)) text_pattern_ops)`.execute(
      trx,
    );
  }),
  authStep(NETWORK, 'users-email-like-index', async (trx, dialect) => {
    if (dialect !== 'postgres') return;
    await sql`create index bk_auth_users_email_like_index on bk_auth_users (email varchar_pattern_ops)`.execute(trx);
  }),
  // Version 0.7.0: the groups of a user and a role assignment that is limited to one group (ROL-09).
  authStep(NETWORK, 'user-roles-scope-group', async (trx) => {
    await trx.schema.alterTable('bk_auth_user_roles').addColumn('scope_group', 'varchar(120)').execute();
  }),
  authStep(NETWORK, 'user-groups-create', async (trx, dialect) => {
    await trx.schema
      .createTable('bk_auth_user_groups')
      .addColumn('user_id', uuidType(dialect), (c) => c.notNull())
      .addColumn('group_id', 'varchar(120)', (c) => c.notNull())
      .addPrimaryKeyConstraint('bk_auth_user_groups_pkey', ['user_id', 'group_id'])
      .addForeignKeyConstraint('bk_auth_user_groups_user_fk', ['user_id'], 'bk_auth_users', ['id'], (c) =>
        c.onDelete('cascade'),
      )
      .execute();
  }),
  authStep(NETWORK, 'user-groups-group-index', async (trx) => {
    await trx.schema
      .createIndex('bk_auth_user_groups_group_index')
      .on('bk_auth_user_groups')
      .column('group_id')
      .execute();
  }),
  // Version 0.7.0: the devices of a user (POL-04) and a role that may be used only from the allowed networks (POL-03).
  authStep(NETWORK, 'known-devices-create', async (trx, dialect) => {
    await trx.schema
      .createTable('bk_auth_known_devices')
      .addColumn('id', uuidType(dialect), (c) => c.notNull())
      .addColumn('user_id', uuidType(dialect), (c) => c.notNull())
      .addColumn('fingerprint', 'varchar(64)', (c) => c.notNull())
      .addColumn('first_seen_at', instantType(dialect), (c) => c.notNull())
      .addColumn('last_seen_at', instantType(dialect), (c) => c.notNull())
      .addPrimaryKeyConstraint('bk_auth_known_devices_pkey', ['id'])
      .addUniqueConstraint('bk_auth_known_devices_user_fingerprint_unique', ['user_id', 'fingerprint'])
      .addForeignKeyConstraint('bk_auth_known_devices_user_fk', ['user_id'], 'bk_auth_users', ['id'], (c) =>
        c.onDelete('cascade'),
      )
      .execute();
  }),
  authStep(NETWORK, 'roles-ip-restricted', async (trx) => {
    await trx.schema
      .alterTable('bk_auth_roles')
      .addColumn('ip_restricted', 'boolean', (column) => column.notNull().defaultTo(false))
      .execute();
  }),
];
