/**
 * BieberKit
 *
 * @file        packages/create/src/scaffold/env-example.ts
 * @description Writes .env.example from the rows of an env schema, the same bytes every time, and never a secret (section 5.2, CFG-06, GEN-03).
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

import type { EnvDescription } from '@bieberkit/core';

/** One key as it is written in `.env.example`: its description, what it takes, and the key with the default or nothing. */
function block(row: EnvDescription): string {
  const takes = row.values === undefined ? (row.expected ?? row.type) : row.values.join(' | ');
  const need = row.required ? 'required' : row.default === undefined ? 'optional' : `default ${row.default}`;
  // A secret never shows its value or its default (CFG-06).
  const value = row.secret ? '' : (row.default ?? '');
  return [`# ${row.description}`, `# ${takes}, ${need}${row.secret ? ', secret' : ''}`, `${row.key}=${value}`].join(
    '\n',
  );
}

/** The text of `.env.example`: each key once, in the order of the rows, so that the same schema gives the same bytes. */
export function renderEnvExample(rows: readonly EnvDescription[]): string {
  return `${rows.map(block).join('\n\n')}\n`;
}
