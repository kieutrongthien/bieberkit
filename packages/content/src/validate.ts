/**
 * BieberKit
 *
 * @file        packages/content/src/validate.ts
 * @description The strict check of one block: its keys, its values, its limits and its addresses (CNT-01, CNT-03).
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

import { safeParse } from 'zod/mini';
import type { BlockDef, ContentProblem, EmbedProvider } from './types.ts';
import { isSafeImage, isSafeLink } from './urls.ts';
import { parseVideo, PROVIDER_NAMES } from './video.ts';

export interface Rules {
  readonly blocks: ReadonlyMap<string, BlockDef>;
  readonly embeds: ReadonlySet<EmbedProvider>;
}

export const MAX_BLOCKS = 500;
const MAX_ITEMS = 500;
const MAX_DEPTH = 3;
const MAX_RUN = 20_000;
const MAX_TEXT = 2000;
const MAX_IMAGES = 50;
const MAX_ROWS = 200;
const MAX_CELLS = 20;
const MARKS: ReadonlySet<unknown> = new Set(['bold', 'italic', 'strike', 'code']);
const LEVELS: ReadonlySet<unknown> = new Set([2, 3, 4, 5, 6]);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type Report = (path: string, message: string) => void;
type Check = (value: unknown, path: string, report: Report) => void;

export const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/** An object with these keys and no other. A key that is left out is checked as `undefined`. */
function shape(fields: Readonly<Record<string, Check>>): Check {
  const known = new Map(Object.entries(fields));
  return (value, path, report) => {
    if (!isRecord(value)) return report(path, 'This must be an object.');
    const at = (key: string): string => (path === '' ? key : `${path}.${key}`);
    for (const key of Object.keys(value)) if (!known.has(key)) report(at(key), 'This key is not part of the format.');
    for (const [key, check] of known) check(value[key], at(key), report);
  };
}

const optional =
  (check: Check): Check =>
  (value, path, report) => {
    if (value !== undefined) check(value, path, report);
  };

function list(check: Check, min: number, max: number): Check {
  return (value, path, report) => {
    if (!Array.isArray(value)) return report(path, 'This must be a list.');
    if (value.length < min || value.length > max)
      return report(path, max === Infinity ? 'This list is too short.' : `This must hold ${min} to ${max} entries.`);
    value.forEach((entry: unknown, index) => check(entry, `${path}[${index}]`, report));
  };
}

/** Text of `min` to `max` characters, where a character is a code point. */
function text(max: number, min = 0): Check {
  return (value, path, report) => {
    if (typeof value !== 'string') return report(path, 'This must be text.');
    // A string has at least as many code units as code points, so a short one need not be counted.
    const length = value.length > max ? Array.from(value).length : value.length;
    if (length < min) report(path, 'This must not be empty.');
    else if (length > max) report(path, `This must be at most ${max} characters.`);
  };
}

const boolean: Check = (value, path, report) => {
  if (typeof value !== 'boolean') report(path, 'This must be true or false.');
};

function address(allowed: (value: string) => boolean, message: string): Check {
  return (value, path, report) => {
    if (typeof value !== 'string' || value.length > MAX_TEXT || !allowed(value)) report(path, message);
  };
}

const link = address(isSafeLink, 'Use an https, http, mailto or tel address, or one that starts with / or #.');
const imageSrc = address(isSafeImage, 'Use an https address, or one that starts with /.');

const mark: Check = (value, path, report) => {
  if (!MARKS.has(value)) report(path, 'A mark is bold, italic, strike or code.');
};

const run = shape({ text: text(MAX_RUN), marks: optional(list(mark, 0, MARKS.size)), href: optional(link) });
const runs = list(run, 0, Infinity);

/** The keys of a list, nested at most `MAX_DEPTH` deep. */
function listFields(depth: number): Readonly<Record<string, Check>> {
  const nested: Check = (value, path, report) => {
    if (depth === MAX_DEPTH) report(path, `Lists nest at most ${MAX_DEPTH} deep.`);
    else shape(listFields(depth + 1))(value, path, report);
  };
  return { ordered: boolean, items: list(shape({ content: runs, list: optional(nested) }), 1, MAX_ITEMS) };
}

const image: Check = (value, path, report) => {
  shape({
    alt: text(MAX_TEXT),
    src: optional(imageSrc),
    media: optional((id, at, say) => {
      if (typeof id !== 'string' || !UUID.test(id)) say(at, 'This must be the id of a media record, a UUID.');
    }),
  })(value, path, report);
  if (isRecord(value) && (value['src'] === undefined) === (value['media'] === undefined))
    report(path, 'An image has exactly one of src and media.');
};

/** The type is what chose the check, so its value is not checked again. */
const type: Check = () => {};

const table: Check = (value, path, report) => {
  const cells = list(runs, 1, MAX_CELLS);
  shape({ type, header: boolean, rows: list(cells, 1, MAX_ROWS) })(value, path, report);
  const rows: unknown = isRecord(value) ? value['rows'] : undefined;
  if (!Array.isArray(rows)) return;
  const widths = new Set(rows.map((row: unknown) => (Array.isArray(row) ? row.length : 0)));
  if (widths.size > 1) report(`${path}.rows`, 'Every row must have the same number of cells.');
};

function video(rules: Rules): Check {
  return (value, path, report) => {
    const found = typeof value === 'string' && value.length <= MAX_TEXT ? parseVideo(value) : undefined;
    if (found === undefined) report(path, 'Use the https address of a YouTube or Vimeo video.');
    else if (!rules.embeds.has(found.provider))
      report(path, `${PROVIDER_NAMES[found.provider]} videos are not allowed here.`);
  };
}

const BUILT_IN: ReadonlyMap<string, (rules: Rules) => Check> = new Map<string, (rules: Rules) => Check>([
  ['paragraph', () => shape({ type, content: runs })],
  [
    'heading',
    () =>
      shape({
        type,
        level: (value, path, report) => {
          if (!LEVELS.has(value)) report(path, 'A heading has a level from 2 to 6. Level 1 is the title of the page.');
        },
        content: runs,
      }),
  ],
  ['list', () => shape({ type, ...listFields(1) })],
  ['quote', () => shape({ type, content: runs, cite: optional(text(MAX_TEXT)) })],
  ['image', () => shape({ type, image, caption: optional(text(MAX_TEXT)) })],
  ['gallery', () => shape({ type, images: list(image, 1, MAX_IMAGES) })],
  ['video', (rules) => shape({ type, url: video(rules), title: text(MAX_TEXT, 1) })],
  ['table', () => table],
  ['cta', () => shape({ type, label: text(MAX_TEXT, 1), href: link, text: optional(text(MAX_TEXT)) })],
]);

function custom(definition: BlockDef): Check {
  return shape({
    type,
    data: (value, path, report) => {
      const result = safeParse(definition.schema, value);
      if (result.success) return;
      for (const issue of result.error.issues) {
        let at = path;
        for (const key of issue.path) at += typeof key === 'number' ? `[${key}]` : `.${String(key)}`;
        report(at, issue.message);
      }
    },
  });
}

/** Every problem of one block. `path` is where it is, for example `blocks[0]`. */
export function blockProblems(block: unknown, path: string, rules: Rules): ContentProblem[] {
  const problems: ContentProblem[] = [];
  const report: Report = (at, message) => void problems.push({ path: at, message });
  const name = isRecord(block) ? block['type'] : undefined;
  if (typeof name !== 'string') report(isRecord(block) ? `${path}.type` : path, 'A block is an object with a type.');
  else {
    const definition = rules.blocks.get(name);
    const check = BUILT_IN.get(name)?.(rules) ?? (definition === undefined ? undefined : custom(definition));
    if (check === undefined) report(`${path}.type`, 'There is no block of this type.');
    else check(block, path, report);
  }
  return problems;
}
