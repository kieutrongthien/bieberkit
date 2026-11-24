<!--
  BieberKit

  @file        packages/queue/api/index.api.md
  @description API report of @bieberkit/queue: its public surface, checked in CI and reviewed in pull requests.
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

# API report: @bieberkit/queue

Generated from the built declaration files by `pnpm api:update`. Do not edit by hand. A change here is a change to the public API and needs a changeset (spec section 22.3).

```ts
import { Database, OutboxDispatcher, OutboxDispatcherOptions } from "@bieberkit/data/orm";
import { ErrorReporter, Logger, Metrics, Tracer } from "@bieberkit/core";
import { PluginMigrationStep } from "@bieberkit/data";
import { _ as WorkerOptions, a as JobContext, b as queueError, c as JobResult, d as Queue, f as QueueError, g as Worker, i as Dispatched, l as JobStatus, m as QueueStats, n as DeadLetterPage, o as JobDef, p as QueueName, r as DispatchOptions, s as JobInput, t as DeadJob, u as QUEUE_NAMES, v as defaultBackoffMs, y as defineJob } from "./contract-DjjfZ0pN.js";
interface Cron {
  matches(date: Date): boolean;
}
export declare function parseCron(expression: string): Cron;
export declare function registerOutbox(db: Database, queue: Queue, options?: Omit<OutboxDispatcherOptions, "publisher"> & {
  readonly logger?: Logger;
}): OutboxDispatcher;
interface WorkerPoolOptions {
  readonly size?: number;
  readonly maxQueued?: number;
  readonly idleMs?: number;
  readonly maxHeapMb?: number;
  readonly logger?: Logger;
}
interface RunOptions {
  readonly timeoutMs?: number;
  readonly signal?: AbortSignal;
  readonly transfer?: readonly ArrayBuffer[];
}
interface PoolStats {
  readonly threads: number;
  readonly busy: number;
  readonly queued: number;
  readonly completed: number;
  readonly failed: number;
}
interface WorkerPool {
  run<Result = unknown>(task: string | URL, input: unknown, options?: RunOptions): Promise<Result>;
  stats(): PoolStats;
  close(): Promise<void>;
}
export declare function createWorkerPool(options?: WorkerPoolOptions): WorkerPool;
interface CreateQueueOptions {
  readonly driver: "sync" | "database";
  readonly jobs: readonly JobDef[];
  readonly db?: Database;
  readonly logger?: Logger;
  readonly errorReporter?: ErrorReporter;
  readonly tracer?: Tracer;
  readonly metrics?: Metrics;
  readonly now?: () => number;
}
export declare function createQueue(options: CreateQueueOptions): Promise<Queue>;
interface Schedule<Input = unknown> {
  readonly name: string;
  readonly cron: string;
  readonly job: JobDef<Input>;
  readonly input: Input;
}
interface Scheduler {
  tick(at?: Date): Promise<readonly string[]>;
  start(): void;
  stop(): Promise<void>;
}
interface SchedulerOptions {
  readonly db: Database;
  readonly owner?: string;
  readonly lockMs?: number;
  readonly now?: () => number;
}
export declare function createScheduler(queue: Queue, schedules: readonly Schedule[], options: SchedulerOptions): Promise<Scheduler>;
export declare const QUEUE_PLUGIN = "@bieberkit/queue";
export declare const JOBS_TABLE = "bk_jobs";
export declare const LOCKS_TABLE = "bk_locks";
export declare const queueMigrationSteps: readonly PluginMigrationStep[];
export declare const packageName = "@bieberkit/queue";
declare module "@bieberkit/core" {
  interface ModuleContributions {
    jobs?: readonly JobDef[];
  }
}
declare module "@bieberkit/core" {
  interface ServiceRegistry {
    queue: Queue;
  }
}
export { type CreateQueueOptions, type Cron, type DeadJob, type DeadLetterPage, type DispatchOptions, type Dispatched, type JobContext, type JobDef, type JobInput, type JobResult, type JobStatus, type PoolStats, QUEUE_NAMES, type Queue, QueueError, type QueueName, type QueueStats, type RunOptions, type Schedule, type Scheduler, type SchedulerOptions, type Worker, type WorkerOptions, type WorkerPool, type WorkerPoolOptions, defaultBackoffMs, defineJob, queueError };
```
