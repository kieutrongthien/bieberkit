/**
 * BieberKit
 *
 * @file        packages/server/src/observe.ts
 * @description Makes what every role shares: the logger with its redaction, the error reporter, the tracer, the metrics and their server on METRICS_PORT (OBS-01 to OBS-06, ADR 0022, ADR 0023).
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

import {
  collectSecrets,
  coreEnv,
  createErrorReporterFromConfig,
  createMetrics,
  createTracerFromConfig,
  installProcessHandlers,
  mergeEnv,
  registerProcessMetrics,
  startMetricsServer,
} from '@bieberkit/core';
import type { CoreEnv, EnvOwner, ErrorReporter, Logger, Metrics, MetricsServer, Tracer } from '@bieberkit/core';
import type { EntityDef } from '@bieberkit/data';
import { piiFields } from '@bieberkit/data/schema';
import { createPinoLogger } from '@bieberkit/log/pino';

export interface Observability {
  readonly logger: Logger;
  readonly reporter: ErrorReporter;
  readonly tracer: Tracer;
  readonly metrics: Metrics;
  readonly secrets: readonly string[];
  /** The port of the metrics server, or `undefined` when it could not be bound. */
  readonly metricsPort: number | undefined;
  /** Flushes what is held and stops what was started. */
  close(): Promise<void>;
}

export interface ObserveInput {
  readonly role: string;
  readonly env: CoreEnv;
  /** The values of the env keys of the plugins. */
  readonly extra: Readonly<Record<string, unknown>>;
  readonly owners: readonly EnvOwner[];
  readonly entities: readonly EntityDef<string>[];
  /** Start the server of the metrics. A second role in the same process does not start another. */
  readonly metricsServer: boolean;
  /** Install the handlers of `uncaughtException` and `unhandledRejection` (OBS-06). */
  readonly processHandlers: boolean;
}

/**
 * The logger redacts the secrets of the environment and the fields of personal data of the entities (SEC-09). Tracing is off with no
 * endpoint, the metrics server never stops the process when its port is taken (the web role matters more), and a reporter that is
 * not configured does nothing.
 */
export async function observe(input: ObserveInput): Promise<Observability> {
  const schema = mergeEnv([{ name: 'core', schema: coreEnv }, ...input.owners]);
  const secrets = collectSecrets(schema, { ...input.env, ...input.extra });
  const logger = createPinoLogger({
    level: input.env.LOG_LEVEL,
    role: input.role,
    secrets,
    redactKeys: piiFields(input.entities).map((field) => field.field),
  });
  const reporter = createErrorReporterFromConfig(input.env, { logger, secrets });
  const tracer = createTracerFromConfig(input.env, { logger, role: input.role });
  const metrics = createMetrics();
  const stopProcessMetrics = registerProcessMetrics(metrics);
  const removeHandlers = input.processHandlers ? installProcessHandlers({ reporter, logger }) : () => undefined;
  let server: MetricsServer | undefined;
  if (input.metricsServer) {
    try {
      server = await startMetricsServer({ metrics, port: input.env.METRICS_PORT, logger });
    } catch (error) {
      logger.warn('the metrics server did not start', {
        reason: error instanceof Error ? error.message : String(error),
      });
    }
  }
  return {
    logger,
    reporter,
    tracer,
    metrics,
    secrets,
    metricsPort: server?.port,
    close: async () => {
      removeHandlers();
      stopProcessMetrics();
      await server?.close();
      await tracer.flush(2_000);
      await reporter.flush(2_000);
    },
  };
}
