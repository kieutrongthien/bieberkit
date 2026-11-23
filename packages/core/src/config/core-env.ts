/**
 * BieberKit
 *
 * @file        packages/core/src/config/core-env.ts
 * @description The core environment keys of spec section 8.2, generated secrets and the production safety checks (CFG-07).
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

import { randomBytes } from 'node:crypto';
import { ConfigError, EnvValidationError } from '../errors/errors.ts';
import type { EnvProblem } from '../errors/errors.ts';
import type { LogLevel } from '../logging/levels.ts';
import { LOG_LEVELS } from '../logging/levels.ts';
import { DIALECTS } from './dialects.ts';
import type { Dialect } from './dialects.ts';
import { defineEnv, env, mergeEnv, readEnv } from './env.ts';
import type { EnvOwner, EnvSchema, EnvSource } from './env.ts';

export type AppEnv = 'development' | 'test' | 'production';

/** The keys as the schema reads them. Secrets that can be generated are optional here. */
export interface CoreEnvValues {
  APP_NAME: string;
  APP_ENV: AppEnv;
  APP_URL: string;
  APP_PORT: number;
  APP_KEY: string | undefined;
  APP_KEY_PREVIOUS: string | undefined;
  APP_SINGLE_NODE: boolean;
  AUTH_SECRET: string | undefined;
  LOG_LEVEL: LogLevel;
  TRUST_PROXY: boolean | number;
  DB_CONNECTION: Dialect | undefined;
  DATABASE_URL: string | undefined;
  DATABASE_READ_URLS: readonly string[];
  MIGRATE_DATABASE_URL: string | undefined;
  DB_POOL_MAX: number;
  REDIS_URL: string | undefined;
  CACHE_REDIS_URL: string | undefined;
  QUEUE_DRIVER: 'sync' | 'database' | 'redis';
  CACHE_DRIVER: 'memory' | 'file' | 'database' | 'redis';
  CACHE_PREFIX: string | undefined;
  STORAGE_DISK: 'local' | 's3';
  STORAGE_LOCAL_ROOT: string;
  S3_BUCKET: string | undefined;
  S3_REGION: string | undefined;
  S3_ENDPOINT: string | undefined;
  S3_ACCESS_KEY_ID: string | undefined;
  S3_SECRET_ACCESS_KEY: string | undefined;
  S3_FORCE_PATH_STYLE: boolean;
  MAIL_DRIVER: 'log' | 'smtp';
  SMTP_URL: string | undefined;
  MAIL_FROM: string | undefined;
  ERROR_REPORTER_DSN: string | undefined;
  ERROR_REPORTER_SAMPLE_PERCENT: number;
  OTEL_EXPORTER_OTLP_ENDPOINT: string | undefined;
  METRICS_PORT: number;
  API_DOCS_PUBLIC: boolean;
  SITE_URL: string | undefined;
  SITE_API_URL: string | undefined;
  SITE_SERVICE_TOKEN: string | undefined;
  SITE_REVALIDATE_SECRET: string | undefined;
}

/** The keys after defaults, generated secrets and fallbacks. */
export interface CoreEnv extends Omit<CoreEnvValues, 'APP_KEY' | 'AUTH_SECRET' | 'CACHE_PREFIX'> {
  APP_KEY: string;
  AUTH_SECRET: string;
  CACHE_PREFIX: string;
}

const list = env.custom<readonly string[]>('a comma-separated list', (raw) => ({
  value: raw
    .split(',')
    .map((item) => item.trim())
    .filter((item) => item !== ''),
}));

const trustProxy = env.custom<boolean | number>('true, false or a number of proxy hops', (raw) => {
  const lower = raw.toLowerCase();
  if (lower === 'true' || lower === '1') return { value: true };
  if (lower === 'false' || lower === '0') return { value: false };
  return /^\d+$/.test(raw) ? { value: Number(raw) } : undefined;
});

/** Section 8.2. Key order is the order of `.env.example`. */
export const coreEnv: EnvSchema<CoreEnvValues> = defineEnv({
  APP_NAME: env.string().default('bieberkit-app').describe('Name of the application'),
  APP_ENV: env.enum(['development', 'test', 'production']).default('development').describe('Run mode'),
  APP_URL: env.url().default('http://localhost:3000').describe('Public address, used for links, CORS and cookies'),
  APP_PORT: env.int({ min: 1, max: 65535 }).default(3000).describe('Port of the web role'),
  APP_KEY: env.base64().secret().optional().describe('Encryption and signing key, 32 or more random bytes in base64'),
  APP_KEY_PREVIOUS: env
    .base64()
    .secret()
    .optional()
    .describe('Previous key, still accepted for decryption during rotation'),
  APP_SINGLE_NODE: env
    .boolean()
    .default(false)
    .describe('Declares a one-server deployment, which allows local storage and the file cache in production'),
  AUTH_SECRET: env.string().secret().optional().describe('Session signing secret, 32 or more random bytes'),
  LOG_LEVEL: env.enum(LOG_LEVELS).default('info').describe('Lowest level that is written'),
  TRUST_PROXY: trustProxy
    .default(false)
    .describe('Trust the proxy headers: true, false or the number of hops. Required behind a load balancer'),
  DB_CONNECTION: env.enum(DIALECTS).optional().describe('Database dialect'),
  DATABASE_URL: env.string().secret().optional().describe('Database connection URL'),
  DATABASE_READ_URLS: list.default([]).describe('Read replicas, comma separated'),
  MIGRATE_DATABASE_URL: env
    .string()
    .secret()
    .optional()
    .describe('Schema-owning role, used only by the migrate role. Falls back to DATABASE_URL in development'),
  DB_POOL_MAX: env.int({ min: 1 }).default(10).describe('Connections per process'),
  REDIS_URL: env
    .url()
    .secret()
    .optional()
    .describe('Valkey or Redis for queue, sessions, locks and rate limits (noeviction)'),
  CACHE_REDIS_URL: env
    .url()
    .secret()
    .optional()
    .describe('Separate Valkey for the cache (allkeys-lru). Falls back to REDIS_URL in development'),
  QUEUE_DRIVER: env.enum(['sync', 'database', 'redis']).default('sync').describe('Queue driver'),
  CACHE_DRIVER: env.enum(['memory', 'file', 'database', 'redis']).default('file').describe('Cache driver'),
  CACHE_PREFIX: env.string().optional().describe('Isolates apps that share one Valkey. Defaults to APP_NAME'),
  STORAGE_DISK: env.enum(['local', 's3']).default('local').describe('Storage disk'),
  STORAGE_LOCAL_ROOT: env.string().default('./storage').describe('Folder of the local disk'),
  S3_BUCKET: env.string().optional().describe('S3 bucket'),
  S3_REGION: env.string().optional().describe('S3 region'),
  S3_ENDPOINT: env.string().optional().describe('S3 endpoint, for R2 and MinIO'),
  S3_ACCESS_KEY_ID: env.string().secret().optional().describe('S3 access key id'),
  S3_SECRET_ACCESS_KEY: env.string().secret().optional().describe('S3 secret access key'),
  S3_FORCE_PATH_STYLE: env.boolean().default(false).describe('Path-style S3 addressing, for MinIO'),
  MAIL_DRIVER: env.enum(['log', 'smtp']).default('log').describe('Mail driver'),
  SMTP_URL: env.url().secret().optional().describe('SMTP connection URL'),
  MAIL_FROM: env.string().optional().describe('Default sender address'),
  ERROR_REPORTER_DSN: env
    .url()
    .secret()
    .optional()
    .describe('DSN of a Sentry, GlitchTip or Bugsink project. Errors are not sent when empty'),
  ERROR_REPORTER_SAMPLE_PERCENT: env
    .int({ min: 0, max: 100 })
    .default(100)
    .describe('Share of error reports that is sent, in percent. Fatal ones are always sent'),
  OTEL_EXPORTER_OTLP_ENDPOINT: env.url().optional().describe('OpenTelemetry endpoint. Tracing is off when empty'),
  METRICS_PORT: env.int({ min: 1, max: 65535 }).default(9464).describe('Prometheus endpoint, on its own port'),
  API_DOCS_PUBLIC: env.boolean().default(false).describe('Serve openapi.json publicly in production'),
  SITE_URL: env.url().optional().describe('Public address of the site'),
  SITE_API_URL: env.url().optional().describe('Internal address of the API, called by the site'),
  SITE_SERVICE_TOKEN: env.string().secret().optional().describe('Site to API authentication, 32 or more random bytes'),
  SITE_REVALIDATE_SECRET: env
    .string()
    .secret()
    .optional()
    .describe('Secret for cache purge calls from the API to the site'),
});

export interface ReadCoreEnvOptions {
  /** Schemas of plugins, merged with the core keys. */
  readonly extra?: readonly EnvOwner[];
  /** Source of generated secrets. Tests pass a fixed one. */
  readonly random?: () => string;
}

export interface CoreEnvResult {
  readonly env: CoreEnv;
  /** Values of the keys of `extra`. */
  readonly extra: Readonly<Record<string, unknown>>;
  readonly warnings: readonly string[];
}

const defaultRandom = (): string => randomBytes(32).toString('base64');

function attempt<T>(read: () => T, problems: EnvProblem[]): T | undefined {
  try {
    return read();
  } catch (error) {
    if (error instanceof EnvValidationError) {
      problems.push(...error.problems);
      return undefined;
    }
    throw error;
  }
}

function isSet(source: EnvSource, name: string): boolean {
  const value = source[name];
  return value !== undefined && value !== '';
}

/**
 * Reads the core keys and the keys of plugins, and applies the rules that need more than one key:
 * generated secrets, fallbacks and the cache prefix. All problems come together in one error.
 */
export function readCoreEnv(source: EnvSource, options: ReadCoreEnvOptions = {}): CoreEnvResult {
  const extra = options.extra ?? [];
  const random = options.random ?? defaultRandom;
  // Merging with the core first reports a duplicate key or a missing prefix before anything is read.
  mergeEnv([{ name: 'core', schema: coreEnv }, ...extra]);
  const problems: EnvProblem[] = [];
  const values = attempt(() => readEnv(coreEnv, source), problems);
  const extraValues = extra.length === 0 ? {} : attempt(() => readEnv(mergeEnv(extra), source), problems);

  const production = (values?.APP_ENV ?? source['APP_ENV']) === 'production';
  const mustHave = [
    'APP_KEY',
    'AUTH_SECRET',
    ...(isSet(source, 'SITE_URL') ? ['SITE_SERVICE_TOKEN', 'SITE_REVALIDATE_SECRET'] : []),
  ];
  if (production) {
    for (const name of mustHave) {
      if (isSet(source, name)) continue;
      problems.push({
        key: name,
        code: 'CFG_ENV_MISSING',
        message: `${name} is required in production.`,
        fix: `Set ${name}. Generate one with: openssl rand -base64 32`,
      });
    }
  }
  if (problems.length > 0 || values === undefined || extraValues === undefined) throw new EnvValidationError(problems);

  const warnings: string[] = [];
  const generated = (name: 'APP_KEY' | 'AUTH_SECRET'): string => {
    const given = values[name];
    if (given !== undefined) return given;
    warnings.push(
      `${name} is not set. A random value is used for this run, so sessions and encrypted data do not survive a restart.`,
    );
    return random();
  };
  const quiet = (given: string | undefined): string | undefined => given ?? (production ? undefined : random());

  return {
    env: {
      ...values,
      APP_KEY: generated('APP_KEY'),
      AUTH_SECRET: generated('AUTH_SECRET'),
      CACHE_PREFIX: values.CACHE_PREFIX ?? values.APP_NAME,
      CACHE_REDIS_URL: values.CACHE_REDIS_URL ?? (production ? undefined : values.REDIS_URL),
      MIGRATE_DATABASE_URL: values.MIGRATE_DATABASE_URL ?? (production ? undefined : values.DATABASE_URL),
      SITE_SERVICE_TOKEN: quiet(values.SITE_SERVICE_TOKEN),
      SITE_REVALIDATE_SECRET: quiet(values.SITE_REVALIDATE_SECRET),
    },
    extra: extraValues,
    warnings,
  };
}

/** Refuses unsafe settings in production (CFG-07). All problems are reported together. Does nothing in other modes. */
export function assertProductionSafe(values: CoreEnv): void {
  if (values.APP_ENV !== 'production') return;
  const problems: { readonly message: string; readonly fix: string }[] = [];
  const oneServer = 'Use a shared service, or set APP_SINGLE_NODE=true if one server is intended.';
  if (values.STORAGE_DISK === 'local' && !values.APP_SINGLE_NODE) {
    problems.push({
      message: 'STORAGE_DISK=local needs APP_SINGLE_NODE=true in production.',
      fix: `Set STORAGE_DISK=s3. ${oneServer}`,
    });
  }
  if ((values.CACHE_DRIVER === 'memory' || values.CACHE_DRIVER === 'file') && !values.APP_SINGLE_NODE) {
    problems.push({
      message: `CACHE_DRIVER=${values.CACHE_DRIVER} needs APP_SINGLE_NODE=true in production.`,
      fix: `Set CACHE_DRIVER=redis. ${oneServer}`,
    });
  }
  if (values.QUEUE_DRIVER === 'sync') {
    problems.push({
      message: 'QUEUE_DRIVER=sync runs jobs inside the request and is not allowed in production.',
      fix: 'Set QUEUE_DRIVER=redis or QUEUE_DRIVER=database.',
    });
  }
  if (Buffer.from(values.APP_KEY, 'base64').length < 32) {
    problems.push({
      message: 'APP_KEY is shorter than 32 bytes.',
      fix: 'Generate a new one with: openssl rand -base64 32',
    });
  }
  if (Buffer.byteLength(values.AUTH_SECRET) < 32) {
    problems.push({
      message: 'AUTH_SECRET is shorter than 32 bytes.',
      fix: 'Generate a new one with: openssl rand -base64 32',
    });
  }
  if (problems.length === 0) return;
  throw new ConfigError(problems.map((problem) => problem.message).join('\n'), {
    code: 'CFG_UNSAFE_PRODUCTION',
    safeMessage: 'The server is not configured safely for production.',
    fix: problems.map((problem) => problem.fix).join('\n'),
  });
}
