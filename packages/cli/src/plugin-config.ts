/**
 * BieberKit
 *
 * @file        packages/cli/src/plugin-config.ts
 * @description Edits the plugins list of bieberkit.config.ts as text, and keeps everything else of the file as the person wrote it (section 5.2, PLG-03).
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

import { maskCode } from './check/code.ts';
import { CliError } from './errors.ts';

interface Located {
  /** The offset of the `[` and of the `]` of the list. */
  readonly open: number;
  readonly close: number;
  /** The items, each with the offsets of its text in the file, cut at the commas that are not inside a bracket. */
  readonly items: readonly { readonly from: number; readonly to: number; readonly text: string }[];
}

function fail(): never {
  throw new CliError('The plugins list of bieberkit.config.ts could not be read as `plugins: [ ... ]`.', {
    code: 'BK_CONFIG_UNEDITABLE',
    fix: 'Edit the list by hand: one entry for each plugin, a name or [name, options].',
  });
}

function locate(text: string): Located {
  const masked = maskCode(text);
  const found = /\bplugins\s*:\s*\[/.exec(masked);
  if (found === null) return fail();
  const open = found.index + found[0].length - 1;
  let depth = 0;
  let close = -1;
  const cuts: number[] = [open + 1];
  for (let i = open; i < masked.length; i += 1) {
    const c = masked[i];
    if (c === '[' || c === '(' || c === '{') depth += 1;
    else if (c === ']' || c === ')' || c === '}') {
      depth -= 1;
      if (depth === 0) {
        close = i;
        cuts.push(i);
        break;
      }
    } else if (c === ',' && depth === 1) cuts.push(i);
  }
  if (close === -1) return fail();
  const items = cuts
    .slice(0, -1)
    .map((from, index) => ({ from: index === 0 ? from : from + 1, to: cuts[index + 1] ?? close }))
    .map(({ from, to }) => {
      const raw = text.slice(from, to);
      const trimmed = raw.trim();
      const start = from + raw.indexOf(trimmed);
      return { from: start, to: start + trimmed.length, text: trimmed };
    })
    .filter((item) => item.text !== '');
  return { open, close, items };
}

const nameOf = (item: string): string => /^\[?\s*(['"])([^'"]+)\1/.exec(item)?.[2] ?? '';

/** The names of the plugins that the list holds, in the order of the file. */
export function pluginNames(text: string): string[] {
  return locate(text).items.map((item) => nameOf(item.text));
}

/** The text with `name` added at the end of the list, in the style of the list: on its own line when the list has lines. */
export function addPlugin(text: string, name: string): string {
  const { open, close, items } = locate(text);
  const inner = text.slice(open + 1, close);
  const indent = /\n([ \t]+)\S/.exec(inner)?.[1] ?? '    ';
  const closing = /\n([ \t]*)$/.exec(inner)?.[1] ?? '  ';
  const last = items.at(-1);
  if (last === undefined) return `${text.slice(0, open + 1)}\n${indent}'${name}',\n${closing}${text.slice(close)}`;
  // After the last entry, and after its comma when it has one.
  const comma = /^\s*,/.exec(text.slice(last.to))?.[0].length ?? 0;
  const end = last.to + comma;
  const multiline = inner.includes('\n');
  if (multiline) return `${text.slice(0, last.to)},\n${indent}'${name}',${text.slice(end)}`;
  return `${text.slice(0, last.to)}, '${name}'${text.slice(comma === 0 ? last.to : end)}`;
}

/** The text with the entry of `name` removed, with its comma. */
export function removePlugin(text: string, name: string): string {
  const { items } = locate(text);
  const item = items.find((entry) => nameOf(entry.text) === name);
  if (item === undefined) return text;
  const comma = /^\s*,/.exec(text.slice(item.to))?.[0].length ?? 0;
  const before = text.slice(0, item.from);
  const lineStart = before.lastIndexOf('\n');
  const onOwnLine = before.slice(lineStart + 1).trim() === '';
  let next: string;
  if (onOwnLine) {
    // The line of the entry goes with it, so that the list does not keep a blank line.
    const end = item.to + comma + (/^[ \t]*\n/.exec(text.slice(item.to + comma))?.[0].length ?? 0);
    next = `${text.slice(0, lineStart + 1)}${text.slice(end)}`;
  } else if (comma > 0) {
    // In the middle of a line, the comma and the spaces after it go too.
    const end = item.to + comma + (/^[ \t]*/.exec(text.slice(item.to + comma))?.[0].length ?? 0);
    next = `${text.slice(0, item.from)}${text.slice(end)}`;
  } else {
    // The last entry of a line has no comma after it, so the one before it goes.
    next = `${before.replace(/,\s*$/, '')}${text.slice(item.to)}`;
  }
  // A list with nothing in it is written as `[]`, as a person writes it.
  return items.length === 1 ? next.replace(/(\bplugins\s*:\s*)\[\s*\]/, '$1[]') : next;
}
