/**
 * BieberKit
 *
 * @file        packages/core/src/reporting/from-config.test.ts
 * @description Tests of createErrorReporterFromConfig: no DSN is a reporter that does nothing, a DSN is a Sentry compatible one with the sample rate and the secrets (OBS-06).
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
import { createLogger } from '../logging/logger.ts';
import { createErrorReporterFromConfig } from './from-config.ts';
import type { ReporterConfig } from './from-config.ts';

const logger = createLogger({ level: 'fatal', role: 'web', write: () => undefined });
const base: ReporterConfig = {
  APP_ENV: 'production',
  ERROR_REPORTER_DSN: undefined,
  ERROR_REPORTER_SAMPLE_PERCENT: 100,
};

describe('OBS-06 createErrorReporterFromConfig', () => {
  it('OBS-06 with no DSN it does nothing and the flush is true', async () => {
    const reporter = createErrorReporterFromConfig(base, { logger });
    reporter.report(new Error('x'), { source: 'http' });
    expect(await reporter.flush()).toBe(true);
  });

  it('OBS-06 a DSN that is not valid fails at once, not at the first error', () => {
    const reporter = createErrorReporterFromConfig(
      { ...base, ERROR_REPORTER_DSN: 'https://k@host/1' },
      { logger, release: 'r1' },
    );
    expect(typeof reporter.report).toBe('function');
    expect(() => createErrorReporterFromConfig({ ...base, ERROR_REPORTER_DSN: 'https://host/1' }, { logger })).toThrow(
      /not valid/,
    );
  });

  it('OBS-06 uses the percent as a rate, the environment, the release and the secrets', async () => {
    const bodies: string[] = [];
    const original = globalThis.fetch;
    globalThis.fetch = async (_input, init) => {
      bodies.push(typeof init?.body === 'string' ? init.body : '');
      return new Response('{}');
    };
    try {
      const none = createErrorReporterFromConfig(
        { ...base, ERROR_REPORTER_DSN: 'https://k@host/1', ERROR_REPORTER_SAMPLE_PERCENT: 0 },
        { logger },
      );
      none.report(new Error('dropped'), { source: 'http' });
      await none.flush();
      expect(bodies).toHaveLength(0);
      const all = createErrorReporterFromConfig(
        { ...base, ERROR_REPORTER_DSN: 'https://k@host/1' },
        { logger, release: 'r1', secrets: ['topsecret'] },
      );
      all.report(new Error('has topsecret inside'), { source: 'http' });
      await all.flush();
      expect(bodies).toHaveLength(1);
      expect(bodies[0]).toContain('"environment":"production"');
      expect(bodies[0]).toContain('"release":"r1"');
      expect(bodies[0]).not.toContain('topsecret');
    } finally {
      globalThis.fetch = original;
    }
  });
});
