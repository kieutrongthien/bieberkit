<!--
  BieberKit

  @file        docs/modules/log.md
  @description Module spec of @bieberkit/log: the logger contract, the pino adapter and the suite that both pass.
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

# @bieberkit/log

- Package: `@bieberkit/log`
- Layer: contracts (it may import `@bieberkit/core`)
- Spec sections: 20 (OBS-01), SEC-09, CFG-05, PKG-02, PKG-03
- Status: **Prepared on 2026-11-24.** ADR 0003 (Accepted) binds the port and the adapter, ADR 0022 (Accepted) says how the adapter redacts.

## Purpose

Gives every role (web, worker, scheduler, migrate) one logger with one line, whichever library writes it. The `Logger` port, the default logger, the request context and the redaction live in `@bieberkit/core` (PKG-04). This package is the place of the contract suite and of the one adapter that imports pino.

## Public API

```ts
// @bieberkit/log: the port and the default logger of core, so that a caller has one import
createLogger(options); createLogSanitizer(secrets, redactKeys); requestContext; LOG_LEVELS
type Logger, LoggerOptions, LogFields, LogLevel, RequestContext, LogSanitizer

// @bieberkit/log/pino
createPinoLogger(options: LoggerOptions): Logger

// @bieberkit/log/testing
loggerContractSuite(name, { make(options: LoggerOptions): Logger })
```

## Rules

1. **One line (OBS-01).** A JSON object on one line with `time` (ISO 8601, UTC), `level` (its name), `msg` and `role`, then `requestId`, `traceId`, `spanId`, `tenantId` and `userId` of the request that runs when they are known, then the bindings of `child`, then the fields of the call. A binding or a field never replaces one of the base names.
2. **Levels.** `fatal`, `error`, `warn`, `info`, `debug`, `trace`. A line below the level of the logger is not built.
3. **Values are data.** A field that cannot be written as JSON does not stop the line: a cycle is `[circular]`, a bigint is its digits, `undefined` is left out, a `Date` is ISO, bytes are `[n bytes]`, an `Error` is `name`, `message`, `code`, `status`, `stack` and `cause`.
4. **Nothing secret (CFG-05).** A value in `secrets` is replaced by `[redacted]` in the message, in every field, in an error and its stack, and in a binding. A field whose name looks like a secret (`password`, `token`, `authorization`, `cookie`, `api key`, `private key`) is redacted without being named.
5. **Nothing personal (SEC-09).** A field named in `redactKeys` is redacted at any depth and in any case. The kernel builds the list from the `pii` fields of the entities. With no list, nothing is guessed.
6. **One redaction (ADR 0022).** Every logger runs fields through `createLogSanitizer`. An adapter that redacts in its own way fails the suite.
7. **The adapter is the only importer of pino (PKG-03).** `createPinoLogger` writes to standard output without blocking, or to `options.write` one line at a time with no newline. A message is text: `%s` in it is not a format.
8. **Out of scope.** Transports and shipping of logs (the platform collects standard output), log rotation, and a log level that changes while running.

## Tests

- `loggerContractSuite`, 17 cases, run in `logger-contract.test.ts` on the default logger of core and on the pino adapter: the line, the ids of the request, fields that never replace the base ones, an `Error`, circular values, levels, children, secrets in the message, in fields, in errors and in bindings, empty secrets, and the named keys of SEC-09.
- `adapters/pino/pino.test.ts`: a message with `%` is text, no newline reaches the sink, `err` keeps the shape of the contract, and the clock is read for each line.
