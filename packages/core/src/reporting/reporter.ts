/**
 * BieberKit
 *
 * @file        packages/core/src/reporting/reporter.ts
 * @description The error-reporter port: what is reported with an error, the reporters that do nothing or keep the reports, and the helper that adds the request context (OBS-06).
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

import { requestContext } from '../logging/request-context.ts';

export type ReportSource = 'http' | 'job' | 'process' | 'client';
export type ReportLevel = 'warning' | 'error' | 'fatal';

/** What is known about the place where an error happened. Nothing in it is personal data: ids only, never an e-mail or a body. */
export interface ErrorReportContext {
  readonly source: ReportSource;
  readonly level?: ReportLevel;
  readonly requestId?: string;
  readonly traceId?: string;
  readonly spanId?: string;
  readonly tenantId?: string;
  readonly userId?: string;
  /** The route that failed. `path` has no query string. */
  readonly http?: { readonly method: string; readonly path: string; readonly status?: number };
  readonly job?: { readonly name: string; readonly id: string; readonly queue: string; readonly attempt: number };
  /** Short labels that a report can be searched by. Values are strings of at most 200 characters. */
  readonly tags?: Readonly<Record<string, string>>;
}

/**
 * Where unhandled errors are sent (OBS-06). `report` never throws and never waits: it hands the error over and returns, so a reporter
 * that is slow or down cannot slow or break a request. `flush` waits for what was handed over, for at most `timeoutMs`, and says
 * whether it all went out.
 */
export interface ErrorReporter {
  report(error: unknown, context: ErrorReportContext): void;
  flush(timeoutMs?: number): Promise<boolean>;
}

/** A reporter for projects that did not configure one. */
export function createNoopReporter(): ErrorReporter {
  return { report: () => undefined, flush: async () => true };
}

export interface MemoryReporter extends ErrorReporter {
  readonly reports: readonly { readonly error: unknown; readonly context: ErrorReportContext }[];
}

/** Keeps the reports in a list, for tests of the code that reports. */
export function createMemoryReporter(): MemoryReporter {
  const reports: { error: unknown; context: ErrorReportContext }[] = [];
  return {
    reports,
    report(error, context) {
      reports.push({ error, context });
    },
    flush: async () => true,
  };
}

/** Sends every report to every reporter. One that throws does not stop the others. */
export function createCompositeReporter(reporters: readonly ErrorReporter[]): ErrorReporter {
  return {
    report(error, context) {
      for (const reporter of reporters) {
        try {
          reporter.report(error, context);
        } catch {
          // A reporter must not throw, and if it does the others still get the report.
        }
      }
    },
    async flush(timeoutMs) {
      const results = await Promise.all(reporters.map((reporter) => reporter.flush(timeoutMs).catch(() => false)));
      return results.every(Boolean);
    },
  };
}

/**
 * Reports `error`, filling the request, trace, tenant and user from the request that is running when the context does not give them.
 * It is the one call that code uses, so a report always carries the same ids as the log lines of the same request.
 */
export function reportError(reporter: ErrorReporter, error: unknown, context: ErrorReportContext): void {
  const known = requestContext.get();
  try {
    reporter.report(error, {
      ...(known?.requestId === undefined ? {} : { requestId: known.requestId }),
      ...(known?.traceId === undefined ? {} : { traceId: known.traceId }),
      ...(known?.spanId === undefined ? {} : { spanId: known.spanId }),
      ...(known?.tenantId === undefined ? {} : { tenantId: known.tenantId }),
      ...(known?.userId === undefined ? {} : { userId: known.userId }),
      ...context,
    });
  } catch {
    // A failing reporter is never the reason that a request or a job fails.
  }
}
