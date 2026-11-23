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
import { Logger } from "@bieberkit/core";
import { PluginMigrationStep } from "@bieberkit/data";
import { _ as queueError, a as JobContext, c as QUEUE_NAMES, d as QueueName, f as QueueStats, g as defineJob, h as defaultBackoffMs, i as Dispatched, l as Queue, m as WorkerOptions, n as DeadLetterPage, o as JobDef, p as Worker, r as DispatchOptions, s as JobInput, t as DeadJob, u as QueueError } from "./contract-xjWeN5XP.js";
interface Cron {
  matches(date: Date): boolean;
}
export declare function parseCron(expression: string): Cron;
export declare function registerOutbox(db: Database, queue: Queue, options?: Omit<OutboxDispatcherOptions, "publisher"> & {
  readonly logger?: Logger;
}): OutboxDispatcher;
interface CreateQueueOptions {
  readonly driver: "sync" | "database";
  readonly jobs: readonly JobDef[];
  readonly db?: Database;
  readonly logger?: Logger;
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
export { type CreateQueueOptions, type Cron, type DeadJob, type DeadLetterPage, type DispatchOptions, type Dispatched, type JobContext, type JobDef, type JobInput, QUEUE_NAMES, type Queue, QueueError, type QueueName, type QueueStats, type Schedule, type Scheduler, type SchedulerOptions, type Worker, type WorkerOptions, defaultBackoffMs, defineJob, queueError };
```
