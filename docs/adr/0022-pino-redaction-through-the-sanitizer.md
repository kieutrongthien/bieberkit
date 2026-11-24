<!--
  BieberKit

  @file        docs/adr/0022-pino-redaction-through-the-sanitizer.md
  @description ADR 0022: the pino adapter redacts with the sanitizer of core before pino sees a value, and keeps pino for the line, the levels and the stream.
  @author      Bieber Kieu <kieutrongthien@gmail.com>
  @copyright   Copyright (c) 2026 Bieber Kieu
  @license     Apache-2.0

  Licensed under the Apache License, Version 2.0 (the "License");
  you may not use this file except in compliance with the License.
  You may obtain a copy of the License at

      http://www.apache.org/licenses/LICENSE-2.0

  Unless required by applicable law or agreed to in writing, software
  distributed under the License is distributed on an "AS IS" BASIS,
  WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
  See the License for the specific language governing permissions and
  limitations under the License.

  SPDX-License-Identifier: Apache-2.0
-->

# 0022. The pino adapter redacts with the sanitizer of core

- Status: Accepted
- Accepted: 2026-11-24, by delegation: the maintainer asked the engineer to settle every open decision, and the evidence below leaves one workable option.
- Date: 2026-11-24
- Deciders: Bieber Kieu
- Requirements: OBS-01, SEC-09, CFG-05, P1

## Context

ADR 0003 says that `@bieberkit/log/pino` "implements SEC-09 redaction through pino's `redact` option plus the `pii: true` field list". Writing the adapter shows that `redact` cannot do what the default logger of core already does and the tests of core already pin:

- `redact` takes paths of a fixed depth (`a.b.c`, `*.password`). SEC-09 and CFG-05 ask for "this key, at any depth, in any case" (`Email` in `row.list[0]`), and for a key that merely looks like a secret (`apiKey`, `Authorization`).
- It does not touch the message, an `Error` or its `cause`, and it does not replace a secret _value_ wherever it appears (CFG-05: the DSN inside a URL, inside a stack).

Two redactions that differ would make a line depend on the logger that wrote it, and a field of personal data could leak in one and not in the other. P1 says one way to do each thing.

## Options

| Option                                                           | For                                      | Against                                                                                                                                            |
| ---------------------------------------------------------------- | ---------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| A. Pino's `redact` with a list of paths built from the entities  | As ADR 0003 wrote it. Done inside pino   | A path has a depth, so a nested or renamed field escapes. Nothing for values, messages and errors. A second set of rules to keep in step with core |
| B. The sanitizer of core, run on fields and bindings before pino | One set of rules, tested once, same line | Core exports a function and a type more. Pino sees plain data, so its own serializers are unused                                                   |
| C. Both: the sanitizer, and `redact` as a second net             | Two layers                               | Two sets of rules, and the paths of the second can only repeat what the first does                                                                 |

## Decision

Option B. `@bieberkit/core` exports `createLogSanitizer` and `RESERVED_LOG_FIELDS`, the code that its own logger already uses. `createPinoLogger` runs every field, binding and message through the sanitizer and gives pino plain data. Pino stays for what it does well: the line (`time`, `level` as a name, `msg`), the level check, child bindings and the stream. A contract suite, `loggerContractSuite` of `@bieberkit/log/testing`, runs on the default logger and on the pino adapter, so a difference in a line is a failing test.

ADR 0003 is not changed in its decision (the port is in core, pino is imported only in `@bieberkit/log/pino`). Only the means of redaction differs from the sentence about `redact`.

## Evidence

- `packages/log/src/testing/contract-suite.ts`: 17 cases that both loggers pass, among them `Email` in `list[0]`, a secret in a cause, a binding that holds a secret, and a named key of a binding.
- pino 10.4.0 is already in the lockfile through Fastify 5.12.8, so the dependency adds no new package to the tree.

## Consequences

- Easier: one rule for what a line may hold, and a new adapter proves it by passing the suite.
- Harder: the adapter pays for the sanitizer on each call that passes the level check. Not measured; the core logger has the same cost.
- Ruled out: pino's `redact` and pino's serializers as a place for redaction rules.

## Spec changes

- Section 20 (OBS-01): none. The redaction paragraph of ADR 0003 now points here.

## Follow-ups

- The list of keys comes from `piiFields` of the entities, passed as `redactKeys` where the kernel builds the logger (M1.8, with the CLI).
