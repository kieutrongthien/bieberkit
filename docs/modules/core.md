<!--
  BieberKit

  @file        docs/modules/core.md
  @description Module spec of @bieberkit/core: errors, environment, logging, container, lifecycle, events and roles, plus the proposed API of the maintainer-designed parts.
  @author      Bieber Kieu <kieutrongthien@gmail.com>
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

# @bieberkit/core

- Package: `@bieberkit/core`
- Layer: foundation (Node.js built-ins only, PKG-04)
- Spec sections: 7 (runtime), 8 (configuration), 11 (plugins), 19.4 (shutdown), 20 (observability), ADR 0003, ADR 0011
- Status: Draft. Sections marked **[D]** are proposals for the maintainer to design (AGENTS.md, Workflow 6). They get no code until you approve them.

## Purpose

The kernel every process role starts from: typed errors, validated environment, a logger, a service container, a lifecycle, an event bus and role selection. It owns no I/O except reading the environment and writing log lines. It never imports a third-party package, so the validator for the environment is small and its own, and Zod stays out of core.

It does not contain the HTTP server, the data layer, queues or the plugin loader of a running project. Those sit in the packages above it.

## Public API

One entry point, `src/index.ts`. Every exported function and constant declares its type (`isolatedDeclarations`). Extension points are interfaces that other packages extend with declaration merging, as `EntityRegistry` does in ADR 0009: `ServiceRegistry`, `EventRegistry`, `ModuleContributions`.

```ts
// errors
class BkError extends Error { readonly code: string; readonly status: number; readonly safeMessage: string; readonly fix: string; toJSON(): ErrorBody }
class ConfigError extends BkError {}            // CFG_*
class EnvValidationError extends ConfigError { readonly problems: readonly EnvProblem[] }
class ContainerError extends BkError {}         // CORE_SERVICE_*

// environment
const env: { string(): EnvKeyBuilder<string>; int(options?: { min?: number; max?: number }): EnvKeyBuilder<number>; boolean(): EnvKeyBuilder<boolean>;
             enum<V extends string>(values: readonly V[]): EnvKeyBuilder<V>; url(): EnvKeyBuilder<string>; base64(): EnvKeyBuilder<string>;
             custom<T>(expected: string, parse: (raw: string) => { value: T } | undefined): EnvKeyBuilder<T> }   // the one escape hatch
// EnvKeyBuilder: .default(v) .optional() .secret() .describe(text)   (immutable, each call returns a new builder)
function defineEnv<T>(keys: { [K in keyof T]: EnvKeyBuilder<T[K]> }): EnvSchema<T>
function mergeEnv(owners: readonly EnvOwner[]): EnvSchema<Record<string, unknown>>
function readEnv<T>(schema: EnvSchema<T>, source: EnvSource): T          // throws EnvValidationError
function parseEnvFile(text: string): EnvSource
function readEnvFile(path: string): EnvSource                            // a missing file gives {}
function withEnvFile(real: EnvSource, file: EnvSource): EnvSource        // real values win (CFG-03)
function collectSecrets(schema: EnvSchema<unknown>, values: object): string[]   // for createLogger({ secrets })
function redact(schema: EnvSchema<unknown>, values: object): Record<string, unknown>
function readCoreEnv(source: EnvSource, options?: { extra?: readonly EnvOwner[] }): { env: CoreEnv; extra: Record<string, unknown>; warnings: string[] }
function assertProductionSafe(values: CoreEnv): void                     // CFG-07, throws ConfigError
const coreEnv: EnvSchema<CoreEnv>                                        // the keys of section 8.2
function loadEnv(options?: { source?: EnvSource; envFile?: string | false; extra?: readonly EnvOwner[] }): CoreEnvResult   // the only reader of process.env

// logging
interface Logger { level: LogLevel; fatal/error/warn/info/debug/trace(msg: string, fields?: LogFields): void; child(bindings: LogFields): Logger }
function createLogger(options: { level: LogLevel; role: string; write?: (line: string) => void; secrets?: readonly string[] }): Logger
const requestContext: { run<T>(ctx: RequestContext, fn: () => T): T; get(): RequestContext | undefined; update(patch: Partial<RequestContext>): void }

// container
interface ServiceRegistry {}   // extended by modules: interface ServiceRegistry { pipeline: PipelineService }
function createContainer(): Container
interface Container { register<N extends ServiceName>(name: N, reg: Registration<N>): void; boot(): Promise<void>;
                      readonly services: ServiceRegistry; createScope(): Scope }
interface Registration<N> { scope: 'singleton' | 'request' | 'transient'; deps?: readonly ServiceName[]; create(r: ServiceRegistry): ServiceRegistry[N] | Promise<ServiceRegistry[N]> }

// lifecycle
function createLifecycle(options?: { logger?: Logger; shutdownTimeoutMs?: number }): Lifecycle
interface Lifecycle { readonly phase: Phase; onBoot(name: string, fn: Hook): void; onShutdown(name: string, fn: Hook): void; boot(): Promise<void>; stop(): Promise<StopResult> }
function exitCode(result: StopResult): 0 | 1

// events
interface EventRegistry {}     // extended by modules: interface EventRegistry { 'crm.deal.won': { dealId: string } }
function createEventBus(options?: { logger?: Logger }): EventBus
interface EventBus { on<N extends EventName>(name: N, handler: Handler<N>): () => void; forModule(module: string): ModuleEmitter }
interface ModuleEmitter { emit<N extends EventName>(name: N, payload: EventRegistry[N]): Promise<EmitResult> }

// roles
const ROLES: readonly ['web', 'worker', 'scheduler', 'migrate']
function parseRole(argv: readonly string[]): Role                        // throws ConfigError CFG_ROLE_INVALID
```

### Proposed, to design **[D]**

```ts
// defineModule: the only public entry of a module (MOD-01, MOD-02, section 10.3)
interface ModuleContributions {} // other packages add: entities, routes, jobs, schedules, workflows, events, admin
interface ModuleInput extends ModuleContributions {
  readonly name: string;
  readonly services?: ServiceDefs;
}
function defineModule(input: ModuleInput): ModuleDef;

// definePlugin: a module packaged for reuse, with the manifest fields of section 11.1
interface PluginInput extends ModuleInput {
  readonly version: string;
  readonly core: string;
  readonly dialects: readonly Dialect[];
  readonly requires?: Readonly<Record<string, string>>;
  readonly conflicts?: readonly string[];
  readonly env?: EnvSchema<unknown>;
  readonly permissions?: readonly string[];
  readonly seed?: SeedFn;
}
function definePlugin(input: PluginInput): PluginDef; // PluginDef carries its ModuleDef
function toManifest(def: PluginDef): Manifest; // ADR 0011, for the package.json field
function checkManifest(pkg: PackageJsonLike, def: PluginDef): ManifestCheck;

// defineConfig: bieberkit.config.ts (CFG-08, CFG-09, section 8.3)
interface ConfigSections {} // other packages add: admin, site, theme
interface ProjectConfigInput extends ConfigSections {
  name: string;
  author: string;
  license: string;
  database: { dialect: Dialect };
  tenancy: { mode: 'single' | 'shared-schema' };
  locales: { default: string; supported: readonly string[] };
  plugins: readonly (string | readonly [string, Record<string, unknown>])[];
}
function defineConfig(input: ProjectConfigInput): ProjectConfig;
function validateConfig(input: unknown): ProjectConfig; // same error format as env validation

// resolver: one pure function for the scaffolder, `bieberkit add` and the kernel (section 11.2, ADR 0011)
function resolvePlugins(
  installed: readonly Installed[],
  ctx: { core: string; dialect: Dialect },
): { order: readonly string[] };
```

## Behavior

Each line is testable, and each test is named after its ID.

| ID              | Requirement                                                                                                                                                                                                                  |
| --------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| PKG-04          | Core imports no package from `node_modules`, only `node:` built-ins                                                                                                                                                          |
| MOD-17          | Every error is a `BkError` with a stable `code`, an HTTP `status`, a `safeMessage` and a `fix`. `toJSON()` never includes the cause or the stack. Unknown errors are wrapped as `BK_UNKNOWN` with status 500                 |
| CFG-01          | `defineEnv` takes keys with a type, a default, a description and a secret flag. `mergeEnv` rejects a duplicate key and a plugin key without the plugin's prefix                                                              |
| CFG-02, P8      | Only `packages/core/src/config/` reads `process.env`. `tools/check-env-access.ts` fails the build for any other file                                                                                                         |
| CFG-03          | Real environment variables win over the `.env` file                                                                                                                                                                          |
| CFG-04          | A missing `.env` file is not an error. In production the file is optional                                                                                                                                                    |
| CFG-05          | Secret values are redacted in `redact`, in error messages and in log lines                                                                                                                                                   |
| CFG-06          | `describeEnv(schema)` returns rows for `.env.example`, which a later generator writes. It never contains a secret value                                                                                                      |
| CFG-07          | In production `assertProductionSafe` fails for `STORAGE_DISK=local` or a `file` or `memory` cache without `APP_SINGLE_NODE=true`, an `APP_KEY` under 32 bytes, and a `sync` queue driver. All problems are reported together |
| CFG-env         | `readEnv` reports every invalid and missing key in one `EnvValidationError`, each problem with its own code and fix. The error's `code` is the code of the first problem                                                     |
| OBS-01          | A log line is one JSON object with `time`, `level`, `msg`, `role`, `requestId`, `traceId`, `spanId`, and `tenantId` and `userId` when the request context has them                                                           |
| CORE-01         | `createLogger` filters by level and `child` adds bindings that appear on every line                                                                                                                                          |
| CORE-02         | `requestContext.run` makes the context visible to async code started inside it and to nothing outside                                                                                                                        |
| CORE-03         | A registered service resolves by name with its type from `ServiceRegistry`                                                                                                                                                   |
| CORE-04         | `boot` fails with `CORE_SERVICE_MISSING` for a dependency nobody registered, before any factory runs                                                                                                                         |
| CORE-05         | `boot` fails with `CORE_SERVICE_CYCLE` for a dependency cycle, naming the cycle                                                                                                                                              |
| CORE-06         | `boot` fails with `CORE_SERVICE_SCOPE` when a singleton depends on a request-scoped service                                                                                                                                  |
| CORE-07         | A factory that resolves a service it did not declare throws `CORE_SERVICE_UNDECLARED`                                                                                                                                        |
| CORE-08         | Singleton factories may be async. They run once, in dependency order, awaited at `boot`. Request and transient factories are sync                                                                                            |
| CORE-09         | A request scope creates its request-scoped services once and gives each scope its own. A transient service is new on every access                                                                                            |
| CORE-10         | Lifecycle phases move `created`, `booting`, `ready`, `stopping`, `stopped` and never go back. `boot` and `stop` can each run once. A second `stop` returns the first result                                                  |
| CORE-11         | Boot hooks run in registration order, shutdown hooks in reverse order (section 19.4, step 6)                                                                                                                                 |
| CORE-12         | A failing hook is recorded and the others still run                                                                                                                                                                          |
| CORE-13         | `stop` returns after the timeout (default 20 s) with `timedOut: true`. `exitCode` gives 1 for a timeout or a failed hook, otherwise 0                                                                                        |
| MOD-03, CORE-14 | Events are typed from `EventRegistry`. A handler that throws or rejects is reported in `EmitResult` and does not stop the others or the emitter                                                                              |
| MOD-05, CORE-15 | A module can emit only event names that start with its own name and a dot. Any module can subscribe                                                                                                                          |
| CORE-16         | `parseRole` accepts `web`, `worker`, `scheduler` and `migrate`, as a positional argument or `--role=<role>`. Anything else is `CFG_ROLE_INVALID` with the valid list                                                         |

## Errors

| Code                         | Status | Fix text                                                                                              |
| ---------------------------- | ------ | ----------------------------------------------------------------------------------------------------- |
| `BK_UNKNOWN`                 | 500    | Report the request id. The cause is in the logs                                                       |
| `CFG_ENV_MISSING`            | 500    | Set the key in the environment or in `.env`. `bieberkit env:check` lists all of them                  |
| `CFG_ENV_INVALID`            | 500    | The value has the wrong type or is outside the allowed values. The message names the key and the type |
| `CFG_UNSAFE_PRODUCTION`      | 500    | Change the setting, or declare `APP_SINGLE_NODE=true` if one server is intended                       |
| `CFG_ROLE_INVALID`           | 500    | Start with one of `web`, `worker`, `scheduler`, `migrate`                                             |
| `CFG_CONFIG_INVALID` **[D]** | 500    | The config file does not match its schema. Each problem names its path                                |
| `CORE_SERVICE_MISSING`       | 500    | Register the service, or remove it from `deps`                                                        |
| `CORE_SERVICE_CYCLE`         | 500    | Break the cycle. The message lists it                                                                 |
| `CORE_SERVICE_SCOPE`         | 500    | A singleton cannot depend on a request service. Make it a factory argument or change a scope          |
| `CORE_SERVICE_UNDECLARED`    | 500    | Add the name to `deps` of the registration                                                            |
| `CORE_SERVICE_DUPLICATE`     | 500    | A name is registered once                                                                             |
| `CORE_EVENT_FOREIGN`         | 500    | A module emits only its own events                                                                    |
| `PLG_*` **[D]**              | 500    | The twelve resolver codes of ADR 0011                                                                 |

## Configuration

The keys of section 8.2 are the core schema (`coreEnv`), with its defaults. Rules not in the spec, proposed here:

- In development and test, a missing `APP_KEY` or `AUTH_SECRET` gets an ephemeral random value and a warning in the log. In production a missing one is `CFG_ENV_MISSING`. `SITE_SERVICE_TOKEN` and `SITE_REVALIDATE_SECRET` are generated in development and test without a warning, and in production they are required only when `SITE_URL` is set.
- `CACHE_PREFIX` defaults to `APP_NAME`. `CACHE_REDIS_URL` and `MIGRATE_DATABASE_URL` fall back to `REDIS_URL` and `DATABASE_URL` in development and test only.
- `AUTH_SECRET` under 32 bytes is also refused in production, next to the four checks of CFG-07.
- `APP_ENV` decides this and the production checks. It defaults to `development`.
- `.env` is read from the working directory unless `envFile` says otherwise, with `util.parseEnv`, so the parse changes nothing global.
- An empty value (`KEY=`) counts as unset, so the default or the missing-key error applies.
- Booleans accept `true`, `false`, `1` and `0`. Integers must be whole numbers inside the optional range.

## Tests

All tests sit next to the code as `*.test.ts` and run on Node.js 24.12 and 26. No database or network is used. The tests per requirement ID are the table above. The coverage gate is 90 percent of lines (TST-01), measured for `packages/core/src` only.

The proposed `[D]` parts get their tests written and shown to you first: `defineModule`, `definePlugin`, `toManifest`, `defineConfig`, `validateConfig` and `resolvePlugins` (the 12 error cases and the order of ADR 0011).

## Open questions

1. **Contributions of a module.** Core cannot know entities, routes or jobs. The proposal is `ModuleContributions`, an interface the upper packages extend by declaration merging, so `defineModule({ entities: [...] })` is typed only when `@bieberkit/data` is installed. The alternative is `contributions: Record<string, unknown[]>`, which is simpler and untyped. Which one?
2. **Project config sections.** `admin`, `site` and `theme` belong to other packages. Same question: `ConfigSections` by merging, with each package registering its validator, or an opaque record.
3. **Plugin options.** `['@bieberkit/plugin-seo', { sitemap: true }]` passes options to a plugin. Should a plugin declare an options schema in `definePlugin`, validated by the same code as the env?
4. **Event delivery.** Handlers run one after another in registration order. Should independent handlers run concurrently? Order is easier to reason about, concurrency is faster.
5. **Where the request scope lives.** The container creates scopes. The HTTP layer decides when. Should `requestContext` and the container scope be one object?
