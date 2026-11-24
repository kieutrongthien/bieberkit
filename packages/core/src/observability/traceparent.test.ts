/**
 * BieberKit
 *
 * @file        packages/core/src/observability/traceparent.test.ts
 * @description Tests of the traceparent header: what is taken, and what starts a new trace (OBS-02).
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

import { describe, expect, it } from 'vitest';
import { formatTraceparent, parseTraceparent } from './traceparent.ts';

const TRACE = '4bf92f3577b34da6a3ce929d0e0e4736';
const SPAN = '00f067aa0ba902b7';

describe('OBS-02 traceparent', () => {
  it('OBS-02 takes a valid header, with a trace and the span of the caller', () => {
    expect(parseTraceparent(`00-${TRACE}-${SPAN}-01`)).toEqual({ traceId: TRACE, spanId: SPAN });
    expect(parseTraceparent([`00-${TRACE}-${SPAN}-00`, 'x'])).toEqual({ traceId: TRACE, spanId: SPAN });
  });

  it('OBS-02 takes a later version with more fields, and refuses version ff', () => {
    expect(parseTraceparent(`01-${TRACE}-${SPAN}-01-extra`)).toEqual({ traceId: TRACE, spanId: SPAN });
    expect(parseTraceparent(`ff-${TRACE}-${SPAN}-01`)).toBeUndefined();
  });

  it('OBS-02 refuses what is missing, short, upper case, all zero or not hex', () => {
    for (const header of [
      undefined,
      '',
      'garbage',
      `00-${TRACE}-${SPAN}`,
      `00-${TRACE.slice(1)}-${SPAN}-01`,
      `00-${TRACE.toUpperCase()}-${SPAN}-01`,
      `00-${'0'.repeat(32)}-${SPAN}-01`,
      `00-${TRACE}-${'0'.repeat(16)}-01`,
      `00-${'g'.repeat(32)}-${SPAN}-01`,
    ]) {
      expect(parseTraceparent(header)).toBeUndefined();
    }
  });

  it('OBS-02 writes the header that it reads', () => {
    const header = formatTraceparent({ traceId: TRACE, spanId: SPAN });
    expect(header).toBe(`00-${TRACE}-${SPAN}-01`);
    expect(parseTraceparent(header)).toEqual({ traceId: TRACE, spanId: SPAN });
  });
});
