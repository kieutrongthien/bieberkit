/**
 * BieberKit
 *
 * @file        packages/data/src/migrations/steps.ts
 * @description The plugin migration step: its type, its order, its validation and the static risk rules of bieberkit check (DATA-08, DATA-24, DATA-27).
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

import type { Transaction } from 'kysely';
import type { Dialect } from '@bieberkit/core';
import { dataError } from '../errors.ts';

/** The tables of a step are not known to the type system, so a step names them as text. */
export type StepDatabase = Record<string, Record<string, unknown>>;

export type StepKind = 'expand' | 'migrate' | 'contract';

/** One step of a plugin's migrations (DATA-24, ADR 0011). It runs in its own transaction, together with its ledger row. */
export interface PluginMigrationStep {
  readonly plugin: string;
  /** The version of the plugin that ships the step: `major.minor.patch`. */
  readonly version: string;
  /** Unique inside the plugin. It is the key in the ledger, so it never changes after release. */
  readonly id: string;
  readonly kind: StepKind;
  /** For a contract step: the expand step that it finishes. It never runs in the same deploy as that step (DATA-08). */
  readonly after?: string;
  up(trx: Transaction<StepDatabase>, dialect: Dialect): Promise<void>;
}

type Triple = readonly [number, number, number];

const VERSION = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;

function triple(version: string): Triple | undefined {
  const match = VERSION.exec(version);
  return match === null ? undefined : [Number(match[1]), Number(match[2]), Number(match[3])];
}

/** Compares two `major.minor.patch` versions as numbers. Both must be valid. */
export function compareVersions(a: string, b: string): number {
  const x = triple(a) ?? [0, 0, 0];
  const y = triple(b) ?? [0, 0, 0];
  return x[0] - y[0] || x[1] - y[1] || x[2] - y[2];
}

/** `plugin/id`, the name of a step in messages, in results and in the ledger of a person's mind. */
export function stepName(step: Pick<PluginMigrationStep, 'plugin' | 'id'>): string {
  return `${step.plugin}/${step.id}`;
}

/** Steps in the order they run: the boot order of the plugins, then version, then the order they were declared in. */
export function orderSteps(
  steps: readonly PluginMigrationStep[],
  pluginOrder: readonly string[],
): PluginMigrationStep[] {
  const rank = (plugin: string): number => {
    const index = pluginOrder.indexOf(plugin);
    return index === -1 ? pluginOrder.length : index;
  };
  return steps
    .map((step, index) => ({ step, index }))
    .toSorted(
      (a, b) =>
        rank(a.step.plugin) - rank(b.step.plugin) ||
        compareVersions(a.step.version, b.step.version) ||
        a.index - b.index,
    )
    .map(({ step }) => step);
}

/** Throws `DATA_MIGRATION_STEP_INVALID` with every problem found, so one run of the check shows them all. */
export function validateSteps(steps: readonly PluginMigrationStep[], pluginOrder: readonly string[]): void {
  const problems: string[] = [];
  const seen = new Map<string, PluginMigrationStep>();
  for (const step of steps) {
    const name = stepName(step);
    if (step.id === '') problems.push(`${name}: the id is blank.`);
    if (!pluginOrder.includes(step.plugin)) problems.push(`${name}: ${step.plugin} is not an installed plugin.`);
    if (triple(step.version) === undefined)
      problems.push(`${name}: "${step.version}" is not a version (major.minor.patch).`);
    if (seen.has(name)) problems.push(`${name}: the id is used twice in the plugin.`);
    seen.set(name, step);
  }
  for (const step of steps) {
    const name = stepName(step);
    if (step.after === undefined) continue;
    if (step.kind !== 'contract') {
      problems.push(`${name}: only a contract step has an "after".`);
      continue;
    }
    const expand = seen.get(`${step.plugin}/${step.after}`);
    if (expand === undefined)
      problems.push(`${name}: "after" names ${step.after}, which is not a step of ${step.plugin}.`);
    else if (expand.kind !== 'expand')
      problems.push(`${name}: "after" names ${step.after}, which is a ${expand.kind} step, not an expand step.`);
    else if (compareVersions(expand.version, step.version) >= 0)
      problems.push(`${name}: it must ship in a later version than ${step.after} (${expand.version}).`);
  }
  if (problems.length > 0) {
    throw dataError(
      'DATA_MIGRATION_STEP_INVALID',
      500,
      `The migration steps are not valid:\n${problems.join('\n')}`,
      'Give each step a unique id and a version, and let a contract step name the expand step it finishes in a later version.',
    );
  }
}

export interface StepRisk {
  readonly kind: 'mysql-unguarded-ddl' | 'destructive-before-contract';
  readonly step: string;
  readonly message: string;
}

const DDL =
  /\.(?:createTable|alterTable|dropTable|createIndex|dropIndex|createView|dropView|createSchema|dropSchema|createType|dropType)\s*\(|\b(?:create|alter|drop)\s+(?:table|index|view|schema|type)\b|\bsetNotNull\s*\(/i;
const GUARD = /\.(?:ifNotExists|ifExists)\s*\(|\bif\s+(?:not\s+)?exists\b/i;
const DESTRUCTIVE =
  /\.(?:dropColumn|dropTable|renameColumn|renameTo|dropConstraint)\s*\(|\bdrop\s+(?:table|column)\b|\brename\s+(?:column|to|table)\b/i;

/**
 * The rules that `bieberkit check` applies to plugin steps (DATA-08, DATA-27). It reads the source of `up`, so it is a heuristic
 * for CI and never a reason to refuse a deploy. On MySQL DDL is not transactional, so a step with more than one DDL statement
 * must guard each with `if not exists` or `if exists`, or a failed run cannot be repeated. A drop or a rename belongs to a contract step.
 */
export function findStepRisks(steps: readonly PluginMigrationStep[]): StepRisk[] {
  const risks: StepRisk[] = [];
  for (const step of steps) {
    const source = step.up.toString();
    const ddl = source.split(';').filter((statement) => DDL.test(statement));
    if (ddl.length > 1 && ddl.some((statement) => !GUARD.test(statement))) {
      risks.push({
        kind: 'mysql-unguarded-ddl',
        step: stepName(step),
        message: `${stepName(step)} has ${ddl.length} DDL statements and at least one without if not exists or if exists. MySQL cannot roll a failed step back.`,
      });
    }
    if (step.kind !== 'contract' && DESTRUCTIVE.test(source)) {
      risks.push({
        kind: 'destructive-before-contract',
        step: stepName(step),
        message: `${stepName(step)} drops or renames something and is a ${step.kind} step. Move it to a contract step in a later release.`,
      });
    }
  }
  return risks;
}
