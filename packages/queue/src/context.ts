/**
 * BieberKit
 *
 * @file        packages/queue/src/context.ts
 * @description The context that a job carries from the code that dispatched it to the worker that runs it, and the check of its input (Q-02, Q-10).
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

import { formatTraceparent, requestContext } from '@bieberkit/core';
import type { SchemaValue } from '@bieberkit/data';
import { queueError } from './contract.ts';

/** The tenant, the user and the request of the code that dispatches, so the job acts as they did (Q-10). */
export interface CarriedContext {
  readonly tenantId?: string;
  readonly userId?: string;
  readonly requestId?: string;
  /** The trace of the code that dispatched, as a W3C `traceparent`: the job continues it (OBS-02). */
  readonly traceparent?: string;
}

/** What the parts of a stored job or an outbox row say about who dispatched it, without the parts that are missing. */
export function carry(source: {
  readonly tenantId?: string | undefined;
  readonly userId?: string | undefined;
  readonly requestId?: string | undefined;
  readonly traceparent?: string | undefined;
}): CarriedContext {
  return {
    ...(source.tenantId === undefined ? {} : { tenantId: source.tenantId }),
    ...(source.userId === undefined ? {} : { userId: source.userId }),
    ...(source.requestId === undefined ? {} : { requestId: source.requestId }),
    ...(source.traceparent === undefined ? {} : { traceparent: source.traceparent }),
  };
}

/** What `requestContext` holds now. A job dispatched outside a request carries nothing. */
export function captureContext(): CarriedContext {
  const now = requestContext.get();
  return carry({
    tenantId: now?.tenantId,
    userId: now?.userId,
    requestId: now?.requestId,
    traceparent:
      now?.traceId === undefined || now.spanId === undefined
        ? undefined
        : formatTraceparent({ traceId: now.traceId, spanId: now.spanId }),
  });
}

/**
 * Runs `run` as the code that dispatched the job: its request id (or the job's), its tenant and its user, and inside the trace of
 * the delivery, so that the log lines and the reports of the job carry its ids.
 */
export function runAs<T>(
  carried: CarriedContext,
  fallbackRequestId: string,
  run: () => T,
  trace?: { readonly traceId: string; readonly spanId?: string },
): T {
  return requestContext.run(
    {
      requestId: carried.requestId ?? fallbackRequestId,
      ...(carried.tenantId === undefined ? {} : { tenantId: carried.tenantId }),
      ...(carried.userId === undefined ? {} : { userId: carried.userId }),
      ...(trace === undefined ? {} : { traceId: trace.traceId }),
      ...(trace?.spanId === undefined ? {} : { spanId: trace.spanId }),
    },
    run,
  );
}

/** Checks an input against its schema. It gives what the schema made of it, or throws `QUEUE_INPUT_INVALID`. */
export async function checkInput(job: string, schema: SchemaValue, input: unknown): Promise<unknown> {
  const standard: unknown = Reflect.get(schema, '~standard');
  const validate: unknown =
    typeof standard === 'object' && standard !== null ? Reflect.get(standard, 'validate') : undefined;
  if (typeof validate !== 'function') {
    throw queueError('QUEUE_INPUT_INVALID', 500, `The input schema of ${job} cannot be run.`, 'Use a Zod schema.');
  }
  const result: unknown = await Reflect.apply(validate, standard, [input]);
  if (typeof result !== 'object' || result === null) return input;
  const issues: unknown = Reflect.get(result, 'issues');
  if (Array.isArray(issues) && issues.length > 0) {
    const text = issues
      .map((issue: unknown) =>
        typeof issue === 'object' && issue !== null ? String(Reflect.get(issue, 'message')) : '',
      )
      .join('; ');
    throw queueError(
      'QUEUE_INPUT_INVALID',
      400,
      `The input of ${job} is not valid: ${text}`,
      'Send the input that the job declares.',
    );
  }
  return 'value' in result ? Reflect.get(result, 'value') : input;
}
