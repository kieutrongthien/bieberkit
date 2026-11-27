/**
 * BieberKit
 *
 * @file        packages/admin-core/src/inline.ts
 * @description The lines of a record that its form edits: where they start from, what is sent, what is wrong with them and how a conflict sees them (MOD-09, UI-11).
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

import { problemOf } from './validation.ts';
import type { ValueProblem } from './validation.ts';
import type { MetaEntity, MetaInline, Row } from './types.ts';

/** A line as a form holds it: the values of its fields, and the id of the line when it exists. */
export type Line = Record<string, unknown>;

/** The most lines that a record holds (MOD-09). */
export const MAX_LINES = 200;

/** The collections that a person may change: the user may make, change or remove lines, and the record may be written. */
export const editableInline = (entity: MetaEntity): readonly MetaInline[] =>
  (entity.inline ?? []).filter((inline) => inline.can.create || inline.can.update || inline.can.delete);

/** The lines that the form starts from: those of the row, with an id, or none. */
export function initialLines(entity: MetaEntity, row?: Row): Record<string, Line[]> {
  const out: Record<string, Line[]> = {};
  for (const inline of entity.inline ?? []) {
    const given = row?.[inline.name];
    out[inline.name] = Array.isArray(given)
      ? given.flatMap((line): Line[] =>
          typeof line === 'object' && line !== null && !Array.isArray(line)
            ? [Object.fromEntries(Object.entries(line))]
            : [],
        )
      : [];
  }
  return out;
}

const empty = (value: unknown): boolean => value === undefined || value === null || value === '';

/**
 * The lines as the body of a save: the fields of the form of each line that have a value (an empty one of an optional field is `null`
 * for a line that exists, so that it can be cleared), and the id of a line that exists. A collection that the form did not change is not
 * sent, so that a save of the other fields does not touch the lines (`changed` names the collections that were).
 */
export function linesBody(
  entity: MetaEntity,
  lines: Readonly<Record<string, readonly Line[]>>,
  changed: ReadonlySet<string>,
): Record<string, Row[]> {
  const body: Record<string, Row[]> = {};
  for (const inline of editableInline(entity)) {
    if (!changed.has(inline.name)) continue;
    body[inline.name] = (lines[inline.name] ?? []).map((line) => {
      const out: Record<string, unknown> = {};
      if (typeof line['id'] === 'string') out['id'] = line['id'];
      for (const field of inline.fields) {
        const value = line[field.key];
        if (empty(value)) {
          if (typeof line['id'] === 'string' && !field.required) out[field.key] = null;
          continue;
        }
        out[field.key] = value;
      }
      return out;
    });
  }
  return body;
}

/** What is wrong with one line, by the key of the field, in the order of the fields. */
export function lineProblems(inline: MetaInline, line: Readonly<Line>): { key: string; problem: ValueProblem }[] {
  return inline.fields.flatMap((field) => {
    const problem = problemOf(field, line[field.key]);
    return problem === undefined ? [] : [{ key: field.key, problem }];
  });
}

/** Whether the collection is changed from where it started: another number of lines, another id or another value. */
export function linesChanged(inline: MetaInline, start: readonly Line[], now: readonly Line[]): boolean {
  if (start.length !== now.length) return true;
  return now.some((line, at) => {
    const before = start[at];
    if (before === undefined || before['id'] !== line['id']) return true;
    return inline.fields.some(
      (field) =>
        (empty(before[field.key]) ? '' : before[field.key]) !== (empty(line[field.key]) ? '' : line[field.key]),
    );
  });
}

/** The defaults of a new line. */
export const newLine = (inline: MetaInline): Line =>
  Object.fromEntries(
    inline.fields.filter((field) => field.default !== undefined).map((field) => [field.key, field.default]),
  );
