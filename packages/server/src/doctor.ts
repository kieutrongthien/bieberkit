/**
 * BieberKit
 *
 * @file        packages/server/src/doctor.ts
 * @description Checks that the services of a project answer: the environment, the database, Valkey, the mail server and the storage, each with a stable name and what to do (section 5.2).
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

import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { createLogger, loadEnv } from '@bieberkit/core';
import type { CoreEnv, EnvSource } from '@bieberkit/core';
import { checkRedisInstances } from '@bieberkit/cache/bentocache';
import { createDatabase } from '@bieberkit/data/orm';
import { createMailerFromConfig } from '@bieberkit/mail/nodemailer';
import { createQueue } from '@bieberkit/queue';
import { envOwnersOf, loadProject } from './project.ts';

export interface Finding {
  /** A stable name, for example `database` or `redis.queue.policy`. */
  readonly id: string;
  readonly level: 'ok' | 'warning' | 'error';
  readonly message: string;
  /** What to do. Present for a warning and an error. */
  readonly fix?: string;
}

export interface DoctorOptions {
  readonly cwd?: string;
  readonly env?: EnvSource;
}

const message = (error: unknown): string =>
  error instanceof Error ? (error.message.split('\n')[0] ?? '') : String(error);

async function checkDatabase(env: CoreEnv): Promise<Finding> {
  if (env.DATABASE_URL === undefined) {
    return {
      id: 'database',
      level: 'error',
      message: 'DATABASE_URL is not set.',
      fix: 'Set DATABASE_URL, for example postgres://user:password@localhost:5432/app.',
    };
  }
  try {
    const db = await createDatabase(env, { entities: [] });
    try {
      await db.orm.em.getConnection().execute('select 1');
    } finally {
      await db.close();
    }
    return { id: 'database', level: 'ok', message: `The ${env.DB_CONNECTION ?? 'database'} database answers.` };
  } catch (error) {
    return {
      id: 'database',
      level: 'error',
      message: `The database does not answer: ${message(error)}`,
      fix: 'Start it (bieberkit dev starts the services of compose.yaml) and check DATABASE_URL.',
    };
  }
}

async function checkMail(env: CoreEnv): Promise<Finding> {
  if (env.MAIL_DRIVER !== 'smtp')
    return { id: 'mail', level: 'ok', message: `MAIL_DRIVER=${env.MAIL_DRIVER}: nothing to reach.` };
  try {
    const mailer = createMailerFromConfig(env, { logger: createLogger({ level: 'error', role: 'doctor' }) });
    const queue = await createQueue({ driver: 'sync', jobs: [mailer.job] });
    await mailer.over(queue).verify();
    return { id: 'mail', level: 'ok', message: 'The SMTP server answers.' };
  } catch (error) {
    return {
      id: 'mail',
      level: 'error',
      message: `The SMTP server does not answer: ${message(error)}`,
      fix: 'Check SMTP_URL, and that the server accepts the login.',
    };
  }
}

function checkStorage(env: CoreEnv, root: string): Finding {
  if (env.STORAGE_DISK === 'local') {
    const folder = resolve(root, env.STORAGE_LOCAL_ROOT);
    return existsSync(folder)
      ? { id: 'storage', level: 'ok', message: `The local disk is ${folder}.` }
      : {
          id: 'storage',
          level: 'warning',
          message: `${folder} does not exist yet.`,
          fix: 'It is made when the first file is written. Make it now if the process runs as another user.',
        };
  }
  const missing = ['S3_BUCKET', 'S3_REGION', 'S3_ACCESS_KEY_ID', 'S3_SECRET_ACCESS_KEY'].filter(
    (key) => Reflect.get(env, key) === undefined,
  );
  return missing.length === 0
    ? { id: 'storage', level: 'ok', message: `The S3 disk is configured (bucket ${String(env.S3_BUCKET)}).` }
    : {
        id: 'storage',
        level: 'error',
        message: `STORAGE_DISK=s3 needs ${missing.join(', ')}.`,
        fix: `Set ${missing.join(', ')}.`,
      };
}

/** Every check, in a fixed order. The environment comes first, because the others need it. A check that cannot run says why and does not stop the rest. */
export async function diagnose(options: DoctorOptions = {}): Promise<Finding[]> {
  const project = await loadProject(options.cwd ?? process.cwd());
  let env: CoreEnv;
  try {
    ({ env } = loadEnv({
      ...(options.env === undefined ? {} : { source: options.env }),
      envFile: join(project.root, '.env'),
      extra: envOwnersOf(project),
    }));
  } catch (error) {
    return [{ id: 'env', level: 'error', message: message(error), fix: 'Run: bieberkit env:check' }];
  }
  const redis = await checkRedisInstances(env);
  return [
    { id: 'env', level: 'ok', message: 'The environment is valid.' },
    await checkDatabase(env),
    ...redis,
    await checkMail(env),
    checkStorage(env, project.root),
  ];
}
