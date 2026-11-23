/**
 * BieberKit
 *
 * @file        packages/queue/src/pool.test.ts
 * @description Tests of the worker thread pool: the result and the error of a task, the event loop that stays free, the size, the queue, timeouts, crashes, memory, cancelling and closing (Q-09).
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

import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { createWorkerPool } from './pool.ts';

const task = (name: string): URL => new URL(`./testing/tasks/${name}.ts`, import.meta.url);
const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

async function withPool<T>(
  options: Parameters<typeof createWorkerPool>[0],
  fn: (pool: ReturnType<typeof createWorkerPool>) => Promise<T>,
): Promise<T> {
  const pool = createWorkerPool(options);
  try {
    return await fn(pool);
  } finally {
    await pool.close();
  }
}

describe('Q-09 a task and its result', () => {
  it('Q-09 runs a task on a thread, with the input and the result copied', async () => {
    await withPool({ size: 1 }, async (pool) => {
      const input = {
        text: 'tiếng Việt',
        list: [1, 2, 3],
        when: new Date(0),
        map: new Map([['a', 1]]),
        bytes: new Uint8Array([1, 2]),
      };
      const answer = await pool.run<{ input: typeof input; thread: number }>(task('echo'), input);
      expect(answer.input).toEqual(input);
      expect(answer.thread).toBeGreaterThan(0);
    });
  });

  it('Q-09 takes the task as a URL, a file: string or an absolute path', async () => {
    await withPool({ size: 1 }, async (pool) => {
      const url = task('echo');
      expect((await pool.run<{ input: number }>(url.href, 1)).input).toBe(1);
      expect((await pool.run<{ input: number }>(fileURLToPath(url), 2)).input).toBe(2);
    });
  });

  it('Q-09 refuses a task that is not a file of the project: a relative path, another scheme, a name', async () => {
    await withPool({ size: 1 }, async (pool) => {
      for (const bad of [
        './echo.ts',
        'echo',
        'https://example.com/task.js',
        'data:text/javascript,export default () => 1',
        'node:fs',
        '',
      ]) {
        await expect(pool.run(bad, {})).rejects.toMatchObject({ code: 'QUEUE_TASK_INVALID' });
      }
    });
  });

  it('Q-09 a module with no default function is a failure of the task, and the thread is still good', async () => {
    await withPool({ size: 1 }, async (pool) => {
      await expect(pool.run(task('no-default'), {})).rejects.toMatchObject({ code: 'QUEUE_TASK_FAILED' });
      expect((await pool.run<{ input: number }>(task('echo'), 5)).input).toBe(5);
    });
  });

  it('Q-09 an input that cannot be cloned is refused, and the pool goes on', async () => {
    await withPool({ size: 1 }, async (pool) => {
      await expect(pool.run(task('echo'), { fn: () => 1 })).rejects.toMatchObject({ code: 'QUEUE_TASK_INVALID' });
      expect((await pool.run<{ input: number }>(task('echo'), 1)).input).toBe(1);
    });
  });
});

describe('Q-09 errors of a task', () => {
  it('Q-09 an error of the task is a QUEUE_TASK_FAILED with the name, the message and the stack of the task as its cause', async () => {
    await withPool({ size: 1 }, async (pool) => {
      let caught: unknown;
      try {
        await pool.run(task('fail'), { name: 'RangeError', message: 'out of range' });
      } catch (error) {
        caught = error;
      }
      expect(caught).toMatchObject({ code: 'QUEUE_TASK_FAILED', status: 500 });
      expect(caught instanceof Error ? caught.message : '').toContain('RangeError: out of range');
      const cause = caught instanceof Error ? caught.cause : undefined;
      expect(cause).toBeInstanceOf(Error);
      expect(cause instanceof Error ? [cause.name, cause.message] : []).toEqual(['RangeError', 'out of range']);
      expect(cause instanceof Error ? cause.stack : '').toContain('fail.ts');
    });
  });

  it('Q-09 a task that failed leaves its thread for the next task', async () => {
    await withPool({ size: 1 }, async (pool) => {
      const first = await pool.run<{ thread: number }>(task('echo'), 1);
      await expect(pool.run(task('fail'), { name: 'Error', message: 'x' })).rejects.toBeDefined();
      const second = await pool.run<{ thread: number }>(task('echo'), 2);
      expect(second.thread).toBe(first.thread);
      expect(pool.stats()).toMatchObject({ completed: 2, failed: 1, threads: 1 });
    });
  });
});

describe('Q-09 the event loop stays free', () => {
  it('Q-09 a task that keeps the CPU busy for 400 ms does not stop the timers of the caller', async () => {
    await withPool({ size: 1 }, async (pool) => {
      let worst = 0;
      let last = Date.now();
      const timer = setInterval(() => {
        const now = Date.now();
        worst = Math.max(worst, now - last);
        last = now;
      }, 10);
      await pool.run(task('burn'), { ms: 400 });
      clearInterval(timer);
      expect(worst).toBeLessThan(150);
    });
  });

  it('Q-09 the same loop in this thread would stop them: the test measures what it says', () => {
    const started = Date.now();
    const until = started + 100;
    while (Date.now() < until) Math.sqrt(Math.random());
    expect(Date.now() - started).toBeGreaterThanOrEqual(100);
  });
});

describe('Q-09 size and queue', () => {
  it('Q-09 runs as many tasks at once as the size, on different threads, and the others wait', async () => {
    await withPool({ size: 2 }, async (pool) => {
      const started = Date.now();
      const results = await Promise.all(
        Array.from({ length: 4 }, () => pool.run<{ thread: number }>(task('burn'), { ms: 250 })),
      );
      const elapsed = Date.now() - started;
      expect(new Set(results.map((result) => result.thread)).size).toBe(2);
      expect(elapsed).toBeGreaterThanOrEqual(450);
      expect(elapsed).toBeLessThan(2_500);
      expect(pool.stats().threads).toBe(2);
    });
  });

  it('Q-09 waiting tasks run in the order that they came', async () => {
    await withPool({ size: 1 }, async (pool) => {
      const order: number[] = [];
      await Promise.all([1, 2, 3, 4].map((n) => pool.run(task('echo'), n).then(() => void order.push(n))));
      expect(order).toEqual([1, 2, 3, 4]);
    });
  });

  it('Q-09 reuses a thread for the tasks that come one after the other', async () => {
    await withPool({ size: 3 }, async (pool) => {
      const threads = new Set<number>();
      for (let i = 0; i < 5; i += 1) threads.add((await pool.run<{ thread: number }>(task('echo'), i)).thread);
      expect(threads.size).toBe(1);
    });
  });

  it('Q-09 refuses a task when every thread is busy and the queue is full, and runs it when there is room', async () => {
    await withPool({ size: 1, maxQueued: 1 }, async (pool) => {
      const running = pool.run(task('burn'), { ms: 200 });
      const queued = pool.run(task('echo'), 'queued');
      await expect(pool.run(task('echo'), 'too many')).rejects.toMatchObject({ code: 'QUEUE_POOL_FULL', status: 503 });
      await running;
      await queued;
      await expect(pool.run(task('echo'), 'now there is room')).resolves.toBeDefined();
    });
  });

  it('Q-09 a size of 1 and a queue of 0 still runs one task when the pool is free', async () => {
    await withPool({ size: 1, maxQueued: 0 }, async (pool) => {
      await expect(pool.run(task('echo'), 1)).resolves.toBeDefined();
    });
  });

  it('Q-09 a thread with nothing to do ends after idleMs, and a new one starts for the next task', async () => {
    await withPool({ size: 1, idleMs: 60 }, async (pool) => {
      const first = await pool.run<{ thread: number }>(task('echo'), 1);
      expect(pool.stats().threads).toBe(1);
      await sleep(250);
      expect(pool.stats().threads).toBe(0);
      const second = await pool.run<{ thread: number }>(task('echo'), 2);
      expect(second.thread).not.toBe(first.thread);
    });
  });
});

describe('Q-09 a task that hangs, crashes or uses too much memory', () => {
  it('Q-09 a task that runs over its time costs its thread, and the pool is good for the next one', async () => {
    await withPool({ size: 1 }, async (pool) => {
      const before = await pool.run<{ thread: number }>(task('echo'), 0);
      const started = Date.now();
      await expect(pool.run(task('hang'), {}, { timeoutMs: 150 })).rejects.toMatchObject({
        code: 'QUEUE_TASK_TIMEOUT',
        status: 504,
      });
      expect(Date.now() - started).toBeLessThan(2_000);
      const after = await pool.run<{ thread: number }>(task('echo'), 1);
      expect(after.thread).not.toBe(before.thread);
    });
  });

  it('Q-09 a task that ends its thread is QUEUE_TASK_CRASHED, and the tasks behind it still run', async () => {
    await withPool({ size: 1 }, async (pool) => {
      const crashed = pool.run(task('crash'), { how: 'exit' });
      const behind = pool.run<{ input: string }>(task('echo'), 'behind');
      await expect(crashed).rejects.toMatchObject({ code: 'QUEUE_TASK_CRASHED' });
      expect((await behind).input).toBe('behind');
    });
  });

  it('Q-09 an error that is thrown outside the task, after it answered nothing, is a crash of that task only', async () => {
    await withPool({ size: 1 }, async (pool) => {
      await expect(pool.run(task('crash'), { how: 'throw-later' })).rejects.toMatchObject({
        code: 'QUEUE_TASK_CRASHED',
      });
      await expect(pool.run(task('echo'), 1)).resolves.toBeDefined();
    });
  });

  it('Q-09 a task that uses more memory than its thread may ends the thread and not the process', async () => {
    await withPool({ size: 1, maxHeapMb: 24 }, async (pool) => {
      await expect(pool.run(task('crash'), { how: 'memory' }, { timeoutMs: 20_000 })).rejects.toMatchObject({
        code: 'QUEUE_TASK_CRASHED',
      });
      await expect(pool.run(task('echo'), 1)).resolves.toBeDefined();
    });
  }, 30_000);
});

describe('Q-09 cancelling and closing', () => {
  it('Q-09 an AbortSignal stops a task that runs, and the pool goes on', async () => {
    await withPool({ size: 1 }, async (pool) => {
      const controller = new AbortController();
      const running = pool.run(task('hang'), {}, { signal: controller.signal });
      await sleep(50);
      controller.abort();
      await expect(running).rejects.toMatchObject({ code: 'QUEUE_TASK_ABORTED' });
      await expect(pool.run(task('echo'), 1)).resolves.toBeDefined();
    });
  });

  it('Q-09 an AbortSignal takes a task out of the queue before it starts, and one that is already aborted never starts', async () => {
    await withPool({ size: 1 }, async (pool) => {
      const running = pool.run(task('burn'), { ms: 150 });
      const controller = new AbortController();
      const waiting = pool.run(task('echo'), 'never', { signal: controller.signal });
      controller.abort();
      await expect(waiting).rejects.toMatchObject({ code: 'QUEUE_TASK_ABORTED' });
      expect(pool.stats().queued).toBe(0);
      await running;
      const done = new AbortController();
      done.abort();
      await expect(pool.run(task('echo'), 1, { signal: done.signal })).rejects.toMatchObject({
        code: 'QUEUE_TASK_ABORTED',
      });
    });
  });

  it('Q-09 close fails the tasks that wait and the ones that run, and refuses new ones', async () => {
    const pool = createWorkerPool({ size: 1 });
    const running = pool.run(task('hang'), {});
    const waiting = pool.run(task('echo'), 1);
    await sleep(50);
    await pool.close();
    await expect(running).rejects.toMatchObject({ code: 'QUEUE_POOL_CLOSED' });
    await expect(waiting).rejects.toMatchObject({ code: 'QUEUE_POOL_CLOSED' });
    await expect(pool.run(task('echo'), 1)).rejects.toMatchObject({ code: 'QUEUE_POOL_CLOSED', status: 503 });
    expect(pool.stats().threads).toBe(0);
    await pool.close();
  });
});
