/**
 * BieberKit
 *
 * @file        packages/data/src/orm/pool-metrics.ts
 * @description Reports the connections of the database pool, read when the metrics are scraped (OBS-03).
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

import type { Metrics } from '@bieberkit/core';

/** The part of an ORM that the pool report needs. */
interface PoolOwner {
  readonly em: { getConnection(): unknown };
}

/** A number that the pool says about itself, under the first of `names` that it has, or the length of the list that is under it. */
function figure(pool: unknown, names: readonly string[]): number | undefined {
  if (typeof pool !== 'object' || pool === null) return undefined;
  for (const name of names) {
    const value: unknown = Reflect.get(pool, name);
    if (typeof value === 'number') return value;
    if (Array.isArray(value)) return value.length;
  }
  return undefined;
}

/** The native pool of the connection: the `pg` pool, or the one of `mysql2`. SQLite has none. */
async function poolOf(owner: PoolOwner): Promise<unknown> {
  const connection = owner.em.getConnection();
  if (typeof connection !== 'object' || connection === null) return undefined;
  const get: unknown = Reflect.get(connection, 'getNativeClient');
  return typeof get === 'function' ? Reflect.apply(get, connection, []) : undefined;
}

/**
 * `bk_db_pool_connections{state}`: `in_use` (a query holds the connection), `idle` and `waiting` (a caller that waits for one). A
 * pool that is always full and has callers that wait is the first sign of a service that holds a transaction for too long.
 */
export function observePool(metrics: Metrics, owner: PoolOwner): void {
  metrics.collect(
    'bk_db_pool_connections',
    'Connections of the database pool by state.',
    { labels: ['state'] },
    async () => {
      const pool = await poolOf(owner);
      // `pg` says totalCount, idleCount and waitingCount. `mysql2` keeps lists of all, free and queued connections.
      const total = figure(pool, ['totalCount', '_allConnections']);
      const idle = figure(pool, ['idleCount', '_freeConnections']);
      const waiting = figure(pool, ['waitingCount', '_connectionQueue']);
      if (total === undefined || idle === undefined) return [];
      return [
        { labels: { state: 'in_use' }, value: Math.max(0, total - idle) },
        { labels: { state: 'idle' }, value: idle },
        { labels: { state: 'waiting' }, value: waiting ?? 0 },
      ];
    },
  );
}
