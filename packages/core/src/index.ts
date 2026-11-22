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
export { createLogger } from './logging/logger.ts';
export type { LogFields, Logger, LoggerOptions } from './logging/logger.ts';
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
