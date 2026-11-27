<!--
  BieberKit

  @file        packages/core/api/index.api.md
  @description API report of @bieberkit/core: its public surface, checked in CI and reviewed in pull requests.
  @author      Bieber Kieu <kieutrongthien@gmail.com>
  @generated   pnpm api:update
  @copyright   Copyright (c) 2026 Bieber Kieu
  @license     Apache-2.0

  Licensed under the Apache License, Version 2.0 (the "License");
  you may not use this file except in compliance with the License.
  You may obtain a copy of the License at

      http://www.apache.org/licenses/LICENSE-2.0

  Unless required by applicable law or agreed to in writing, software
  distributed under the License is distributed on an "AS IS" BASIS,
  WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
  See the License for the specific language governing permissions and
  limitations under the License.

  SPDX-License-Identifier: Apache-2.0
-->

# API report: @bieberkit/core

Generated from the built declaration files by `pnpm api:update`. Do not edit by hand. A change here is a change to the public API and needs a changeset (spec section 22.3).

```ts
interface ErrorBody {
  readonly code: string;
  readonly status: number;
  readonly message: string;
  readonly fix: string;
}
interface BkErrorOptions {
  readonly code: string;
  readonly status?: number;
  readonly safeMessage?: string;
  readonly fix?: string;
  readonly cause?: unknown;
}
export declare class BkError extends Error {
  readonly code: string;
  readonly status: number;
  readonly safeMessage: string;
  readonly fix: string;
  constructor(message: string, options: BkErrorOptions);
  toJSON(): ErrorBody;
}
export declare class ConfigError extends BkError {}
export declare class ContainerError extends BkError {}
interface EnvProblem {
  readonly key: string;
  readonly code: "CFG_ENV_MISSING" | "CFG_ENV_INVALID";
  readonly message: string;
  readonly fix: string;
}
export declare class EnvValidationError extends ConfigError {
  readonly problems: readonly EnvProblem[];
  constructor(problems: readonly EnvProblem[]);
}
interface ConfigProblem {
  readonly key: string;
  readonly code: "CFG_CONFIG_INVALID" | "CFG_CONFIG_UNKNOWN" | "CFG_CONFIG_SECRET";
  readonly message: string;
  readonly fix: string;
}
export declare class ConfigValidationError extends ConfigError {
  readonly problems: readonly ConfigProblem[];
  constructor(problems: readonly ConfigProblem[]);
}
export declare function toBkError(value: unknown): BkError;
type EnvKind = "string" | "int" | "boolean" | "enum" | "url" | "base64" | "custom";
type EnvCustomParse<T> = (raw: string) => {
  readonly value: T;
} | undefined;
type EnvSource = Readonly<Record<string, string | undefined>>;
interface EnvKeyDef {
  readonly kind: EnvKind;
  readonly values?: readonly string[];
  readonly expected?: string;
  readonly parse?: EnvCustomParse<unknown>;
  readonly min?: number;
  readonly max?: number;
  readonly hasDefault: boolean;
  readonly default?: unknown;
  readonly optional: boolean;
  readonly secret: boolean;
  readonly description: string;
}
interface EnvKeyBuilder<T> {
  readonly def: EnvKeyDef;
  readonly _type?: T;
  default(value: T): EnvKeyBuilder<T>;
  optional(): EnvKeyBuilder<T | undefined>;
  secret(): EnvKeyBuilder<T>;
  describe(text: string): EnvKeyBuilder<T>;
}
interface EnvSchema<T> {
  readonly keys: Readonly<Record<string, EnvKeyDef>>;
  readonly _type?: T;
}
interface EnvOwner {
  readonly name: string;
  readonly prefix?: string;
  readonly schema: EnvSchema<unknown>;
}
interface EnvDescription {
  readonly key: string;
  readonly type: EnvKind;
  readonly required: boolean;
  readonly default?: string;
  readonly secret: boolean;
  readonly description: string;
  readonly values?: readonly string[];
  readonly expected?: string;
}
interface IntOptions {
  readonly min?: number;
  readonly max?: number;
}
export declare const env: {
  string(): EnvKeyBuilder<string>;
  int(options?: IntOptions): EnvKeyBuilder<number>;
  boolean(): EnvKeyBuilder<boolean>;
  enum<V extends string>(values: readonly V[]): EnvKeyBuilder<V>;
  url(): EnvKeyBuilder<string>;
  base64(): EnvKeyBuilder<string>;
  custom<T>(expected: string, parse: EnvCustomParse<T>): EnvKeyBuilder<T>;
};
type EnvValues<K extends Record<string, EnvKeyBuilder<unknown>>> = { [P in keyof K]: K[P] extends EnvKeyBuilder<infer T> ? T : never; };
export declare function defineEnv<K extends Record<string, EnvKeyBuilder<unknown>>>(keys: K): EnvSchema<EnvValues<K>>;
export declare function mergeEnv(owners: readonly EnvOwner[]): EnvSchema<Record<string, unknown>>;
export declare function readEnv<T>(schema: EnvSchema<T>, source: EnvSource): T;
export declare function redact(schema: EnvSchema<unknown>, values: object): Record<string, unknown>;
export declare function collectSecrets(schema: EnvSchema<unknown>, values: object): string[];
export declare function describeEnv<T>(schema: EnvSchema<T>): readonly EnvDescription[];
export declare function parseEnvFile(text: string): EnvSource;
export declare function withEnvFile(real: EnvSource, file: EnvSource): EnvSource;
export declare function readEnvFile(path: string): EnvSource;
export declare const LOG_LEVELS: readonly ["fatal", "error", "warn", "info", "debug", "trace"];
type LogLevel = (typeof LOG_LEVELS)[number];
export declare const DIALECTS: readonly ["postgres", "mysql", "sqlite"];
type Dialect = (typeof DIALECTS)[number];
type AppEnv = "development" | "test" | "production";
interface CoreEnvValues {
  APP_NAME: string;
  APP_ENV: AppEnv;
  APP_URL: string;
  ADMIN_URL: string | undefined;
  ADMIN_ASSETS_DIR: string | undefined;
  APP_PORT: number;
  APP_KEY: string | undefined;
  APP_KEY_PREVIOUS: string | undefined;
  APP_SINGLE_NODE: boolean;
  AUTH_SECRET: string | undefined;
  LOG_LEVEL: LogLevel;
  TRUST_PROXY: boolean | number;
  DB_CONNECTION: Dialect | undefined;
  DATABASE_URL: string | undefined;
  DATABASE_READ_URLS: readonly string[];
  MIGRATE_DATABASE_URL: string | undefined;
  DEPLOY_ID: string | undefined;
  DB_POOL_MAX: number;
  REDIS_URL: string | undefined;
  CACHE_REDIS_URL: string | undefined;
  QUEUE_DRIVER: "sync" | "database" | "redis";
  CACHE_DRIVER: "memory" | "file" | "database" | "redis";
  CACHE_PREFIX: string | undefined;
  STORAGE_DISK: "local" | "s3";
  STORAGE_LOCAL_ROOT: string;
  S3_BUCKET: string | undefined;
  S3_REGION: string | undefined;
  S3_ENDPOINT: string | undefined;
  S3_ACCESS_KEY_ID: string | undefined;
  S3_SECRET_ACCESS_KEY: string | undefined;
  S3_FORCE_PATH_STYLE: boolean;
  MAIL_DRIVER: "log" | "smtp";
  SMTP_URL: string | undefined;
  MAIL_FROM: string | undefined;
  ERROR_REPORTER_DSN: string | undefined;
  ERROR_REPORTER_SAMPLE_PERCENT: number;
  OTEL_EXPORTER_OTLP_ENDPOINT: string | undefined;
  METRICS_PORT: number;
  API_DOCS_PUBLIC: boolean;
  SITE_URL: string | undefined;
  SITE_API_URL: string | undefined;
  SITE_SERVICE_TOKEN: string | undefined;
  SITE_REVALIDATE_SECRET: string | undefined;
}
interface CoreEnv extends Omit<CoreEnvValues, "APP_KEY" | "AUTH_SECRET" | "CACHE_PREFIX"> {
  APP_KEY: string;
  AUTH_SECRET: string;
  CACHE_PREFIX: string;
}
export declare const coreEnv: EnvSchema<CoreEnvValues>;
interface ReadCoreEnvOptions {
  readonly extra?: readonly EnvOwner[];
  readonly random?: () => string;
}
interface CoreEnvResult {
  readonly env: CoreEnv;
  readonly extra: Readonly<Record<string, unknown>>;
  readonly warnings: readonly string[];
}
export declare function readCoreEnv(source: EnvSource, options?: ReadCoreEnvOptions): CoreEnvResult;
export declare function assertProductionSafe(values: CoreEnv): void;
interface LoadEnvOptions extends ReadCoreEnvOptions {
  readonly source?: EnvSource;
  readonly envFile?: string | false;
}
export declare function loadEnv(options?: LoadEnvOptions): CoreEnvResult;
type LogFields = Readonly<Record<string, unknown>>;
interface Logger {
  readonly level: LogLevel;
  fatal(message: string, fields?: LogFields): void;
  error(message: string, fields?: LogFields): void;
  warn(message: string, fields?: LogFields): void;
  info(message: string, fields?: LogFields): void;
  debug(message: string, fields?: LogFields): void;
  trace(message: string, fields?: LogFields): void;
  child(bindings: LogFields): Logger;
}
interface LoggerOptions {
  readonly level: LogLevel;
  readonly role: string;
  readonly write?: (line: string) => void;
  readonly secrets?: readonly string[];
  readonly redactKeys?: readonly string[];
  readonly now?: () => Date;
}
export declare const RESERVED_LOG_FIELDS: ReadonlySet<string>;
interface LogSanitizer {
  clean(value: unknown, key?: string): unknown;
  text(value: string): string;
}
export declare function createLogSanitizer(secrets: readonly string[], redactKeys?: readonly string[]): LogSanitizer;
export declare function createLogger(options: LoggerOptions): Logger;
type ReportSource = "http" | "job" | "process" | "client";
type ReportLevel = "warning" | "error" | "fatal";
interface ErrorReportContext {
  readonly source: ReportSource;
  readonly level?: ReportLevel;
  readonly requestId?: string;
  readonly traceId?: string;
  readonly spanId?: string;
  readonly tenantId?: string;
  readonly userId?: string;
  readonly http?: {
    readonly method: string;
    readonly path: string;
    readonly status?: number;
  };
  readonly job?: {
    readonly name: string;
    readonly id: string;
    readonly queue: string;
    readonly attempt: number;
  };
  readonly tags?: Readonly<Record<string, string>>;
}
interface ErrorReporter {
  report(error: unknown, context: ErrorReportContext): void;
  flush(timeoutMs?: number): Promise<boolean>;
}
export declare function createNoopReporter(): ErrorReporter;
interface MemoryReporter extends ErrorReporter {
  readonly reports: readonly {
    readonly error: unknown;
    readonly context: ErrorReportContext;
  }[];
}
export declare function createMemoryReporter(): MemoryReporter;
export declare function createCompositeReporter(reporters: readonly ErrorReporter[]): ErrorReporter;
export declare function reportError(reporter: ErrorReporter, error: unknown, context: ErrorReportContext): void;
interface ReporterConfig {
  readonly APP_ENV: string;
  readonly ERROR_REPORTER_DSN: string | undefined;
  readonly ERROR_REPORTER_SAMPLE_PERCENT: number;
}
interface ReporterFromConfigOptions {
  readonly logger: Logger;
  readonly release?: string;
  readonly secrets?: readonly string[];
}
export declare function createErrorReporterFromConfig(config: ReporterConfig, options: ReporterFromConfigOptions): ErrorReporter;
interface ProcessLike {
  on(event: "uncaughtException" | "unhandledRejection", listener: (reason: unknown) => void): unknown;
  off(event: "uncaughtException" | "unhandledRejection", listener: (reason: unknown) => void): unknown;
  exit(code: number): void;
}
interface ProcessHandlerOptions {
  readonly reporter: ErrorReporter;
  readonly logger: Logger;
  readonly flushMs?: number;
  readonly process?: ProcessLike;
}
export declare function installProcessHandlers(options: ProcessHandlerOptions): () => void;
interface SentryReporterOptions {
  readonly dsn: string;
  readonly environment?: string;
  readonly release?: string;
  readonly sampleRate?: number;
  readonly secrets?: readonly string[];
  readonly maxPerMinute?: number;
  readonly timeoutMs?: number;
  readonly logger?: Logger;
  readonly fetch?: typeof fetch;
  readonly now?: () => number;
  readonly random?: () => number;
}
interface ParsedDsn {
  readonly publicKey: string;
  readonly endpoint: string;
}
export declare function parseDsn(dsn: string): ParsedDsn;
interface Frame {
  readonly filename: string;
  readonly function?: string;
  readonly lineno?: number;
  readonly colno?: number;
  readonly in_app: boolean;
}
export declare function framesOf(stack: string | undefined): Frame[];
export declare function createSentryReporter(options: SentryReporterOptions): ErrorReporter;
interface TraceParent {
  readonly traceId: string;
  readonly spanId: string;
}
export declare function parseTraceparent(header: string | readonly string[] | undefined): TraceParent | undefined;
export declare function formatTraceparent(trace: TraceParent): string;
type AttributeValue = string | number | boolean;
type SpanAttributes = Readonly<Record<string, AttributeValue | undefined>>;
type SpanKind = "internal" | "server" | "client" | "producer" | "consumer";
interface SpanOptions {
  readonly kind?: SpanKind;
  readonly attributes?: SpanAttributes;
  readonly parent?: {
    readonly traceId: string;
    readonly spanId?: string;
  };
}
interface Span {
  readonly traceId: string;
  readonly spanId: string;
  setAttribute(key: string, value: AttributeValue): void;
  fail(error: unknown): void;
}
interface OpenSpan extends Span {
  end(durationNs?: number): void;
}
interface FinishedSpan {
  readonly traceId: string;
  readonly spanId: string;
  readonly parentSpanId?: string;
  readonly name: string;
  readonly kind: SpanKind;
  readonly startNs: bigint;
  readonly endNs: bigint;
  readonly attributes: Readonly<Record<string, AttributeValue>>;
  readonly failed: boolean;
}
interface SpanExporter {
  export(span: FinishedSpan): void;
  flush(timeoutMs?: number): Promise<boolean>;
}
interface Tracer {
  readonly enabled: boolean;
  span<T>(name: string, options: SpanOptions, fn: (span: Span) => T | Promise<T>): Promise<T>;
  startSpan(name: string, options: SpanOptions): OpenSpan;
  within<T>(span: Span, fn: () => T): T;
  record(name: string, options: SpanOptions & {
    readonly durationMs: number;
    readonly failed?: boolean;
  }): void;
  current(): TraceParent | undefined;
  flush(timeoutMs?: number): Promise<boolean>;
}
export declare function createNoopTracer(): Tracer;
interface TracerOptions {
  readonly exporter: SpanExporter;
  readonly nowNs?: () => bigint;
}
export declare function createTracer(options: TracerOptions): Tracer;
interface MemorySpanExporter extends SpanExporter {
  readonly spans: readonly FinishedSpan[];
}
export declare function createMemorySpanExporter(): MemorySpanExporter;
interface OtlpExporterOptions {
  readonly endpoint: string;
  readonly resource: Readonly<Record<string, string>>;
  readonly logger?: Logger;
  readonly batchSize?: number;
  readonly maxQueue?: number;
  readonly intervalMs?: number;
  readonly timeoutMs?: number;
  readonly fetch?: typeof fetch;
}
export declare function otlpTraceBody(spans: readonly FinishedSpan[], resource: Readonly<Record<string, string>>): unknown;
export declare function createOtlpExporter(options: OtlpExporterOptions): SpanExporter & {
  readonly dropped: () => number;
};
interface TracingConfig {
  readonly APP_ENV: string;
  readonly OTEL_EXPORTER_OTLP_ENDPOINT: string | undefined;
}
interface TracerFromConfigOptions {
  readonly logger: Logger;
  readonly role: string;
  readonly serviceName?: string;
  readonly release?: string;
  readonly fetch?: typeof fetch;
}
export declare function createTracerFromConfig(config: TracingConfig, options: TracerFromConfigOptions): Tracer;
type MetricLabels = Readonly<Record<string, string>>;
interface Counter {
  inc(labels?: MetricLabels, by?: number): void;
}
interface Gauge {
  set(value: number, labels?: MetricLabels): void;
}
interface Histogram {
  observe(value: number, labels?: MetricLabels): void;
}
interface MetricOptions {
  readonly labels?: readonly string[];
}
interface HistogramOptions extends MetricOptions {
  readonly buckets?: readonly number[];
}
interface MetricSample {
  readonly value: number;
  readonly labels?: MetricLabels;
}
interface CollectorOptions extends MetricOptions {
  readonly type?: "gauge" | "counter";
}
interface Metrics {
  counter(name: string, help: string, options?: MetricOptions): Counter;
  gauge(name: string, help: string, options?: MetricOptions): Gauge;
  histogram(name: string, help: string, options?: HistogramOptions): Histogram;
  collect(name: string, help: string, options: CollectorOptions, read: () => readonly MetricSample[] | Promise<readonly MetricSample[]>): void;
  render(): Promise<string>;
}
export declare const DEFAULT_BUCKETS: readonly number[];
export declare function createMetrics(): Metrics;
export declare function createNoopMetrics(): Metrics;
interface MetricsServerOptions {
  readonly metrics: Metrics;
  readonly port: number;
  readonly host?: string;
  readonly logger?: Logger;
}
interface MetricsServer {
  readonly port: number;
  close(): Promise<void>;
}
export declare function startMetricsServer(options: MetricsServerOptions): Promise<MetricsServer>;
export declare function registerProcessMetrics(metrics: Metrics): () => void;
interface RequestContext {
  requestId: string;
  traceId?: string;
  spanId?: string;
  tenantId?: string;
  userId?: string;
}
export declare const requestContext: {
  run<T>(context: RequestContext, fn: () => T): T;
  get(): RequestContext | undefined;
  update(patch: Partial<RequestContext>): void;
};
interface Parser<T> {
  parse(input: unknown): T;
}
export declare function runParser<T>(parser: Parser<T>, input: unknown, path: string): T;
export declare class SettingError extends BkError {}
type LocalizedText = {
  readonly en: string;
} & Readonly<Record<string, string>>;
type SettingType = "string" | "number" | "boolean" | "enum" | "json";
type SettingScope = "global" | "tenant";
interface SettingActor {
  readonly ip: string;
  readonly mfa: boolean;
}
interface Common {
  readonly key: string;
  readonly label: LocalizedText;
  readonly description?: LocalizedText;
  readonly group?: string;
  readonly scope?: SettingScope;
  readonly public?: boolean;
  readonly secret?: boolean;
  readonly guard?: (value: unknown, actor: SettingActor) => boolean;
}
type SettingInput<T> = (Common & {
  readonly type: "string";
  readonly default: T & string;
}) | (Common & {
  readonly type: "number";
  readonly default: T & number;
}) | (Common & {
  readonly type: "boolean";
  readonly default: T & boolean;
}) | (Common & {
  readonly type: "enum";
  readonly values: readonly (T & string)[];
  readonly default: T & string;
}) | (Common & {
  readonly type: "json";
  readonly parser: Parser<T>;
  readonly default: T;
});
interface SettingDef<T = unknown> {
  readonly key: string;
  readonly type: SettingType;
  readonly default: T;
  readonly label: LocalizedText;
  readonly description?: LocalizedText;
  readonly group?: string;
  readonly scope: SettingScope;
  readonly public: boolean;
  readonly secret: boolean;
  readonly values?: readonly string[];
  check(input: unknown): T;
  readonly guard?: (value: unknown, actor: SettingActor) => boolean;
}
export declare function defineSetting<const T extends string>(input: Common & {
  readonly type: "enum";
  readonly values: readonly T[];
  readonly default: NoInfer<T>;
}): SettingDef<T>;
export declare function defineSetting<T>(input: Common & {
  readonly type: "json";
  readonly parser: Parser<T>;
  readonly default: T;
}): SettingDef<T>;
export declare function defineSetting(input: Common & {
  readonly type: "string";
  readonly default: string;
}): SettingDef<string>;
export declare function defineSetting(input: Common & {
  readonly type: "number";
  readonly default: number;
}): SettingDef<number>;
export declare function defineSetting(input: Common & {
  readonly type: "boolean";
  readonly default: boolean;
}): SettingDef<boolean>;
interface ServiceRegistry {
  config: CoreEnv;
  pluginEnv: Readonly<Record<string, unknown>>;
  settingDeclarations: readonly SettingDef[];
}
type ServiceName = Extract<keyof ServiceRegistry, string>;
type ServiceScope = "singleton" | "request" | "transient";
interface RegistrationBase {
  readonly deps?: readonly ServiceName[];
}
type Registration<N extends ServiceName> = (RegistrationBase & {
  readonly scope: "singleton";
  create(services: ServiceRegistry): ServiceRegistry[N] | Promise<ServiceRegistry[N]>;
}) | (RegistrationBase & {
  readonly scope: "request" | "transient";
  create(services: ServiceRegistry): ServiceRegistry[N];
});
interface RequestScope {
  readonly services: ServiceRegistry;
}
interface Container {
  register<N extends ServiceName>(name: N, registration: Registration<N>): void;
  boot(): Promise<void>;
  readonly services: ServiceRegistry;
  createScope(): RequestScope;
}
export declare function createContainer(): Container;
type Phase = "created" | "booting" | "ready" | "stopping" | "stopped";
type Hook = () => void | Promise<void>;
interface HookFailure {
  readonly name: string;
  readonly error: unknown;
}
interface StopResult {
  readonly timedOut: boolean;
  readonly failures: readonly HookFailure[];
  readonly skipped: readonly string[];
}
interface LifecycleOptions {
  readonly logger?: Logger;
  readonly shutdownTimeoutMs?: number;
}
interface Lifecycle {
  readonly phase: Phase;
  onBoot(name: string, hook: Hook): void;
  onShutdown(name: string, hook: Hook): void;
  boot(): Promise<void>;
  stop(): Promise<StopResult>;
}
export declare function exitCode(result: StopResult): 0 | 1;
export declare function createLifecycle(options?: LifecycleOptions): Lifecycle;
interface EventRegistry {}
type EventName = Extract<keyof EventRegistry, string>;
type EventHandler<N extends EventName> = (payload: EventRegistry[N]) => void | Promise<void>;
interface HandlerFailure {
  readonly handler: string;
  readonly error: unknown;
}
interface EmitResult {
  readonly delivered: number;
  readonly failures: readonly HandlerFailure[];
}
interface OnOptions {
  readonly name?: string;
}
interface ModuleEmitter {
  emit<N extends EventName>(name: N, payload: EventRegistry[N]): Promise<EmitResult>;
}
interface EventBus {
  on<N extends EventName>(name: N, handler: EventHandler<N>, options?: OnOptions): () => void;
  forModule(module: string): ModuleEmitter;
}
interface EventBusOptions {
  readonly logger?: Logger;
}
export declare function createEventBus(options?: EventBusOptions): EventBus;
export declare const ROLES: readonly ["web", "worker", "scheduler", "migrate"];
type Role = (typeof ROLES)[number];
export declare function parseRole(argv: readonly string[]): Role;
interface ModuleContributions {
  readonly settings?: readonly SettingDef[];
}
type ServiceDefs = { readonly [N in ServiceName]?: Registration<N>; };
interface ModuleInput extends ModuleContributions {
  readonly name: string;
  readonly services?: ServiceDefs;
}
interface ModuleDef {
  readonly kind: "module";
  readonly name: string;
  readonly services: ServiceDefs;
  readonly contributions: Readonly<Record<string, unknown>>;
}
export declare function defineModule(input: ModuleInput): ModuleDef;
export declare function registerModule(container: Container, def: ModuleDef): void;
interface PluginProblem {
  readonly code: string;
  readonly message: string;
  readonly fix: string;
}
export declare class PluginError extends BkError {
  readonly problems: readonly PluginProblem[];
  constructor(problems: readonly PluginProblem[]);
}
export declare function satisfies(version: string, range: string): boolean;
type SeedFn = (services: ServiceRegistry) => void | Promise<void>;
interface PluginInput<O = undefined> extends ModuleContributions {
  readonly name: string;
  readonly version: string;
  readonly core: string;
  readonly dialects: readonly Dialect[];
  readonly requires?: Readonly<Record<string, string>>;
  readonly conflicts?: readonly string[];
  readonly env?: Readonly<Record<string, EnvKeyBuilder<unknown>>>;
  readonly permissions?: readonly string[];
  readonly options?: Parser<O>;
  readonly services?: ServiceDefs;
  readonly seed?: SeedFn;
}
interface PluginDef<O = undefined> {
  readonly kind: "plugin";
  readonly name: string;
  readonly shortName: string;
  readonly version: string;
  readonly core: string;
  readonly dialects: readonly Dialect[];
  readonly requires: Readonly<Record<string, string>>;
  readonly conflicts: readonly string[];
  readonly permissions: readonly string[];
  readonly options: Parser<O>;
  readonly seed?: SeedFn;
  readonly module: ModuleDef;
  readonly envSchema: EnvSchema<Record<string, unknown>>;
}
export declare function definePlugin(input: PluginInput): PluginDef;
export declare function definePlugin<O>(input: PluginInput<O> & {
  readonly options: Parser<O>;
}): PluginDef<O>;
export declare function parsePluginOptions<O>(def: PluginDef<O>, options: unknown, path?: string): O;
interface Manifest {
  core: string;
  dialects: Dialect[];
  requires: Record<string, string>;
  conflicts: string[];
  env: string[];
  tables: string[];
  routes: string[];
  permissions: string[];
  admin: string[];
}
interface KeyCollector {
  readonly field: "tables" | "routes" | "admin";
  collect(contributions: Readonly<Record<string, unknown>>): readonly string[];
}
type ManifestCheck = {
  readonly ok: true;
} | {
  readonly ok: false;
  readonly code: "PLG_MANIFEST_NAME" | "PLG_MANIFEST_VERSION" | "PLG_MANIFEST_MISSING" | "PLG_MANIFEST_STALE";
  readonly message: string;
};
export declare function toManifest(def: PluginDef<unknown>, collectors?: readonly KeyCollector[]): Manifest;
export declare function checkManifest(pkg: {
  readonly name: string;
  readonly version: string;
  readonly bieberkit?: unknown;
}, def: PluginDef<unknown>, collectors?: readonly KeyCollector[]): ManifestCheck;
export declare function shortNameOf(name: string): string;
export declare function envPrefixOf(name: string): string;
interface Installed {
  readonly name: string;
  readonly version: string;
  readonly manifest: Manifest;
}
interface ResolveContext {
  readonly core: string;
  readonly dialect: Dialect;
}
interface Resolution {
  readonly order: readonly string[];
}
export declare function resolvePlugins(installed: readonly Installed[], context: ResolveContext): Resolution;
interface ConfigSections {}
type PluginEntry = string | readonly [name: string, options: Readonly<Record<string, unknown>>];
interface ProjectConfigInput extends ConfigSections {
  name: string;
  author: string;
  license: string;
  database: {
    dialect: Dialect;
  };
  tenancy: {
    mode: "single" | "shared-schema";
  };
  locales: {
    default: string;
    supported: readonly string[];
  };
  plugins: readonly PluginEntry[];
}
interface ConfigSection<K extends keyof ConfigSections> {
  readonly key: K;
  readonly parser: Parser<ConfigSections[K]>;
}
interface ValidateConfigOptions {
  readonly sections?: readonly ConfigSection<keyof ConfigSections>[];
}
export declare function defineConfig(input: ProjectConfigInput): ProjectConfigInput;
export declare function defineConfigSection<K extends keyof ConfigSections>(key: K, parser: Parser<ConfigSections[K]>): ConfigSection<K>;
export declare function validateConfig(input: unknown, options?: ValidateConfigOptions): ProjectConfigInput;
export declare const packageName = "@bieberkit/core";
export type { AppEnv, AttributeValue, BkErrorOptions, CollectorOptions, ConfigProblem, ConfigSection, ConfigSections, Container, CoreEnv, CoreEnvResult, CoreEnvValues, Counter, Dialect, EmitResult, EnvCustomParse, EnvDescription, EnvKeyBuilder, EnvKeyDef, EnvKind, EnvOwner, EnvProblem, EnvSchema, EnvSource, EnvValues, ErrorBody, ErrorReportContext, ErrorReporter, EventBus, EventBusOptions, EventHandler, EventName, EventRegistry, FinishedSpan, Gauge, HandlerFailure, Histogram, HistogramOptions, Hook, HookFailure, Installed, IntOptions, KeyCollector, Lifecycle, LifecycleOptions, LoadEnvOptions, LocalizedText, LogFields, LogLevel, LogSanitizer, Logger, LoggerOptions, Manifest, ManifestCheck, MemoryReporter, MemorySpanExporter, MetricLabels, MetricOptions, MetricSample, Metrics, MetricsServer, MetricsServerOptions, ModuleContributions, ModuleDef, ModuleEmitter, ModuleInput, OnOptions, OpenSpan, OtlpExporterOptions, ParsedDsn, Parser, Phase, PluginDef, PluginEntry, PluginInput, PluginProblem, ProcessHandlerOptions, ProcessLike, ProjectConfigInput, ReadCoreEnvOptions, Registration, ReportLevel, ReportSource, ReporterConfig, ReporterFromConfigOptions, RequestContext, RequestScope, Resolution, ResolveContext, Role, SeedFn, SentryReporterOptions, ServiceDefs, ServiceName, ServiceRegistry, ServiceScope, SettingActor, SettingDef, SettingInput, SettingScope, SettingType, Span, SpanAttributes, SpanExporter, SpanKind, SpanOptions, StopResult, TraceParent, Tracer, TracerFromConfigOptions, TracerOptions, TracingConfig, ValidateConfigOptions };
```
