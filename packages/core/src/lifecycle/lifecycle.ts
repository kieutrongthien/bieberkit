/**
 * BieberKit
 *
 * @file        packages/core/src/lifecycle/lifecycle.ts
 * @description Boot and shutdown hooks with ordered phases and a shutdown timeout (CORE-10 to CORE-13, spec 19.4).
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

import { BkError, ContainerError } from '../errors/errors.ts';
import type { Logger } from '../logging/logger.ts';

export type Phase = 'created' | 'booting' | 'ready' | 'stopping' | 'stopped';

export type Hook = () => void | Promise<void>;

export interface HookFailure {
  readonly name: string;
  readonly error: unknown;
}

export interface StopResult {
  /** The timeout passed before every hook finished. */
  readonly timedOut: boolean;
  readonly failures: readonly HookFailure[];
  /** Hooks that did not start because the timeout passed first. */
  readonly skipped: readonly string[];
}

export interface LifecycleOptions {
  readonly logger?: Logger;
  /** Time allowed for all shutdown hooks together. Defaults to 20 seconds (spec 19.4). */
  readonly shutdownTimeoutMs?: number;
}

export interface Lifecycle {
  readonly phase: Phase;
  /** Runs at `boot()`, in registration order. The first failure stops the boot. */
  onBoot(name: string, hook: Hook): void;
  /** Runs at `stop()`, in reverse registration order. A failure is recorded and the others still run. */
  onShutdown(name: string, hook: Hook): void;
  boot(): Promise<void>;
  stop(): Promise<StopResult>;
}

interface Named {
  readonly name: string;
  readonly hook: Hook;
}

const DEFAULT_TIMEOUT_MS = 20_000;

function stateError(message: string): ContainerError {
  return new ContainerError(message, {
    code: 'CORE_LIFECYCLE_STATE',
    fix: 'Register hooks before boot(), and call boot() and stop() once each.',
  });
}

/** 0 when everything stopped cleanly, 1 after a timeout or a failed hook (spec 19.4, step 7). */
export function exitCode(result: StopResult): 0 | 1 {
  return result.timedOut || result.failures.length > 0 ? 1 : 0;
}

export function createLifecycle(options: LifecycleOptions = {}): Lifecycle {
  const logger = options.logger;
  const timeoutMs = options.shutdownTimeoutMs ?? DEFAULT_TIMEOUT_MS;
  const bootHooks: Named[] = [];
  const shutdownHooks: Named[] = [];
  let phase: Phase = 'created';
  let booting: Promise<void> | undefined;
  let stopping: Promise<StopResult> | undefined;

  const runBoot = async (): Promise<void> => {
    phase = 'booting';
    for (const { name, hook } of bootHooks) {
      logger?.debug('boot hook', { hook: name });
      try {
        await hook();
      } catch (error) {
        logger?.error('boot hook failed', { hook: name, err: error });
        if (error instanceof BkError) throw error;
        throw new ContainerError(
          `Boot hook "${name}" failed: ${error instanceof Error ? error.message : 'unknown error'}`,
          {
            code: 'CORE_LIFECYCLE_BOOT',
            fix: 'See the cause for the original error.',
            cause: error,
          },
        );
      }
    }
    phase = 'ready';
  };

  const runStop = async (): Promise<StopResult> => {
    // A stop during boot waits for it, so the hooks that boot registers are there to run.
    await booting?.catch(() => undefined);
    phase = 'stopping';
    const failures: HookFailure[] = [];
    const queue = shutdownHooks.toReversed();
    let next = 0;
    let abandoned = false;

    const drain = async (): Promise<void> => {
      for (; next < queue.length; next++) {
        const item = queue[next];
        if (item === undefined || abandoned) return;
        logger?.debug('shutdown hook', { hook: item.name });
        try {
          await item.hook();
        } catch (error) {
          failures.push({ name: item.name, error });
          logger?.error('shutdown hook failed', { hook: item.name, err: error });
        }
      }
    };

    let timer: ReturnType<typeof setTimeout> | undefined;
    const timeout = new Promise<'timeout'>((resolve) => {
      timer = setTimeout(() => resolve('timeout'), timeoutMs);
      timer.unref();
    });
    const outcome = await Promise.race([drain().then(() => 'done' as const), timeout]);
    clearTimeout(timer);
    abandoned = outcome === 'timeout';
    const skipped = abandoned ? queue.slice(next + 1).map((item) => item.name) : [];
    if (abandoned) logger?.error('shutdown timed out', { timeoutMs, stuck: queue[next]?.name, skipped });
    phase = 'stopped';
    return { timedOut: abandoned, failures, skipped };
  };

  return {
    get phase() {
      return phase;
    },
    onBoot: (name, hook) => {
      if (phase !== 'created' || stopping !== undefined)
        throw stateError(`Boot hook "${name}" was added after boot started.`);
      bootHooks.push({ name, hook });
    },
    onShutdown: (name, hook) => {
      if (phase === 'stopping' || phase === 'stopped')
        throw stateError(`Shutdown hook "${name}" was added after stop started.`);
      shutdownHooks.push({ name, hook });
    },
    boot: () => {
      if (phase !== 'created' || stopping !== undefined)
        return Promise.reject(stateError('boot() runs once, and not after stop().'));
      booting = runBoot();
      return booting;
    },
    stop: () => {
      stopping ??= runStop();
      return stopping;
    },
  };
}
