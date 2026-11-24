/**
 * BieberKit
 *
 * @file        packages/auth/src/ability.ts
 * @description The ability of one request: what a caller may do with an entity, which rows and which fields, with default deny and a condition language that fails closed (AUTHZ-01 to AUTHZ-06, ADR 0013).
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

import { createMongoAbility, subject } from '@casl/ability';
import type { MongoAbility, RawRuleOf } from '@casl/ability';
import { rulesToAST } from '@casl/ability/extra';
import type { AccessAnswer } from '@bieberkit/http';
import { authzError } from './errors.ts';
import type { Action, PermissionRegistry } from './registry.ts';

type Row = Record<string, unknown>;

/** The conditions of ADR 0013: one operator per field from `eq`, `ne`, `in`, `nin`, `gt`, `gte`, `lt`, `lte`. */
export type Condition = Record<string, unknown>;

export interface AbilityUser {
  readonly id: string;
  readonly tenantId?: string;
}

/** A permission that carries a condition. The condition is code, so a project cannot change it at run time (section 14.2). */
export interface ScopedPermission {
  readonly subject: string;
  readonly action: Action;
  when(user: AbilityUser): Condition;
}

/** What the ability needs to know of an entity: its name, the properties that a condition may name, and its fields. */
export interface EntityShape {
  readonly name: string;
  readonly properties: ReadonlySet<string>;
  readonly fields: readonly string[];
}

export type { AccessAnswer };

export interface Ability {
  /** Whether the caller was granted this permission string, whatever it stands for. */
  has(permission: string): boolean;
  /**
   * Whether a route that asks for `permission` may run: the caller has it, or has another permission for the same subject and
   * action (a scoped one), and the scope of `access` limits the rows. A permission of a masked field must be granted itself.
   */
  covers(permission: string): boolean;
  /** Which rows and which fields the caller may use for `action`. */
  access(entity: EntityShape, action: Action): AccessAnswer;
  /** Whether the caller may use `action` on a row in memory: for a create, and for the new state of an update. */
  allows(entity: EntityShape, action: Action, row: Row): boolean;
}

export interface AbilityInput {
  readonly registry: PermissionRegistry;
  readonly granted: ReadonlySet<string>;
  readonly scoped?: Readonly<Record<string, ScopedPermission>>;
  readonly user: AbilityUser;
}

const OPERATORS: readonly string[] = ['$eq', '$ne', '$in', '$nin', '$gt', '$gte', '$lt', '$lte'];

function isPlain(value: unknown): value is Row {
  return typeof value === 'object' && value !== null && Object.getPrototypeOf(value) === Object.prototype;
}

const isOperand = (value: unknown): boolean =>
  value === null ||
  typeof value === 'string' ||
  typeof value === 'number' ||
  typeof value === 'boolean' ||
  value instanceof Date;

/**
 * Why a condition is not in the language of ADR 0013, or `undefined` when it is: properties of the entity, no path, no logic, only the
 * operators above. With `oneOperator` it also refuses two operators on one field, which is what AUTHZ-06 asks of a declared condition at
 * build time; the ability at run time accepts a range, so that a stored condition that worked keeps working.
 */
export function explainCondition(
  condition: unknown,
  properties: ReadonlySet<string>,
  options: { readonly oneOperator?: boolean } = {},
): string | undefined {
  if (!isPlain(condition)) return 'A condition is an object like { field: value }.';
  const entries = Object.entries(condition);
  if (entries.length === 0)
    return 'The condition is empty, so it would allow every row. Use the plain permission for that.';
  for (const [field, value] of entries) {
    if (field.startsWith('$')) {
      return `${field} is not allowed: "or" is several rules and "not" is an inverted rule (AUTHZ-06).`;
    }
    if (field.includes('.')) return `${field} is a path. A condition names a property of the entity, with no path.`;
    if (!properties.has(field)) return `${field} is not a property of the entity.`;
    if (!isPlain(value)) {
      if (!isOperand(value)) return `The value of ${field} is not a string, a number, a boolean, a date or null.`;
      continue;
    }
    const operators = Object.entries(value);
    if (operators.length === 0) return `${field} has no operator.`;
    if (options.oneOperator === true && operators.length > 1) {
      return `${field} has ${String(operators.length)} operators. A declared condition has one for each field (AUTHZ-06).`;
    }
    for (const [operator, operand] of operators) {
      if (operator === '$in' || operator === '$nin') {
        if (!Array.isArray(operand) || !operand.every(isOperand))
          return `${operator} of ${field} needs a list of plain values.`;
      } else if (!OPERATORS.includes(operator)) {
        return `${operator} is not an operator of the language (${OPERATORS.join(', ')}).`;
      } else if (!isOperand(operand)) {
        return `The operand of ${operator} on ${field} is not a plain value.`;
      }
    }
  }
  return undefined;
}

/** Whether a condition is in the language. */
function inLanguage(condition: unknown, properties: ReadonlySet<string>): condition is Condition {
  return explainCondition(condition, properties) === undefined;
}

const isNodes = (value: unknown): value is AstNode[] =>
  Array.isArray(value) && value.every((item) => typeof item === 'object' && item !== null && 'operator' in item);

interface AstNode {
  readonly operator: string;
  readonly field?: string;
  readonly value?: unknown;
}

const NAMES: Readonly<Record<string, string>> = {
  eq: '$eq',
  ne: '$ne',
  in: '$in',
  nin: '$nin',
  gt: '$gt',
  gte: '$gte',
  lt: '$lt',
  lte: '$lte',
};

/** One field of a condition tree, added to the scope that is being built. `eq` is written as the plain value. */
function add(into: Row, node: AstNode): boolean {
  const field = node.field;
  const operator = NAMES[node.operator];
  if (field === undefined || operator === undefined) return false;
  const current = into[field];
  if (current === undefined && !(field in into)) {
    into[field] = node.operator === 'eq' ? node.value : { [operator]: node.value };
    return true;
  }
  // A second condition on one field: both are written as operators.
  const merged: Row = isPlain(current) ? { ...current } : { $eq: current };
  merged[operator] = node.value;
  into[field] = merged;
  return true;
}

function conjunction(node: AstNode): Row | undefined {
  const out: Row = {};
  if (node.operator === 'and') {
    const children = isNodes(node.value) ? node.value : [];
    for (const child of children) if (!add(out, child)) return undefined;
    return out;
  }
  return add(out, node) ? out : undefined;
}

/** The scope of the rows that a set of conditions allows, from the tree that CASL builds: an `or` of the conditions. */
function scopeOf(conditions: readonly Condition[], action: string, name: string): Row | undefined {
  const rules: RawRuleOf<MongoAbility>[] = conditions.map((condition) => ({
    action,
    subject: name,
    conditions: condition,
  }));
  const tree: AstNode | null = rulesToAST(createMongoAbility(rules), action, name);
  if (tree === null) return undefined;
  if (tree.operator === 'or') {
    const parts: Row[] = [];
    for (const child of isNodes(tree.value) ? tree.value : []) {
      const part = conjunction(child);
      if (part === undefined) return undefined;
      parts.push(part);
    }
    return parts.length === 0 ? undefined : { $or: parts };
  }
  return conjunction(tree);
}

interface Source {
  readonly scoped?: ScopedPermission;
}

/**
 * Builds the ability of one request from the permissions that the caller was granted (AUTHZ-01). A permission that an entity
 * declares allows its action on every row, a scoped permission allows it on the rows that its condition names, and anything
 * else is denied (default deny, AUTHZ-04).
 */
export function buildAbility(input: AbilityInput): Ability {
  const { registry, granted, user } = input;
  const scoped = input.scoped ?? {};
  for (const [permission, definition] of Object.entries(scoped)) {
    const declared = registry.entriesOf(permission).filter((entry) => entry.field === undefined);
    if (
      declared.length > 0 &&
      !declared.some((entry) => entry.subject === definition.subject && entry.action === definition.action)
    ) {
      throw authzError(
        'AUTHZ_PERMISSION_CONFLICT',
        500,
        `The scoped permission ${permission} names ${definition.subject} and ${definition.action}, and an entity declares it for something else.`,
        'Give the scoped permission the subject and the action of the entity that declares it, or use another string.',
      );
    }
  }

  /** The sources that allow `action` on `subjectName`: the plain ones allow every row. */
  const sourcesOf = (subjectName: string, action: Action): Source[] => {
    const found: Source[] = [];
    for (const permission of granted) {
      const definition = scoped[permission];
      if (definition !== undefined) {
        if (definition.subject === subjectName && definition.action === action) found.push({ scoped: definition });
        continue;
      }
      for (const entry of registry.entriesOf(permission)) {
        if (entry.field === undefined && entry.subject === subjectName && entry.action === action) found.push({});
      }
    }
    return found;
  };

  /** The conditions of the sources, or `undefined` when one of them is not in the language. */
  const conditionsOf = (entity: EntityShape, sources: readonly Source[]): Condition[] | undefined => {
    const conditions: Condition[] = [];
    for (const source of sources) {
      if (source.scoped === undefined) continue;
      let condition: unknown;
      try {
        condition = source.scoped.when(user);
      } catch {
        return undefined;
      }
      if (!inLanguage(condition, entity.properties)) return undefined;
      conditions.push(condition);
    }
    return conditions;
  };

  const fieldsOf = (entity: EntityShape, access: 'read' | 'update'): Set<string> => {
    const masked = registry.maskedFields(entity.name);
    const out = new Set<string>();
    for (const field of entity.fields) {
      const mask = masked.get(field);
      const permission = access === 'read' ? mask?.read : mask?.update;
      // A field without a mask follows the entity. A field with a mask, but none for this access, is closed.
      if (mask === undefined || (permission !== undefined && granted.has(permission))) out.add(field);
    }
    return out;
  };

  return {
    has: (permission) => granted.has(permission),
    covers(permission) {
      if (granted.has(permission)) return true;
      return registry
        .entriesOf(permission)
        .some((entry) => entry.field === undefined && sourcesOf(entry.subject, entry.action).length > 0);
    },
    access(entity, action) {
      const sources = sourcesOf(entity.name, action);
      if (sources.length === 0) return { allowed: false, reason: 'no-permission' };
      const everyRow = sources.some((source) => source.scoped === undefined);
      let scope: Row | undefined;
      if (!everyRow) {
        const conditions = conditionsOf(entity, sources);
        scope = conditions === undefined ? undefined : scopeOf(conditions, action, entity.name);
        if (scope === undefined) return { allowed: false, reason: 'unsupported-condition' };
      }
      return {
        allowed: true,
        ...(scope === undefined ? {} : { scope }),
        ...(action === 'read' ? { readable: fieldsOf(entity, 'read') } : {}),
        ...(action === 'create' || action === 'update' ? { writable: fieldsOf(entity, 'update') } : {}),
      };
    },
    allows(entity, action, row) {
      const sources = sourcesOf(entity.name, action);
      if (sources.length === 0) return false;
      if (sources.some((source) => source.scoped === undefined)) return true;
      const conditions = conditionsOf(entity, sources);
      if (conditions === undefined) return false;
      const rules: RawRuleOf<MongoAbility>[] = conditions.map((condition) => ({
        action,
        subject: entity.name,
        conditions: condition,
      }));
      return createMongoAbility(rules).can(action, subject(entity.name, { ...row }));
    },
  };
}
