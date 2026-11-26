/**
 * BieberKit
 *
 * @file        plugins/media/src/index.ts
 * @description The media plugin: files of a tenant in the storage, with signed uploads, read URLs, folders, limits and deletion after commit (S-01, S-02, MED-01 to MED-08).
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

import { definePlugin, env } from '@bieberkit/core';
import type { PluginDef } from '@bieberkit/core';
import { Folder, Media } from './entity.ts';
import { routes } from './routes.ts';
import {
  createMediaService,
  DEFAULT_ALLOWED_TYPES,
  deleteObjectJob,
  prunePendingJob,
  subscriptions,
} from './service.ts';
import type { MediaService } from './service.ts';

export { Folder, Media } from './entity.ts';
export { DEFAULT_ALLOWED_TYPES, deleteObjectJob, kindOf, pathOf, prunePendingJob } from './service.ts';
export type { FolderView, MediaLimits, MediaService, MediaView } from './service.ts';

declare module '@bieberkit/core' {
  interface ServiceRegistry {
    /** The files of the tenant of the request (MED-01 to MED-08). */
    media: MediaService;
  }
}

const MB = 1024 * 1024;

/** A whole number from the env, or the default. The test app hands values over as they were given. */
const numberOf = (value: unknown, fallback: number | undefined): number | undefined =>
  typeof value === 'number' ? value : typeof value === 'string' && /^\d+$/.test(value) ? Number(value) : fallback;

const typesOf = (value: unknown): readonly string[] =>
  Array.isArray(value)
    ? value.map(String)
    : typeof value === 'string' && value.trim() !== ''
      ? value
          .split(',')
          .map((type) => type.trim().toLowerCase())
          .filter((type) => type !== '')
      : DEFAULT_ALLOWED_TYPES;

const MIME = /^[a-z0-9][a-z0-9!#$&^_.+-]*\/[a-z0-9][a-z0-9!#$&^_.+-]*$/;

import pkg from '../package.json' with { type: 'json' };

const plugin: PluginDef = definePlugin({
  name: '@bieberkit/plugin-media',
  version: pkg.version,
  core: '*',
  dialects: ['postgres', 'mysql', 'sqlite'],
  env: {
    MEDIA_MAX_SIZE_MB: env
      .int({ min: 1, max: 5120 })
      .default(25)
      .describe('The largest file, in MB, checked before a signed upload URL is given (MED-07)'),
    MEDIA_ALLOWED_TYPES: env
      .custom<readonly string[]>('a comma-separated list of MIME types', (text) => {
        const types = typesOf(text);
        return types.length > 0 && types.every((type) => MIME.test(type)) ? { value: types } : undefined;
      })
      .default(DEFAULT_ALLOWED_TYPES)
      .describe('The MIME types that may be uploaded (MED-07). Defaults to images, PDF, text, CSV and Office files'),
    MEDIA_TENANT_QUOTA_MB: env
      .int({ min: 1 })
      .optional()
      .describe('The MB of files that one tenant may hold. No quota when unset (MED-07)'),
    MEDIA_PENDING_TTL_HOURS: env
      .int({ min: 1, max: 8760 })
      .default(24)
      .describe('Hours that a file may wait for its upload before the prune job deletes it (MED-03)'),
  },
  permissions: ['media.read', 'media.upload', 'media.manage'],
  entities: [Media, Folder],
  routes,
  jobs: [deleteObjectJob, prunePendingJob],
  subscriptions,
  schedules: [{ job: prunePendingJob, cron: '41 * * * *' }],
  services: {
    media: {
      scope: 'singleton',
      deps: ['database', 'storage', 'pluginEnv'],
      create: (services) => {
        const values = services.pluginEnv;
        const quota = numberOf(values['MEDIA_TENANT_QUOTA_MB'], undefined);
        return createMediaService({
          db: services.database,
          storage: services.storage,
          limits: {
            maxBytes: (numberOf(values['MEDIA_MAX_SIZE_MB'], 25) ?? 25) * MB,
            allowedTypes: typesOf(values['MEDIA_ALLOWED_TYPES']),
            ...(quota === undefined ? {} : { quotaBytes: quota * MB }),
          },
          pendingTtlHours: numberOf(values['MEDIA_PENDING_TTL_HOURS'], 24) ?? 24,
        });
      },
    },
  },
});

export default plugin;
