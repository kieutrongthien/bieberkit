/**
 * BieberKit
 *
 * @file        packages/core/src/lifecycle/lifecycle.test.ts
 * @description Tests for boot and shutdown hooks, the phases and the shutdown timeout (CORE-10 to CORE-13, spec 19.4).
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

import { afterEach, describe, expect, it, vi } from 'vitest';
import { BkError } from '../errors/errors.ts';
import { createLogger } from '../logging/logger.ts';
import { createLifecycle, exitCode } from './lifecycle.ts';
import type { Lifecycle } from './lifecycle.ts';

afterEach(() => {
  vi.useRealTimers();
});

const never = (): Promise<void> => new Promise<void>(() => undefined);

async function rejection(promise: Promise<unknown>): Promise<BkError> {
  try {
    await promise;
  } catch (error) {
    if (error instanceof BkError) return error;
    throw error;
  }
  throw new Error('Expected a rejection.');
}

describe('CORE-10 phases', () => {
  it('CORE-10 moves created, booting, ready, stopping, stopped', async () => {
    const lifecycle = createLifecycle();
    const seen: string[] = [lifecycle.phase];
    lifecycle.onBoot('probe', () => void seen.push(lifecycle.phase));
    lifecycle.onShutdown('probe', () => void seen.push(lifecycle.phase));
    await lifecycle.boot();
    seen.push(lifecycle.phase);
    await lifecycle.stop();
    seen.push(lifecycle.phase);
    expect(seen).toEqual(['created', 'booting', 'ready', 'stopping', 'stopped']);
  });

  it('CORE-10 boot runs once', async () => {
    const lifecycle = createLifecycle();
    await lifecycle.boot();
    expect((await rejection(lifecycle.boot())).code).toBe('CORE_LIFECYCLE_STATE');
  });

  it('CORE-10 a second stop returns the first result and runs no hook twice', async () => {
    const lifecycle = createLifecycle();
    const hook = vi.fn<() => void>();
    lifecycle.onShutdown('once', hook);
    await lifecycle.boot();
    const [first, second] = await Promise.all([lifecycle.stop(), lifecycle.stop()]);
    const third = await lifecycle.stop();
    expect(second).toBe(first);
    expect(third).toBe(first);
    expect(hook).toHaveBeenCalledTimes(1);
  });

  it('CORE-10 stop before boot goes straight to stopped, and boot is refused afterwards', async () => {
    const lifecycle = createLifecycle();
    const hook = vi.fn<() => void>();
    lifecycle.onBoot('never', hook);
    await lifecycle.stop();
    expect(lifecycle.phase).toBe('stopped');
    expect((await rejection(lifecycle.boot())).code).toBe('CORE_LIFECYCLE_STATE');
    expect(hook).not.toHaveBeenCalled();
  });

  it('CORE-10 stop during boot waits for boot to finish, then runs the shutdown hooks', async () => {
    const lifecycle = createLifecycle();
    const order: string[] = [];
    lifecycle.onBoot('slow', async () => {
      await new Promise((resolve) => setTimeout(resolve, 10));
      lifecycle.onShutdown('opened-late', () => void order.push('shutdown'));
      order.push('booted');
    });
    const booting = lifecycle.boot();
    const stopped = lifecycle.stop();
    await booting;
    await stopped;
    expect(order).toEqual(['booted', 'shutdown']);
  });

  it('CORE-10 stop called first and boot right after: boot is refused', async () => {
    const lifecycle = createLifecycle();
    const stopped = lifecycle.stop();
    expect((await rejection(lifecycle.boot())).code).toBe('CORE_LIFECYCLE_STATE');
    await stopped;
  });

  it('CORE-10 hooks cannot be added in a phase where they would never run', async () => {
    const lifecycle = createLifecycle();
    await lifecycle.boot();
    expect(() => lifecycle.onBoot('late', () => undefined)).toThrowError(
      expect.objectContaining({ code: 'CORE_LIFECYCLE_STATE' }),
    );
    await lifecycle.stop();
    expect(() => lifecycle.onShutdown('late', () => undefined)).toThrowError(
      expect.objectContaining({ code: 'CORE_LIFECYCLE_STATE' }),
    );
  });
});

describe('CORE-11 hook order', () => {
  it('CORE-11 boot hooks run in registration order, shutdown hooks in reverse', async () => {
    const lifecycle = createLifecycle();
    const order: string[] = [];
    for (const name of ['db', 'cache', 'http']) {
      lifecycle.onBoot(name, () => void order.push(`boot ${name}`));
      lifecycle.onShutdown(name, () => void order.push(`stop ${name}`));
    }
    await lifecycle.boot();
    await lifecycle.stop();
    expect(order).toEqual(['boot db', 'boot cache', 'boot http', 'stop http', 'stop cache', 'stop db']);
  });

  it('CORE-11 async hooks finish before the next one starts', async () => {
    const lifecycle = createLifecycle();
    const order: string[] = [];
    lifecycle.onShutdown('first-registered', () => void order.push('last'));
    lifecycle.onShutdown('second-registered', async () => {
      await new Promise((resolve) => setTimeout(resolve, 10));
      order.push('first');
    });
    await lifecycle.boot();
    await lifecycle.stop();
    expect(order).toEqual(['first', 'last']);
  });
});

describe('CORE-12 failing hooks', () => {
  it('CORE-12 a failing shutdown hook is recorded and the others still run', async () => {
    const lifecycle = createLifecycle();
    const ran: string[] = [];
    const boom = new Error('close failed');
    lifecycle.onShutdown('db', () => void ran.push('db'));
    lifecycle.onShutdown('queue', () => {
      throw boom;
    });
    lifecycle.onShutdown('http', () => void ran.push('http'));
    await lifecycle.boot();
    const result = await lifecycle.stop();
    expect(ran).toEqual(['http', 'db']);
    expect(result.failures).toEqual([{ name: 'queue', error: boom }]);
    expect(result.timedOut).toBe(false);
    expect(exitCode(result)).toBe(1);
  });

  it('CORE-12 a failing boot hook stops the boot, keeps its BkError code, and stop still cleans up', async () => {
    const lifecycle = createLifecycle();
    const ran: string[] = [];
    lifecycle.onBoot('db', () => {
      lifecycle.onShutdown('db', () => void ran.push('closed db'));
    });
    lifecycle.onBoot('queue', () => {
      throw new BkError('no redis', { code: 'QUEUE_UNREACHABLE' });
    });
    lifecycle.onBoot('http', () => void ran.push('started http'));
    const error = await rejection(lifecycle.boot());
    expect(error.code).toBe('QUEUE_UNREACHABLE');
    expect(lifecycle.phase).toBe('booting');
    const result = await lifecycle.stop();
    expect(ran).toEqual(['closed db']);
    expect(exitCode(result)).toBe(0);
  });

  it('CORE-12 any other error from a boot hook is wrapped and names the hook', async () => {
    const lifecycle = createLifecycle();
    lifecycle.onBoot('cache', () => {
      throw new TypeError('bad');
    });
    const error = await rejection(lifecycle.boot());
    expect(error.code).toBe('CORE_LIFECYCLE_BOOT');
    expect(error.message).toContain('cache');
    expect(error.cause).toBeInstanceOf(TypeError);
  });

  it('CORE-12 hooks and failures are logged with the hook name', async () => {
    const lines: string[] = [];
    const logger = createLogger({ level: 'debug', role: 'web', write: (line) => void lines.push(line) });
    const lifecycle = createLifecycle({ logger });
    lifecycle.onShutdown('queue', () => {
      throw new Error('close failed');
    });
    await lifecycle.boot();
    await lifecycle.stop();
    const text = lines.join('\n');
    expect(text).toContain('"hook":"queue"');
    expect(text).toContain('"level":"error"');
  });
});

describe('CORE-13 shutdown timeout', () => {
  it('CORE-13 returns after the timeout with timedOut true and lists the hooks that did not run', async () => {
    const lifecycle = createLifecycle({ shutdownTimeoutMs: 30 });
    const ran: string[] = [];
    lifecycle.onShutdown('db', () => void ran.push('db'));
    lifecycle.onShutdown('stuck', never);
    lifecycle.onShutdown('http', () => void ran.push('http'));
    await lifecycle.boot();
    const started = Date.now();
    const result = await lifecycle.stop();
    expect(Date.now() - started).toBeLessThan(1000);
    expect(ran).toEqual(['http']);
    expect(result.timedOut).toBe(true);
    expect(result.skipped).toEqual(['db']);
    expect(exitCode(result)).toBe(1);
    expect(lifecycle.phase).toBe('stopped');
  });

  it('CORE-13 the default timeout is 20 seconds', async () => {
    vi.useFakeTimers();
    const lifecycle = createLifecycle();
    lifecycle.onShutdown('stuck', never);
    await lifecycle.boot();
    let settled = false;
    void lifecycle.stop().then(() => (settled = true));
    await vi.advanceTimersByTimeAsync(19_999);
    expect(settled).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    expect(settled).toBe(true);
  });

  it('CORE-13 a clean stop is exit code 0 and leaves no timer behind', async () => {
    vi.useFakeTimers();
    const lifecycle = createLifecycle();
    lifecycle.onShutdown('fast', () => undefined);
    await lifecycle.boot();
    const result = await lifecycle.stop();
    expect(result).toEqual({ timedOut: false, failures: [], skipped: [] });
    expect(exitCode(result)).toBe(0);
    expect(vi.getTimerCount()).toBe(0);
  });
});

describe('CORE-10 type', () => {
  it('CORE-10 Lifecycle exposes its phase as a readonly union', () => {
    const lifecycle: Lifecycle = createLifecycle();
    const phase: 'created' | 'booting' | 'ready' | 'stopping' | 'stopped' = lifecycle.phase;
    expect(phase).toBe('created');
  });
});
