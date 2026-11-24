/**
 * BieberKit
 *
 * @file        packages/cli/src/check/rules/orm.ts
 * @description Rule orm: entity files import only @bieberkit/data, and the escape hatches of ADR 0009 are reported (SCH-08).
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

import { lineAt, maskCode } from '../code.ts';
import { importsOf } from '../imports.ts';
import type { Rule, Violation } from '../rule.ts';
import { isCode, violation } from '../rule.ts';

export const ormRule: Rule = {
  name: 'orm',
  summary: 'Entity files import no ORM, and orm overrides and hand-written entities are reported (SCH-08).',
  run: ({ files }) => {
    const found: Violation[] = [];
    for (const file of files.filter(isCode)) {
      const code = maskCode(file.text);
      const handWritten = /\.orm\.[cm]?[jt]sx?$/.test(file.path);
      if (handWritten) {
        found.push(
          violation(
            'orm',
            'BK_ORM_HANDWRITTEN',
            file.path,
            1,
            `${file.path} is a hand-written ORM entity, the escape hatch of ADR 0009.`,
            'Keep it if you need it. It has no route and no admin screen unless it declares expose.',
            'warning',
          ),
        );
      }
      if (!/\bdefineEntity\s*\(/.test(code)) continue;
      for (const { specifier, line } of importsOf(file.text)) {
        if (specifier.startsWith('@mikro-orm/') || specifier === 'kysely') {
          found.push(
            violation(
              'orm',
              'BK_ORM_IN_ENTITY',
              file.path,
              line,
              `An entity file imports ${specifier}.`,
              'An entity file imports only @bieberkit/data. Put ORM code in a *.orm.ts file (SCH-08).',
            ),
          );
        }
      }
      for (const match of code.matchAll(/\borm\s*:\s*\{/g)) {
        found.push(
          violation(
            'orm',
            'BK_ORM_OVERRIDE',
            file.path,
            lineAt(file.text, match.index),
            'An entity merges metadata into the generated ORM schema with orm: { ... }.',
            'Keep it if the generated schema cannot say it. It is reported so that it is a decision (ADR 0009).',
            'warning',
          ),
        );
      }
    }
    return found;
  },
};
