/**
 * BieberKit
 *
 * @file        packages/data/src/orm/state.ts
 * @description State machines: transition with its checks, the event and the audit entry, and what a record can do now (MOD-06, MOD-07).
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

import type { EntityManager } from '@mikro-orm/core';
import { dataError } from '../errors.ts';
import type { TransitionDef } from '../schema/fields.ts';
import { recordAudit } from './audit.ts';
import { entityOfSchema } from './compile.ts';
import { addTimelineFor } from './features.ts';
import type { OrmSchema } from './compile.ts';
import { emitEvent } from './outbox.ts';
import { allowStateChange } from './state-guard.ts';

type Row = Record<string, unknown>;

export interface TransitionResult {
  readonly name: string;
  readonly from: string;
  readonly to: string;
  /** The name of the event that was added to the unit of work. */
  readonly event: string;
}

export interface AvailableTransition {
  readonly name: string;
  readonly to: string;
  readonly permission?: string;
}

interface StateMachine {
  readonly entity: string;
  readonly field: string;
  readonly transitions: Readonly<Record<string, TransitionDef>>;
}

function machineOf(schema: OrmSchema): StateMachine {
  const def = entityOfSchema(schema);
  for (const [field, fieldDef] of Object.entries(def.fields)) {
    if (fieldDef.kind === 'state' && fieldDef.transitions !== undefined) {
      return { entity: def.name, field, transitions: fieldDef.transitions };
    }
  }
  throw dataError('DATA_TRANSITION_UNKNOWN', 404, `${def.name} has no state.`, 'Declare one with f.state().');
}

function unknownTransition(machine: StateMachine, name: string): never {
  throw dataError(
    'DATA_TRANSITION_UNKNOWN',
    404,
    `${machine.entity} has no transition "${name}".`,
    `The transitions are ${Object.keys(machine.transitions).join(', ')}.`,
  );
}

/** The declaration of a transition. The route reads its `permission` and asks the ability before it calls `transition`. */
export function transitionOf(schema: OrmSchema, name: string): TransitionDef {
  const machine = machineOf(schema);
  return machine.transitions[name] ?? unknownTransition(machine, name);
}

/** What the record can do in its present state, for the buttons of the admin and the check of a route. */
export function availableTransitions(schema: OrmSchema, row: Row): readonly AvailableTransition[] {
  const machine = machineOf(schema);
  const state = String(row[machine.field]);
  return Object.entries(machine.transitions)
    .filter(([, candidate]) => candidate.from.includes(state))
    .map(([name, candidate]) => ({
      name,
      to: candidate.to,
      ...(candidate.permission === undefined ? {} : { permission: candidate.permission }),
    }));
}

/** `PurchaseOrder` gives `purchase_order`: the name of an entity starts with a capital, which `snake` would turn into a leading underscore. */
const resource = (name: string): string => name.replaceAll(/([a-z0-9])([A-Z])/g, '$1_$2').toLowerCase();

/** `crm.Customer` and `qualify` give `crm.customer.qualify`. */
function eventNameOf(entity: string, name: string): string {
  const dot = entity.indexOf('.');
  const owner = dot === -1 ? '' : `${entity.slice(0, dot).toLowerCase()}.`;
  return `${owner}${resource(dot === -1 ? entity : entity.slice(dot + 1))}.${name}`;
}

async function checkInput(declared: TransitionDef, input: unknown, label: string): Promise<unknown> {
  if (declared.input === undefined) {
    if (input === undefined) return undefined;
    throw dataError('DATA_TRANSITION_INPUT_INVALID', 422, `${label} takes no input.`, 'Call it without input.');
  }
  const standard: unknown = Reflect.get(declared.input, '~standard');
  const validate: unknown =
    typeof standard === 'object' && standard !== null ? Reflect.get(standard, 'validate') : undefined;
  if (typeof validate !== 'function') {
    throw dataError(
      'DATA_TRANSITION_INPUT_INVALID',
      500,
      `The input schema of ${label} cannot be run.`,
      'Use a Zod schema.',
    );
  }
  const result: unknown = await Reflect.apply(validate, standard, [input]);
  const issues: unknown = typeof result === 'object' && result !== null ? Reflect.get(result, 'issues') : undefined;
  if (Array.isArray(issues) && issues.length > 0) {
    const text = issues
      .map((issue: unknown) =>
        typeof issue === 'object' && issue !== null ? String(Reflect.get(issue, 'message')) : '',
      )
      .join('; ');
    throw dataError(
      'DATA_TRANSITION_INPUT_INVALID',
      422,
      `The input of ${label} is not valid: ${text}`,
      'Send the fields that the transition asks for.',
    );
  }
  return typeof result === 'object' && result !== null ? Reflect.get(result, 'value') : input;
}

/**
 * Moves a loaded row along a declared transition (MOD-06, MOD-07). It checks that the row is in a state the transition starts
 * from and that the input is valid, then sets the state, and adds an event and an audit entry to the unit of work. It does not
 * flush: the service does, so the three are written in one transaction and a stale row fails the flush with 412. The permission
 * is not checked here, because the ability belongs to the caller.
 */
export async function transition(
  em: EntityManager,
  schema: OrmSchema,
  row: Row,
  name: string,
  input?: unknown,
): Promise<TransitionResult> {
  const machine = machineOf(schema);
  const declared = machine.transitions[name] ?? unknownTransition(machine, name);
  const label = `${machine.entity}.${name}`;
  const from = String(row[machine.field]);
  if (!declared.from.includes(from)) {
    throw dataError(
      'DATA_TRANSITION_NOT_ALLOWED',
      409,
      `${label} starts from ${declared.from.join(' or ')}, and the record is ${from}.`,
      'Reload the record and check which transitions it has now.',
    );
  }
  const checked = await checkInput(declared, input, label);
  allowStateChange(row);
  row[machine.field] = declared.to;
  const id = String(row['id']);
  const event = eventNameOf(machine.entity, name);
  const detail = { from, to: declared.to, ...(checked === undefined ? {} : { input: checked }) };
  emitEvent(em, {
    name: event,
    payload: { id, transition: name, ...detail },
    record: { entity: machine.entity, id, version: (typeof row['version'] === 'number' ? row['version'] : 0) + 1 },
  });
  recordAudit(em, { action: label, entity: machine.entity, recordId: id, data: detail });
  addTimelineFor(em, schema, row, { type: 'transition', data: { name, from, to: declared.to } });
  return { name, from, to: declared.to, event };
}
