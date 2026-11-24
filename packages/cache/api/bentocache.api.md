<!--
  BieberKit

  @file        packages/cache/api/bentocache.api.md
  @description API report of @bieberkit/cache: its public surface, checked in CI and reviewed in pull requests.
  @author      Bieber Kieu <kieutrongthien@gmail.com>
  @generated   pnpm api:update
  @copyright   Copyright (c) 2026 Bieber Kieu
  @license     Apache-2.0

  Licensed under the Apache License, Version 2.0 (the "License");
  you may not use this file except in compliance with the License.
  You may obtain a copy of the License at

      http://www.apache.org/licenses/LICENSE-2.0

  Unless required by applicable law or agreed to in writing, software
  distributed under the License is distributed on an "AS IS" BASIS,
  WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
  See the License for the specific language governing permissions and
  limitations under the License.

  SPDX-License-Identifier: Apache-2.0
-->

# API report: @bieberkit/cache

Generated from the built declaration files by `pnpm api:update`. Do not edit by hand. A change here is a change to the public API and needs a changeset (spec section 22.3).

```ts
import { Logger, Metrics, Tracer } from "@bieberkit/core";
import { n as Cache } from "./cache-CvFo_4dY.js";
import { n as CacheEngine } from "./contract--ExGYgOW.js";
interface InstanceInfo {
  readonly policy: string;
  readonly maxmemoryBytes: number;
}
interface RedisInstanceConfig {
  readonly APP_ENV: string;
  readonly QUEUE_DRIVER: "sync" | "database" | "redis";
  readonly CACHE_DRIVER: "memory" | "file" | "database" | "redis";
  readonly REDIS_URL: string | undefined;
  readonly CACHE_REDIS_URL: string | undefined;
}
interface DoctorFinding {
  readonly id: string;
  readonly level: "ok" | "warning" | "error";
  readonly message: string;
  readonly fix?: string;
}
interface RedisInstanceChecks {
  readonly read?: (url: string) => Promise<InstanceInfo>;
}
export declare function describeInstance(url: string): string;
export declare function sameInstance(a: string, b: string): boolean;
export declare function readInstance(url: string): Promise<InstanceInfo>;
export declare function checkRedisInstances(config: RedisInstanceConfig, checks?: RedisInstanceChecks): Promise<DoctorFinding[]>;
type BentocacheEngineOptions = {
  readonly driver: "file";
  readonly directory: string;
} | {
  readonly driver: "redis";
  readonly url: string;
};
export declare function bentocacheEngine(options: BentocacheEngineOptions): CacheEngine;
export declare function checkEvictionPolicy(url: string): Promise<{
  readonly ok: boolean;
  readonly policy: string;
}>;
interface RedisSecondaryStorage {
  get(key: string): Promise<string | null>;
  getAndDelete(key: string): Promise<string | null>;
  increment(key: string, ttlSeconds: number): Promise<number>;
  set(key: string, value: string, ttlSeconds?: number): Promise<void>;
  delete(key: string): Promise<void>;
  close(): Promise<void>;
}
interface RedisSecondaryStorageOptions {
  readonly url: string;
  readonly prefix?: string;
}
export declare function redisSecondaryStorage(options: RedisSecondaryStorageOptions): RedisSecondaryStorage;
export interface CacheConfig {
  readonly CACHE_DRIVER: "memory" | "file" | "database" | "redis";
  readonly CACHE_PREFIX: string;
  readonly CACHE_REDIS_URL: string | undefined;
}
export interface CacheFromConfigOptions {
  readonly logger?: Logger;
  readonly tracer?: Tracer;
  readonly metrics?: Metrics;
  readonly directory?: string;
  readonly memoryTtlMs?: number;
}
export declare function engineFromConfig(config: CacheConfig, options?: CacheFromConfigOptions): CacheEngine;
export declare function createCacheFromConfig(config: CacheConfig, options?: CacheFromConfigOptions): Cache;
export type { BentocacheEngineOptions, DoctorFinding, InstanceInfo, RedisInstanceChecks, RedisInstanceConfig, RedisSecondaryStorage, RedisSecondaryStorageOptions };
```
