/**
 * BieberKit
 *
 * @file        packages/core/src/logging/request-context.ts
 * @description The request context on AsyncLocalStorage: ids that every log line, span and job of one request share (ADR 0003, OBS-01).
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

import { AsyncLocalStorage } from 'node:async_hooks';

/** What is known about the request that is running. Only `requestId` is always present. */
export interface RequestContext {
  requestId: string;
  traceId?: string;
  spanId?: string;
  tenantId?: string;
  userId?: string;
}

const storage = new AsyncLocalStorage<RequestContext>();

export const requestContext: {
  /** Runs `fn` with a copy of `context`. Async code started inside sees it, and nothing outside does. */
  run<T>(context: RequestContext, fn: () => T): T;
  get(): RequestContext | undefined;
  /** Adds what became known later, for example the user. Does nothing outside `run`. */
  update(patch: Partial<RequestContext>): void;
} = {
  run: (context, fn) => storage.run({ ...context }, fn),
  get: () => storage.getStore(),
  update: (patch) => {
    const current = storage.getStore();
    if (current === undefined) return;
    for (const [key, value] of Object.entries(patch)) {
      if (value !== undefined) Object.assign(current, { [key]: value });
    }
  },
};
