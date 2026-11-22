<!--
  BieberKit

  @file        docs/adr/0003-logging-binding.md
  @description Decision on where pino binds, given that @bieberkit/core has no runtime dependency.
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

# 0003. Logging: a port in core, pino behind a contract package

- Status: Proposed
- Date: 2026-11-22
- Deciders: Bieber Kieu
- Requirements: PKG-01, PKG-02, PKG-03, PKG-04, OBS-01, SEC-09, spec section 3 (Logging row)

## Context

OBS-01 requires pino logs with `time`, `level`, `msg`, `role`, `requestId`, `traceId`, `spanId`, and `tenantId` and `userId` when known. SEC-09 requires redaction of secrets, tokens, passwords and `pii: true` fields. PKG-04 says `@bieberkit/core` has no runtime dependency besides Node.js built-ins, so core cannot import pino.

Core still has to log before any adapter exists. Boot step 2 (spec 7.2) fails on invalid config and must print a structured error. The lifecycle logs boot, ready and shutdown. All four roles (`web`, `worker`, `scheduler`, `migrate`) log, but only `web` runs Fastify.

## Options

| Option | For | Against |
| --- | --- | --- |
| A. Port in core, new contract package `@bieberkit/log` with pino under `@bieberkit/log/pino` | Follows PKG-02 and PKG-03 exactly. Every role can use it. Core keeps PKG-04. Replaceable by another adapter (P12) | A 19th package. Needs spec 4.1 and 4.3 edits and a layer entry in `tools/lib/layers.ts` |
| B. Port in core, pino adapter as a subpath of `@bieberkit/http` | No new package. Fastify 5.12.8 already depends on pino (`^9.14.0 \|\| ^10.1.0`), so no new transitive dependency | Worker, scheduler and migrate would import the HTTP package to log. Couples logging to one contract |
| C. Import pino in core | Simplest wiring | Breaks PKG-04. Needs a spec change to a rule that exists to keep the kernel dependency free |
| D. Drop pino, write our own JSON logger | No dependency | Re-implements redaction, child loggers and serializers, and changes the baseline (section 3) and OBS-01. Fastify then needs a pino-shaped adapter anyway |

## Decision

Option A.

- `@bieberkit/core` defines the `Logger` interface (levels, `child(bindings)`) and ships a small default that writes JSON lines to stdout with the OBS-01 fields. It uses only Node.js built-ins. It is what runs until the pino adapter is installed in the kernel, and it is the logger used in boot failures.
- Request context (`requestId`, `tenantId`, `userId`, role, trace ids) lives in core on `AsyncLocalStorage` from `node:async_hooks`. Any adapter reads it. No adapter owns it.
- `@bieberkit/log` is a Contracts-layer package. Its pino adapter (`@bieberkit/log/pino`) is the only place that imports pino, and it implements SEC-09 redaction through pino's `redact` option plus the `pii: true` field list.
- `@bieberkit/http` passes the kernel logger to Fastify as `loggerInstance`.

## Evidence

- `npm view` on 2026-11-22: pino 10.4.0, MIT, last modified 2026-10-02. Fastify 5.12.8 lists pino and `abstract-logging` as dependencies.
- `@opentelemetry/instrumentation-pino` 0.71.0 (Apache-2.0) exists. Whether it fits our adapter is left to the observability ADR, not decided here.
- Not measured: the overhead of the core default logger against pino. The default is not meant for production load, so this is not a blocker.

## Consequences

- Easier: all roles log the same way. Swapping pino later touches one subpath.
- Harder: one more package to build, version and document. The core default logger is a second implementation of OBS-01, so a shared contract test must run against both.
- Runtime dependency line (P9) for pino: reason, structured fast JSON logging with redaction. Maintainer: the pinojs organization (to be confirmed before acceptance). License: MIT.
- Ruled out: importing pino anywhere outside `@bieberkit/log/pino`.
- Open: where OpenTelemetry binds (OBS-02). It follows the same pattern, but it needs its own ADR.

## Spec changes

- Section 4.1: add `log/` to the package tree.
- Section 4.3: add `log` to the Contracts row.
- Section 20 (OBS-01): state that core owns the `Logger` port and request context, and the pino adapter lives in `@bieberkit/log/pino`.
- AGENTS.md package layers list: add `log` (maintainer-only file, proposed not edited).

## Follow-ups

- If accepted: create the package with `bieberkit-new-package`, add it to `tools/lib/layers.ts`, and add roadmap items to M1.1 and M1.6 through a spec change (the roadmap may only gain items the spec has).
- Shared contract test for the `Logger` port, named after OBS-01 and SEC-09.
