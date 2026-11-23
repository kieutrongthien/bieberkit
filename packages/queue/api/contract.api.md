<!--
  BieberKit

  @file        packages/queue/api/contract.api.md
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
import { BkError, Logger } from "@bieberkit/core";
import { OutboxMessage, OutboxPublisher } from "@bieberkit/data/orm";
import { SchemaValue } from "@bieberkit/data";
declare const QUEUE_NAMES: readonly ["critical", "default", "reports"];
type QueueName = (typeof QUEUE_NAMES)[number];
declare class QueueError extends BkError {}
declare function queueError(code: string, status: number, message: string, fix: string): QueueError;
interface JobContext {
  readonly jobId: string;
  readonly attempt: number;
  readonly tenantId?: string;
  readonly userId?: string;
  readonly requestId: string;
  readonly log: Logger;
}
interface JobInput<Input> {
  readonly name: string;
  readonly queue?: QueueName;
  readonly input: SchemaValue;
  readonly attempts?: number;
  readonly backoffMs?: (attempt: number) => number;
  readonly timeoutMs?: number;
  handler(input: Input, context: JobContext): Promise<void> | void;
}
interface JobDef<Input = unknown> {
  readonly kind: "job";
  readonly name: string;
  readonly queue: QueueName;
  readonly input: SchemaValue;
  readonly attempts: number;
  readonly backoffMs: (attempt: number) => number;
  readonly timeoutMs: number;
  handler(input: Input, context: JobContext): Promise<void> | void;
}
interface DispatchOptions {
  readonly jobId?: string;
  readonly delayMs?: number;
  readonly queue?: QueueName;
}
interface Dispatched {
  readonly id: string;
  readonly duplicate: boolean;
}
interface DeadJob {
  readonly id: string;
  readonly name: string;
  readonly queue: QueueName;
  readonly input: unknown;
  readonly error: string;
  readonly attempts: number;
  readonly tenantId?: string;
  readonly diedAt: number;
}
interface DeadLetterPage {
  readonly jobs: DeadJob[];
  readonly nextCursor: string | null;
}
type QueueStats = Readonly<Record<QueueName, Readonly<Record<"waiting" | "active" | "done" | "dead", number>>>>;
interface WakeSource {
  listen(onWake: (queue: QueueName | undefined) => void): Promise<() => Promise<void>>;
}
interface WorkerOptions {
  readonly queues?: readonly QueueName[];
  readonly concurrency?: number | Partial<Readonly<Record<QueueName, number>>>;
  readonly pollMs?: number;
  readonly wake?: WakeSource;
  readonly leaseMs?: number;
  readonly heartbeatMs?: number;
  readonly stopTimeoutMs?: number;
}
interface Worker {
  start(): void;
  stop(): Promise<void>;
  crash(): void;
}
interface Queue {
  readonly driver: "sync" | "database";
  dispatch<Input>(job: JobDef<Input>, input: Input, options?: DispatchOptions): Promise<Dispatched>;
  subscribe<Input>(event: string, job: JobDef<Input>, map?: (message: OutboxMessage) => Input): void;
  readonly publisher: OutboxPublisher;
  createWorker(options?: WorkerOptions): Worker;
  deadLetters(options?: {
    queue?: QueueName;
    limit?: number;
    cursor?: string;
  }): Promise<DeadLetterPage>;
  retry(jobId: string): Promise<void>;
  discard(jobId: string): Promise<void>;
  stats(): Promise<QueueStats>;
  purge(options?: {
    olderThanMs?: number;
  }): Promise<number>;
  close(): Promise<void>;
}
declare const defaultBackoffMs: (attempt: number) => number;
declare function defineJob<Input = unknown>(job: JobInput<Input>): JobDef<Input>;
export { defineJob as _, JobContext as a, QUEUE_NAMES as c, QueueName as d, QueueStats as f, defaultBackoffMs as g, WorkerOptions as h, Dispatched as i, Queue as l, Worker as m, DeadLetterPage as n, JobDef as o, WakeSource as p, DispatchOptions as r, JobInput as s, DeadJob as t, QueueError as u, queueError as v };
```
