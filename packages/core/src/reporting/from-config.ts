/**
 * BieberKit
 *
 * @file        packages/core/src/reporting/from-config.ts
 * @description createErrorReporterFromConfig: the reporter that ERROR_REPORTER_DSN selects, or one that does nothing (OBS-06).
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

import type { Logger } from '../logging/logger.ts';
import type { ErrorReporter } from './reporter.ts';
import { createNoopReporter } from './reporter.ts';
import { createSentryReporter } from './sentry.ts';

/** The part of the validated config (`CoreEnv`) that decides the reporter. */
export interface ReporterConfig {
  readonly APP_ENV: string;
  readonly ERROR_REPORTER_DSN: string | undefined;
  /** The share of reports that is sent, as a percent from 0 to 100. */
  readonly ERROR_REPORTER_SAMPLE_PERCENT: number;
}

export interface ReporterFromConfigOptions {
  readonly logger: Logger;
  /** The version that is running, for example the git sha. It groups reports by release. */
  readonly release?: string;
  /** The secrets of the environment, to keep out of the messages. */
  readonly secrets?: readonly string[];
}

/** A Sentry compatible reporter when `ERROR_REPORTER_DSN` is set, and one that does nothing when it is not. */
export function createErrorReporterFromConfig(
  config: ReporterConfig,
  options: ReporterFromConfigOptions,
): ErrorReporter {
  if (config.ERROR_REPORTER_DSN === undefined) return createNoopReporter();
  return createSentryReporter({
    dsn: config.ERROR_REPORTER_DSN,
    environment: config.APP_ENV,
    sampleRate: config.ERROR_REPORTER_SAMPLE_PERCENT / 100,
    logger: options.logger,
    ...(options.release === undefined ? {} : { release: options.release }),
    ...(options.secrets === undefined ? {} : { secrets: options.secrets }),
  });
}
