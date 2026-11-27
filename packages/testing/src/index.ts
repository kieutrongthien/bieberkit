/**
 * BieberKit
 *
 * @file        packages/testing/src/index.ts
 * @description Public API of @bieberkit/testing: the test app, factories, callers and the helpers that run a suite on every dialect (TST-02, TST-03).
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
export const packageName = '@bieberkit/testing';

export { createTestApp } from './app.ts';
export type { TestApp, TestAppOptions, TestUser } from './app.ts';
export { invalidCasesOf, REFUSED_PAGES } from './cases.ts';
export type { InvalidCase, PageCase } from './cases.ts';
export { createClient, TENANT_HEADER, USER_HEADER } from './client.ts';
export type { Client, Reply } from './client.ts';
export { describeEntityContracts } from './contract.ts';
export type { EntityContractOptions } from './contract.ts';
export { analyze, fullScans, planOf } from './plan.ts';
export { describeDialects, openMemoryDatabase } from './database.ts';
export type { DialectContext, OpenDatabase } from './database.ts';
export { TestingError } from './errors.ts';
export { installNetworkGuard, isLocalHost } from './network-guard.ts';
export type { NetworkGuardOptions } from './network-guard.ts';
export { createMemoryLogger } from './logger.ts';
export type { LoggedLine, MemoryLogger } from './logger.ts';
export { createFactory } from './factory.ts';
export type { Factory, FactoryContext, Overrides } from './factory.ts';
export { sampleOf } from './sample.ts';
