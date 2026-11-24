/**
 * BieberKit
 *
 * @file        packages/cli/src/check/rules/transactions.ts
 * @description Rule transactions: nothing external runs inside a transaction: no http call, no mail, no queue dispatch (WP-01).
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

import { closingParen, lineAt, maskCode } from '../code.ts';
import type { Rule, Violation } from '../rule.ts';
import { isCode, violation } from '../rule.ts';

const OPEN = /\b(?:runInTransaction|runInUnitOfWork)\s*\(|\.\s*transactional\s*\(/g;
const EXTERNAL: readonly { readonly pattern: RegExp; readonly what: string }[] = [
  { pattern: /\b(?:http|httpFetch)\s*\.\s*fetch\s*\(|(?<![.\w$])fetch\s*\(/g, what: 'an HTTP call' },
  { pattern: /\b(?:mail|mailer)\s*\.\s*(?:send|sendNow)\s*\(/g, what: 'a mail' },
  { pattern: /\bqueue\s*\.\s*dispatch\s*\(/g, what: 'a queue dispatch' },
];

export const transactionsRule: Rule = {
  name: 'transactions',
  summary: 'No http call, mail or queue dispatch inside a transaction: write an outbox event (WP-01).',
  run: ({ files }) => {
    const found: Violation[] = [];
    for (const file of files.filter(isCode)) {
      const text = maskCode(file.text);
      for (const open of text.matchAll(OPEN)) {
        const start = open.index + open[0].length - 1;
        const end = closingParen(text, start);
        if (end === -1) continue;
        const body = text.slice(start, end);
        for (const { pattern, what } of EXTERNAL) {
          for (const call of body.matchAll(pattern)) {
            found.push(
              violation(
                'transactions',
                'BK_TX_EXTERNAL_CALL',
                file.path,
                lineAt(file.text, start + call.index),
                `${what} runs inside a transaction.`,
                'Write an outbox event with emitEvent in the transaction, and let the worker do it after the commit (WP-01).',
              ),
            );
          }
        }
      }
    }
    return found;
  },
};
