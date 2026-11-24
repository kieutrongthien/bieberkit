/**
 * BieberKit
 *
 * @file        packages/http/src/trace.ts
 * @description The request id and the W3C trace context of a request, read from its headers or made new (API-04).
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

import { randomBytes } from 'node:crypto';
import { parseTraceparent } from '@bieberkit/core';
import { uuid7 } from '@bieberkit/data';

const REQUEST_ID = /^[A-Za-z0-9._:-]{1,128}$/;

const first = (value: string | string[] | undefined): string | undefined => (Array.isArray(value) ? value[0] : value);

/** An incoming `x-request-id` when it is short and plain, and a new UUIDv7 when it is missing or could be an attack on a log. */
export function requestIdOf(header: string | string[] | undefined): string {
  const value = first(header);
  return value !== undefined && REQUEST_ID.test(value) ? value : uuid7();
}

export interface Trace {
  readonly traceId: string;
  /** The span of the caller, when it sent one. */
  readonly spanId?: string;
}

/** The trace of a request: that of a valid `traceparent` (W3C), or a new random one. */
export function traceOf(header: string | string[] | undefined): Trace {
  return parseTraceparent(header) ?? { traceId: randomBytes(16).toString('hex') };
}
