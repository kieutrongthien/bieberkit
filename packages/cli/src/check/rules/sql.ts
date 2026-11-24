/**
 * BieberKit
 *
 * @file        packages/cli/src/check/rules/sql.ts
 * @description Rule sql: a query is built through the ORM or with parameters, and a statement built from a string is reported (SEC-05).
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

import { lineAt, matchesInCode } from '../code.ts';
import type { Rule } from '../rule.ts';
import { isCode, violation } from '../rule.ts';

// A call that runs text as SQL, with a first argument that is built: a template with `${}`, or text joined with `+`.
const CALL = /(?:\bsql\s*\.\s*raw|\.\s*raw|\.\s*execute|\.\s*query)\s*\(\s*/g;
const BUILT = /^(?:`[^`]*\$\{|(?:'[^'\n]*'|"[^"\n]*")\s*\+|[A-Za-z_$][\w$.]*\s*\+\s*['"`])/;

export const sqlRule: Rule = {
  name: 'sql',
  summary: 'No SQL is built from strings: use the ORM or parameters (SEC-05).',
  run: ({ files }) =>
    files.filter(isCode).flatMap((file) => {
      // The text of strings is kept, because the question is what is inside the first argument.
      return matchesInCode(file.text, CALL)
        .filter((match) =>
          BUILT.test(file.text.slice(match.index + match[0].length, match.index + match[0].length + 400)),
        )
        .map((match) =>
          violation(
            'sql',
            'BK_SQL_STRING_BUILT',
            file.path,
            lineAt(file.text, match.index),
            'A statement is built from a string.',
            'Use the ORM, or the sql tag with values (sql`... ${value}`), which sends the values as parameters (SEC-05).',
          ),
        );
    }),
};
