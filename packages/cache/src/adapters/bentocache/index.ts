/**
 * BieberKit
 *
 * @file        packages/cache/src/adapters/bentocache/index.ts
 * @description Subpath @bieberkit/cache/bentocache: the engine on BentoCache drivers and the cache that CACHE_DRIVER selects.
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

import { createCache } from '../../cache.ts';
import type { Cache } from '../../cache.ts';
import { cacheError } from '../../contract.ts';
import type { CacheEngine } from '../../contract.ts';
import { createLayeredEngine } from '../../layered-engine.ts';
import { createMemoryEngine } from '../../memory-engine.ts';
import type { Logger } from '@bieberkit/core';
import { bentocacheEngine } from './engine.ts';

export { bentocacheEngine, checkEvictionPolicy } from './engine.ts';
export type { BentocacheEngineOptions } from './engine.ts';

/** The part of the validated config (`CoreEnv`) that decides the cache. */
export interface CacheConfig {
  readonly CACHE_DRIVER: 'memory' | 'file' | 'database' | 'redis';
  readonly CACHE_PREFIX: string;
  readonly CACHE_REDIS_URL: string | undefined;
}

export interface CacheFromConfigOptions {
  readonly logger?: Logger;
  /** Where the `file` driver keeps its files. Defaults to `.bieberkit/cache`. */
  readonly directory?: string;
  /** How long the memory level in front of Redis keeps a value. Defaults to 5 seconds (DATA-13). */
  readonly memoryTtlMs?: number;
}

/** The engine for `CACHE_DRIVER`. Switching the driver changes this and nothing in the application (C-02). */
export function engineFromConfig(config: CacheConfig, options: CacheFromConfigOptions = {}): CacheEngine {
  if (config.CACHE_DRIVER === 'memory') return createMemoryEngine();
  if (config.CACHE_DRIVER === 'file') {
    return bentocacheEngine({ driver: 'file', directory: options.directory ?? '.bieberkit/cache' });
  }
  if (config.CACHE_DRIVER === 'redis') {
    if (config.CACHE_REDIS_URL === undefined) {
      throw cacheError(
        'CACHE_CONFIG_INVALID',
        500,
        'CACHE_DRIVER=redis needs CACHE_REDIS_URL.',
        'Set CACHE_REDIS_URL to the Valkey of the cache. It is not the one of the queue (Q-08).',
      );
    }
    return createLayeredEngine({
      first: createMemoryEngine({ maxEntries: 10_000 }),
      shared: bentocacheEngine({ driver: 'redis', url: config.CACHE_REDIS_URL }),
      ...(options.memoryTtlMs === undefined ? {} : { firstTtlMs: options.memoryTtlMs }),
    });
  }
  throw cacheError(
    'CACHE_DRIVER_UNSUPPORTED',
    500,
    'CACHE_DRIVER=database has no engine yet.',
    'Use memory, file or redis.',
  );
}

export function createCacheFromConfig(config: CacheConfig, options: CacheFromConfigOptions = {}): Cache {
  return createCache({
    engine: engineFromConfig(config, options),
    prefix: config.CACHE_PREFIX,
    ...(options.logger === undefined ? {} : { logger: options.logger }),
  });
}
