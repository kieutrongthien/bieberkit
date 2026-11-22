/**
 * BieberKit
 *
 * @file        packages/http/src/index.ts
 * @description Public API of @bieberkit/http: the server, the routes and the ports of the pipeline (spec 13).
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

/** npm name of this package. */
export const packageName = '@bieberkit/http';

export { createCsrf, registerCsrfToken } from './csrf.ts';
export type { CsrfProtection } from './csrf.ts';
export { createHttpFetch, HttpFetchError, isBlockedAddress } from './http-fetch.ts';
export type { HttpFetch, HttpFetchInit, HttpFetchOptions, ResolvedAddress } from './http-fetch.ts';
export type { CorsOptions } from './security.ts';
export { entityRoutes, registerEntityRoutes } from './entity-routes.ts';
export type { EntityRoutesContext } from './entity-routes.ts';
export { META_SCHEMA, registerMeta } from './meta.ts';
export { openApiDocument, registerOpenApi } from './openapi.ts';
export type { OpenApiDocument, OpenApiInfo } from './openapi.ts';
export { registerHttp } from './lifecycle.ts';
export type { RegisterHttpOptions } from './lifecycle.ts';
export type {
  AccessAnswer,
  Authenticator,
  Authorizer,
  Principal,
  RateLimiter,
  RateLimitResult,
  RequestInfo,
  TenantResolver,
} from './ports.ts';
export { HttpError, ValidationFailed } from './problem.ts';
export type { Problem } from './problem.ts';
export { defineRoute, METHODS } from './route.ts';
export type { Method, RouteContext, RouteDef, RouteSchema } from './route.ts';
export { createHttpServer, STAGE_NAMES } from './server.ts';
export type {
  ErrorContext,
  HttpEnv,
  HttpServer,
  HttpServerOptions,
  InjectOptions,
  InjectResponse,
  StageContext,
  StageHook,
  StageName,
} from './server.ts';
