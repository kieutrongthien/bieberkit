/**
 * BieberKit
 *
 * @file        packages/data/src/orm/read-your-writes.ts
 * @description Read your own writes (DATA-13): for a short time after a user writes, the reads of that user go to the primary database and not to a replica that may be behind.
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

import { createLogger, requestContext } from '@bieberkit/core';
import type { Logger } from '@bieberkit/core';
import type { EntityManager } from '@mikro-orm/core';

/** How long after a write the reads of the same user go to the primary database. */
export const READ_YOUR_WRITES_MS: number = 5_000;

/**
 * Where "this user has written lately" is kept. With one process it can be a map. With several (the web role has replicas, and a user's
 * next request may go to another one) it has to be shared: `createCacheReadYourWrites` of `@bieberkit/cache` keeps it in the cache.
 */
export interface ReadYourWrites {
  /** Remembers that `userId` has written, for the window. */
  record(userId: string): Promise<void>;
  /** True when `userId` has written within the window. */
  recently(userId: string): Promise<boolean>;
}

export interface MemoryReadYourWritesOptions {
  readonly windowMs?: number;
  readonly now?: () => number;
}

/** The default: a map of this process, with the users that wrote in the last window. */
export function createMemoryReadYourWrites(options: MemoryReadYourWritesOptions = {}): ReadYourWrites {
  const windowMs = options.windowMs ?? READ_YOUR_WRITES_MS;
  const now = options.now ?? Date.now;
  const until = new Map<string, number>();
  return {
    async record(userId) {
      const at = now();
      until.set(userId, at + windowMs);
      if (until.size > 10_000) {
        for (const [key, expires] of until) if (expires <= at) until.delete(key);
      }
    },
    async recently(userId) {
      const expires = until.get(userId);
      if (expires === undefined) return false;
      if (expires <= now()) {
        until.delete(userId);
        return false;
      }
      return true;
    },
  };
}

let current: ReadYourWrites = createMemoryReadYourWrites();
let logger: Logger | undefined;
let lastWarning = 0;

/** Chooses where writes are remembered. One call at boot, before the first request; the default is the memory of the process. */
export function useReadYourWrites(port: ReadYourWrites): void {
  current = port;
}

function warn(message: string, error: unknown): void {
  const at = Date.now();
  if (at - lastWarning < 60_000) return;
  lastWarning = at;
  logger ??= createLogger({ level: 'warn', role: 'data' });
  logger.warn(message, { reason: error instanceof Error ? error.message : String(error) });
}

/**
 * Called after a commit. The user of the request, if there is one, is remembered. It is best effort: a store that is down must not fail a
 * write that is already committed, and the reads of that user only go to a replica a little sooner than they should.
 */
export async function recordWrite(): Promise<void> {
  const userId = requestContext.get()?.userId;
  if (userId === undefined) return;
  try {
    await current.record(userId);
  } catch (error) {
    warn('a write could not be remembered; reads of this user may go to a replica that is behind', error);
  }
}

/**
 * The connection for a read: a replica, unless the user of the request wrote within the window, or unless nobody can say. When the store
 * cannot answer, the primary is the safe choice: the read is right, and only a little slower for the primary.
 */
export async function readConnection(em: EntityManager): Promise<'read' | 'write'> {
  const replicas = em.config.get('replicas');
  if (!Array.isArray(replicas) || replicas.length === 0) return 'read';
  const userId = requestContext.get()?.userId;
  if (userId === undefined) return 'read';
  try {
    return (await current.recently(userId)) ? 'write' : 'read';
  } catch (error) {
    warn('the writes of a user could not be read; its reads go to the primary', error);
    return 'write';
  }
}
