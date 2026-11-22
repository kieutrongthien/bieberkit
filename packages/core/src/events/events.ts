/**
 * BieberKit
 *
 * @file        packages/core/src/events/events.ts
 * @description A typed in-process event bus: payloads from EventRegistry, event names owned by their module, handler errors isolated (MOD-03, MOD-05).
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

import { BkError } from '../errors/errors.ts';
import type { Logger } from '../logging/logger.ts';
import { MODULE_NAME } from '../module/define-module.ts';

/**
 * Names and payloads of the events. A module adds its events by declaration merging, through the package entry:
 * `declare module '@bieberkit/core' { interface EventRegistry { 'crm.deal.won': { dealId: string } } }`.
 */
// oxlint-disable-next-line typescript/no-empty-interface
export interface EventRegistry {}

export type EventName = Extract<keyof EventRegistry, string>;

export type EventHandler<N extends EventName> = (payload: EventRegistry[N]) => void | Promise<void>;

export interface HandlerFailure {
  /** The `name` given to `on`, else the function name, else `(anonymous)`. */
  readonly handler: string;
  readonly error: unknown;
}

export interface EmitResult {
  /** Handlers that finished without an error. */
  readonly delivered: number;
  readonly failures: readonly HandlerFailure[];
}

export interface OnOptions {
  readonly name?: string;
}

export interface ModuleEmitter {
  /** Runs the handlers one after another, in registration order. A failing handler never stops the rest or the caller. */
  emit<N extends EventName>(name: N, payload: EventRegistry[N]): Promise<EmitResult>;
}

export interface EventBus {
  /** Any module may subscribe to any event. The returned function unsubscribes. */
  on<N extends EventName>(name: N, handler: EventHandler<N>, options?: OnOptions): () => void;
  /** A module emits only events whose name starts with `<module>.` (MOD-05). */
  forModule(module: string): ModuleEmitter;
}

export interface EventBusOptions {
  readonly logger?: Logger;
}

interface Subscription {
  readonly run: (payload: unknown) => void | Promise<void>;
  readonly name: string;
}

export function createEventBus(options: EventBusOptions = {}): EventBus {
  const subscriptions = new Map<string, Subscription[]>();

  return {
    on: (name, handler, onOptions = {}) => {
      const subscription: Subscription = {
        // Subscriptions are keyed by event name, so a handler only ever receives the payload of its own event.
        // oxlint-disable-next-line typescript/no-unsafe-type-assertion
        run: (payload) => handler(payload as EventRegistry[typeof name]),
        name: onOptions.name ?? (handler.name === '' ? '(anonymous)' : handler.name),
      };
      subscriptions.set(name, [...(subscriptions.get(name) ?? []), subscription]);
      return () => {
        const current = subscriptions.get(name) ?? [];
        subscriptions.set(
          name,
          current.filter((item) => item !== subscription),
        );
      };
    },
    forModule: (module) => {
      if (!MODULE_NAME.test(module)) {
        throw new BkError(`"${module}" is not a module name.`, {
          code: 'CORE_EVENT_MODULE',
          fix: 'Use lower case letters, digits and dashes, starting with a letter.',
        });
      }
      const emit = async (name: string, payload: unknown): Promise<EmitResult> => {
        if (!name.startsWith(`${module}.`)) {
          throw new BkError(
            `Module "${module}" cannot emit "${name}". A module emits only events that start with "${module}.".`,
            {
              code: 'CORE_EVENT_FOREIGN',
              fix: `Rename the event to start with "${module}.", or emit it from the module that owns it.`,
            },
          );
        }
        // The list is copied, so a handler added during this emit waits for the next one.
        const targets = subscriptions.get(name) ?? [];
        const failures: HandlerFailure[] = [];
        let delivered = 0;
        for (const { run, name: handlerName } of targets) {
          try {
            await run(payload);
            delivered++;
          } catch (error) {
            failures.push({ handler: handlerName, error });
            options.logger?.error('event handler failed', { event: name, handler: handlerName, err: error });
          }
        }
        return { delivered, failures };
      };
      return { emit: (name, payload) => emit(name, payload) };
    },
  };
}
