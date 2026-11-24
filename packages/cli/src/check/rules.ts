/**
 * BieberKit
 *
 * @file        packages/cli/src/check/rules.ts
 * @description The rules of bieberkit check, in the order that they run.
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

import { boundariesRule } from './rules/boundaries.ts';
import { envAccessRule } from './rules/env-access.ts';
import { headersRule } from './rules/headers.ts';
import { generatedRule } from './rules/generated.ts';
import { migrationsRule } from './rules/migrations.ts';
import { ormRule } from './rules/orm.ts';
import { routesRule } from './rules/routes.ts';
import { sqlRule } from './rules/sql.ts';
import { transactionsRule } from './rules/transactions.ts';
import type { Rule } from './rule.ts';

export const RULES: readonly Rule[] = [
  headersRule,
  envAccessRule,
  boundariesRule,
  ormRule,
  sqlRule,
  transactionsRule,
  migrationsRule,
  routesRule,
  generatedRule,
];
