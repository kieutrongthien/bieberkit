/**
 * BieberKit
 *
 * @file        packages/core/src/index.ts
 * @description Public entry point of @bieberkit/core.
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

// Public API of @bieberkit/core. Implementation starts after the Phase 0 ADRs (docs/adr/README.md).

/** npm name of this package. */
export const packageName = '@bieberkit/core';

export { BkError, ConfigError, ContainerError, EnvValidationError, toBkError } from './errors/errors.ts';
export type { BkErrorOptions, EnvProblem, ErrorBody } from './errors/errors.ts';

export { collectSecrets, defineEnv, describeEnv, env, mergeEnv, readEnv, redact } from './config/env.ts';
export type {
  EnvCustomParse,
  EnvDescription,
  EnvKeyBuilder,
  EnvKeyDef,
  EnvKind,
  EnvOwner,
  EnvSchema,
  EnvSource,
  EnvValues,
  IntOptions,
} from './config/env.ts';
export { parseEnvFile, readEnvFile, withEnvFile } from './config/env-file.ts';
export { assertProductionSafe, coreEnv, readCoreEnv } from './config/core-env.ts';
export type { AppEnv, CoreEnv, CoreEnvResult, CoreEnvValues, ReadCoreEnvOptions } from './config/core-env.ts';
export { loadEnv } from './config/load-env.ts';
export type { LoadEnvOptions } from './config/load-env.ts';
export { LOG_LEVELS } from './logging/levels.ts';
export type { LogLevel } from './logging/levels.ts';
export { createErrorReporterFromConfig } from './reporting/from-config.ts';
export type { ReporterConfig, ReporterFromConfigOptions } from './reporting/from-config.ts';
export { installProcessHandlers } from './reporting/process-handlers.ts';
export type { ProcessHandlerOptions, ProcessLike } from './reporting/process-handlers.ts';
export {
  createCompositeReporter,
  createMemoryReporter,
  createNoopReporter,
  reportError,
} from './reporting/reporter.ts';
export type {
  ErrorReporter,
  ErrorReportContext,
  MemoryReporter,
  ReportLevel,
  ReportSource,
} from './reporting/reporter.ts';
export { createSentryReporter, framesOf, parseDsn } from './reporting/sentry.ts';
export type { ParsedDsn, SentryReporterOptions } from './reporting/sentry.ts';
export { createLogger, createLogSanitizer, RESERVED_LOG_FIELDS } from './logging/logger.ts';
export type { LogFields, Logger, LoggerOptions, LogSanitizer } from './logging/logger.ts';
export { createOtlpExporter, createTracerFromConfig, otlpTraceBody } from './observability/otlp.ts';
export type { OtlpExporterOptions, TracerFromConfigOptions, TracingConfig } from './observability/otlp.ts';
export { createMetrics, createNoopMetrics, DEFAULT_BUCKETS } from './observability/metrics.ts';
export type {
  CollectorOptions,
  Counter,
  Gauge,
  Histogram,
  HistogramOptions,
  MetricLabels,
  MetricOptions,
  MetricSample,
  Metrics,
} from './observability/metrics.ts';
export { startMetricsServer } from './observability/metrics-server.ts';
export type { MetricsServer, MetricsServerOptions } from './observability/metrics-server.ts';
export { registerProcessMetrics } from './observability/process-metrics.ts';
export { createMemorySpanExporter, createNoopTracer, createTracer } from './observability/tracing.ts';
export type {
  AttributeValue,
  FinishedSpan,
  MemorySpanExporter,
  OpenSpan,
  Span,
  SpanAttributes,
  SpanExporter,
  SpanKind,
  SpanOptions,
  Tracer,
  TracerOptions,
} from './observability/tracing.ts';
export { formatTraceparent, parseTraceparent } from './observability/traceparent.ts';
export type { TraceParent } from './observability/traceparent.ts';
export { requestContext } from './logging/request-context.ts';
export type { RequestContext } from './logging/request-context.ts';
export { createContainer } from './container/container.ts';
export type {
  Container,
  Registration,
  RequestScope,
  ServiceName,
  ServiceRegistry,
  ServiceScope,
} from './container/container.ts';
export { createLifecycle, exitCode } from './lifecycle/lifecycle.ts';
export type { Hook, HookFailure, Lifecycle, LifecycleOptions, Phase, StopResult } from './lifecycle/lifecycle.ts';
export { createEventBus } from './events/events.ts';
export type {
  EmitResult,
  EventBus,
  EventBusOptions,
  EventHandler,
  EventName,
  EventRegistry,
  HandlerFailure,
  ModuleEmitter,
  OnOptions,
} from './events/events.ts';
export { parseRole, ROLES } from './roles/roles.ts';
export type { Role } from './roles/roles.ts';
export { DIALECTS } from './config/dialects.ts';
export type { Dialect } from './config/dialects.ts';
export { runParser } from './config/parser.ts';
export type { Parser } from './config/parser.ts';
export { ConfigValidationError } from './errors/errors.ts';
export type { ConfigProblem } from './errors/errors.ts';
export { defineSetting, SettingError } from './settings/define-setting.ts';
export type { LocalizedText, SettingDef, SettingInput, SettingScope, SettingType } from './settings/define-setting.ts';
export { defineModule, registerModule } from './module/define-module.ts';
export type { ModuleContributions, ModuleDef, ModuleInput, ServiceDefs } from './module/define-module.ts';
export { PluginError } from './plugins/errors.ts';
export type { PluginProblem } from './plugins/errors.ts';
export { satisfies } from './plugins/range.ts';
export { definePlugin, parsePluginOptions } from './plugins/define-plugin.ts';
export type { PluginDef, PluginInput, SeedFn } from './plugins/define-plugin.ts';
export { checkManifest, toManifest } from './plugins/manifest.ts';
export type { KeyCollector, Manifest, ManifestCheck } from './plugins/manifest.ts';
export { resolvePlugins } from './plugins/resolver.ts';
export type { Installed, ResolveContext, Resolution } from './plugins/resolver.ts';
export { defineConfig, defineConfigSection, validateConfig } from './config/define-config.ts';
export type {
  ConfigSection,
  ConfigSections,
  PluginEntry,
  ProjectConfigInput,
  ValidateConfigOptions,
} from './config/define-config.ts';
