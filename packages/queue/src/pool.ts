/**
 * BieberKit
 *
 * @file        packages/queue/src/pool.ts
 * @description A pool of worker threads for work that uses the CPU for long: a task is a module, it runs on a thread that is not the one of the event loop, and a task that hangs, crashes or runs out of memory costs one thread (Q-09).
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

import { availableParallelism } from 'node:os';
import { pathToFileURL } from 'node:url';
import { Worker } from 'node:worker_threads';
import type { Logger } from '@bieberkit/core';
import { QueueError } from './contract.ts';

export interface WorkerPoolOptions {
  /** Threads at most. Defaults to the number of cores minus one, between 1 and 4. */
  readonly size?: number;
  /** Tasks that may wait for a free thread. Defaults to 100. A task that does not fit is refused. */
  readonly maxQueued?: number;
  /** A thread that has no task for this long is ended. Defaults to 30 seconds. */
  readonly idleMs?: number;
  /** The limit of the heap of each thread, in MB. Defaults to 256. A task that passes it ends its thread, not the process. */
  readonly maxHeapMb?: number;
  readonly logger?: Logger;
}

export interface RunOptions {
  /** How long a task may run before its thread is ended. Defaults to 60 seconds. */
  readonly timeoutMs?: number;
  readonly signal?: AbortSignal;
  /** Buffers that move to the thread with the input, instead of being copied. */
  readonly transfer?: readonly ArrayBuffer[];
}

export interface PoolStats {
  readonly threads: number;
  readonly busy: number;
  readonly queued: number;
  readonly completed: number;
  readonly failed: number;
}

export interface WorkerPool {
  /**
   * Runs the default export of the module `task` with `input` on a thread, and answers what it returns. `task` is the URL or the absolute
   * path of a file of the project, never a value that a user can choose. The input and the result are copied (structured clone).
   */
  run<Result = unknown>(task: string | URL, input: unknown, options?: RunOptions): Promise<Result>;
  stats(): PoolStats;
  /** Refuses new tasks, fails the ones that wait, ends the threads. */
  close(): Promise<void>;
}

const fail = (code: string, status: number, message: string, fix: string, cause?: unknown): QueueError =>
  new QueueError(message, { code, status, fix, ...(cause === undefined ? {} : { cause }) });

/**
 * The code of each thread. It is a string, so that the pool works the same from the source and from the build, and needs no file next to
 * it. A thread takes one message at a time: the module of the task (a thread keeps what it imported), the input, and answers with the
 * result or with the error as plain data.
 */
const BOOTSTRAP = `
const { parentPort } = require('node:worker_threads');
parentPort.on('message', async ({ id, task, input }) => {
  try {
    const module = await import(task);
    if (typeof module.default !== 'function') throw new TypeError('The module of the task has no default function.');
    parentPort.postMessage({ id, ok: true, result: await module.default(input) });
  } catch (error) {
    const known = error !== null && typeof error === 'object';
    parentPort.postMessage({
      id,
      ok: false,
      name: known && typeof error.name === 'string' ? error.name : 'Error',
      message: known && typeof error.message === 'string' ? error.message : String(error),
      stack: known && typeof error.stack === 'string' ? error.stack : undefined,
    });
  }
});
`;

interface Pending {
  readonly task: string;
  readonly input: unknown;
  readonly options: RunOptions;
  readonly resolve: (value: unknown) => void;
  readonly reject: (error: unknown) => void;
}

interface Slot {
  readonly worker: Worker;
  current: { readonly pending: Pending; readonly id: number; timer: NodeJS.Timeout | undefined } | undefined;
  idle: NodeJS.Timeout | undefined;
}

function taskUrl(task: string | URL): string {
  const url = task instanceof URL ? task : task.startsWith('file:') ? new URL(task) : undefined;
  if (url !== undefined && url.protocol === 'file:') return url.href;
  if (typeof task === 'string' && /^(?:\/|[A-Za-z]:[\\/])/.test(task)) return pathToFileURL(task).href;
  throw fail(
    'QUEUE_TASK_INVALID',
    500,
    'A task is the URL or the absolute path of a file.',
    'Give new URL("./task.ts", import.meta.url).',
  );
}

export function createWorkerPool(options: WorkerPoolOptions = {}): WorkerPool {
  const size = options.size ?? Math.max(1, Math.min(4, availableParallelism() - 1));
  const maxQueued = options.maxQueued ?? 100;
  const idleMs = options.idleMs ?? 30_000;
  const maxHeapMb = options.maxHeapMb ?? 256;
  const slots = new Set<Slot>();
  const waiting: Pending[] = [];
  let nextId = 0;
  let completed = 0;
  let failed = 0;
  let closed = false;

  const finish = (slot: Slot, outcome: { ok: true; value: unknown } | { ok: false; error: unknown }): void => {
    const current = slot.current;
    if (current === undefined) return;
    slot.current = undefined;
    if (current.timer !== undefined) clearTimeout(current.timer);
    current.pending.options.signal?.removeEventListener('abort', aborts.get(current.pending) ?? (() => undefined));
    aborts.delete(current.pending);
    if (outcome.ok) {
      completed += 1;
      current.pending.resolve(outcome.value);
    } else {
      failed += 1;
      current.pending.reject(outcome.error);
    }
  };
  const aborts = new Map<Pending, () => void>();

  /** Ends a thread that cannot be trusted any more, and tells the task that was on it. */
  const retire = (slot: Slot, error: unknown): void => {
    slots.delete(slot);
    if (slot.idle !== undefined) clearTimeout(slot.idle);
    slot.worker.removeAllListeners();
    slot.worker.on('error', () => undefined);
    void slot.worker.terminate();
    finish(slot, { ok: false, error });
    pump();
  };

  function spawn(): Slot {
    const worker = new Worker(BOOTSTRAP, {
      eval: true,
      resourceLimits: { maxOldGenerationSizeMb: maxHeapMb },
      // The thread has the same environment as the process, and its own copy of the modules.
    });
    const slot: Slot = { worker, current: undefined, idle: undefined };
    worker.on(
      'message',
      (message: { id: number; ok: boolean; result?: unknown; name?: string; message?: string; stack?: string }) => {
        if (slot.current?.id !== message.id) return;
        if (message.ok) finish(slot, { ok: true, value: message.result });
        else {
          const cause = Object.assign(new Error(message.message ?? 'The task failed.'), {
            name: message.name ?? 'Error',
            ...(message.stack === undefined ? {} : { stack: message.stack }),
          });
          finish(slot, {
            ok: false,
            error: fail(
              'QUEUE_TASK_FAILED',
              500,
              `The task failed: ${cause.name}: ${cause.message}`,
              'See the cause for the stack of the task.',
              cause,
            ),
          });
        }
        release(slot);
      },
    );
    worker.on('error', (error) => {
      const memory = 'code' in error && error.code === 'ERR_WORKER_OUT_OF_MEMORY';
      retire(
        slot,
        fail(
          'QUEUE_TASK_CRASHED',
          500,
          memory ? 'The task used more memory than its thread may.' : 'The thread of the task stopped with an error.',
          memory ? `Raise maxHeapMb (now ${String(maxHeapMb)}), or work on the data in parts.` : 'See the cause.',
          error,
        ),
      );
    });
    worker.on('exit', (code) => {
      if (slots.has(slot))
        retire(
          slot,
          fail(
            'QUEUE_TASK_CRASHED',
            500,
            `The thread of the task ended with code ${String(code)}.`,
            'A task must not call process.exit.',
          ),
        );
    });
    slots.add(slot);
    return slot;
  }

  function release(slot: Slot): void {
    if (!slots.has(slot)) return;
    const next = waiting.shift();
    if (next !== undefined) {
      start(slot, next);
      return;
    }
    slot.idle = setTimeout(() => {
      slots.delete(slot);
      slot.worker.removeAllListeners();
      void slot.worker.terminate();
    }, idleMs);
    slot.idle.unref();
  }

  function start(slot: Slot, pending: Pending): void {
    if (slot.idle !== undefined) clearTimeout(slot.idle);
    slot.idle = undefined;
    const id = (nextId += 1);
    const current: NonNullable<Slot['current']> = { pending, id, timer: undefined };
    slot.current = current;
    const timeoutMs = pending.options.timeoutMs ?? 60_000;
    current.timer = setTimeout(
      () =>
        retire(
          slot,
          fail(
            'QUEUE_TASK_TIMEOUT',
            504,
            `The task ran over its time of ${String(timeoutMs)} ms.`,
            'Raise timeoutMs, or split the work.',
          ),
        ),
      timeoutMs,
    );
    const onAbort = (): void =>
      retire(slot, fail('QUEUE_TASK_ABORTED', 499, 'The task was cancelled.', 'It was stopped by its caller.'));
    if (pending.options.signal !== undefined) {
      aborts.set(pending, onAbort);
      pending.options.signal.addEventListener('abort', onAbort, { once: true });
    }
    try {
      slot.worker.postMessage({ id, task: pending.task, input: pending.input }, [...(pending.options.transfer ?? [])]);
    } catch (error) {
      retire(
        slot,
        fail(
          'QUEUE_TASK_INVALID',
          500,
          'The input of the task cannot be sent to a thread.',
          'Give data that can be cloned: no functions or classes.',
          error,
        ),
      );
    }
  }

  function pump(): void {
    for (;;) {
      if (closed) return;
      const free = [...slots].find((slot) => slot.current === undefined) ?? (slots.size < size ? spawn() : undefined);
      const next = free === undefined ? undefined : waiting.shift();
      if (free === undefined || next === undefined) {
        // A thread that was made for nothing is left idle, and ends after idleMs.
        if (free !== undefined) release(free);
        return;
      }
      start(free, next);
    }
  }

  return {
    run<Result>(task: string | URL, input: unknown, runOptions: RunOptions = {}): Promise<Result> {
      return new Promise<Result>((resolve, reject) => {
        try {
          if (closed) throw fail('QUEUE_POOL_CLOSED', 503, 'The pool is closed.', 'Make a new pool.');
          if (runOptions.signal?.aborted === true)
            throw fail('QUEUE_TASK_ABORTED', 499, 'The task was cancelled.', 'It was stopped by its caller.');
          const url = taskUrl(task);
          const capacity = slots.size < size || [...slots].some((slot) => slot.current === undefined);
          if (waiting.length >= maxQueued && !capacity) {
            throw fail(
              'QUEUE_POOL_FULL',
              503,
              `${String(waiting.length)} tasks are waiting for a thread.`,
              'Try again later, or raise maxQueued or size.',
            );
          }
          const pending: Pending = {
            task: url,
            input,
            options: runOptions,
            // The type of the result is the claim of the caller, as with `JSON.parse`.
            // oxlint-disable-next-line typescript/no-unsafe-type-assertion
            resolve: (value) => resolve(value as Result),
            reject,
          };
          waiting.push(pending);
          if (runOptions.signal !== undefined) {
            runOptions.signal.addEventListener(
              'abort',
              () => {
                const at = waiting.indexOf(pending);
                if (at === -1) return;
                waiting.splice(at, 1);
                reject(fail('QUEUE_TASK_ABORTED', 499, 'The task was cancelled.', 'It was stopped by its caller.'));
              },
              { once: true },
            );
          }
          pump();
        } catch (error) {
          reject(error);
        }
      });
    },
    stats() {
      return {
        threads: slots.size,
        busy: [...slots].filter((slot) => slot.current !== undefined).length,
        queued: waiting.length,
        completed,
        failed,
      };
    },
    async close() {
      closed = true;
      for (const pending of waiting.splice(0)) {
        pending.reject(fail('QUEUE_POOL_CLOSED', 503, 'The pool was closed.', 'The task did not run.'));
      }
      for (const slot of Array.from(slots)) {
        retire(
          slot,
          fail('QUEUE_POOL_CLOSED', 503, 'The pool was closed while the task ran.', 'The task was stopped.'),
        );
      }
      options.logger?.debug('worker pool closed', { completed, failed });
    },
  };
}
