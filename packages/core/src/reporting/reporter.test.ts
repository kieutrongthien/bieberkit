/**
 * BieberKit
 *
 * @file        packages/core/src/reporting/reporter.test.ts
 * @description Tests of the reporter port: the context of the request is added, a failing reporter never breaks the caller, and the composite reaches every reporter (OBS-06).
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
import { requestContext } from '../logging/request-context.ts';
import { createCompositeReporter, createMemoryReporter, createNoopReporter, reportError } from './reporter.ts';
import type { ErrorReporter } from './reporter.ts';

const boom: ErrorReporter = {
  report: () => {
    throw new Error('the reporter is broken');
  },
  flush: async () => {
    throw new Error('the reporter is broken');
  },
};

describe('OBS-06 reportError', () => {
  it('OBS-06 adds the request, the trace, the tenant and the user of the request that is running', () => {
    const reporter = createMemoryReporter();
    requestContext.run({ requestId: 'r1', traceId: 't1', spanId: 's1', tenantId: 'tenant', userId: 'user' }, () => {
      reportError(reporter, new Error('x'), { source: 'http' });
    });
    expect(reporter.reports[0]?.context).toEqual({
      source: 'http',
      requestId: 'r1',
      traceId: 't1',
      spanId: 's1',
      tenantId: 'tenant',
      userId: 'user',
    });
  });

  it('OBS-06 what the caller gives wins over the request, and nothing is invented outside a request', () => {
    const reporter = createMemoryReporter();
    reportError(reporter, 'text', { source: 'process', level: 'fatal' });
    requestContext.run({ requestId: 'r1', tenantId: 'a' }, () => {
      reportError(reporter, new Error('x'), { source: 'job', tenantId: 'b', requestId: 'job-1' });
    });
    expect(reporter.reports[0]?.context).toEqual({ source: 'process', level: 'fatal' });
    expect(reporter.reports[1]?.context).toMatchObject({ requestId: 'job-1', tenantId: 'b' });
  });

  it('OBS-06 a reporter that throws never breaks the code that reports', () => {
    expect(() => reportError(boom, new Error('x'), { source: 'http' })).not.toThrow();
  });
});

describe('OBS-06 reporters', () => {
  it('OBS-06 the noop reporter does nothing and has nothing to flush', async () => {
    const reporter = createNoopReporter();
    reporter.report(new Error('x'), { source: 'http' });
    expect(await reporter.flush()).toBe(true);
  });

  it('OBS-06 the composite gives every report to every reporter, also after one throws', async () => {
    const a = createMemoryReporter();
    const b = createMemoryReporter();
    const composite = createCompositeReporter([a, boom, b]);
    composite.report(new Error('x'), { source: 'http' });
    expect(a.reports).toHaveLength(1);
    expect(b.reports).toHaveLength(1);
    expect(await composite.flush()).toBe(false);
    expect(await createCompositeReporter([a, b]).flush()).toBe(true);
  });
});
