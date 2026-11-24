<!--
  BieberKit

  @file        docs/adr/0024-the-server-package.md
  @description ADR 0024: a package that boots the process roles, so that the entry point of a project is one line and the CLI never has to be imported by it.
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

# 0024. A package that boots the process roles: `@bieberkit/server`

- Status: Accepted
- Accepted: 2026-11-24, by delegation: the maintainer asked the engineer to settle every open decision, and the layer rules leave one place for this code.
- Date: 2026-11-24
- Deciders: Bieber Kieu
- Requirements: section 7 (kernel, roles, boot), section 4.3 (layers), PKG-01, PKG-04, OBS-02 to OBS-04, OBS-06, CFG-02

## Context

Section 7 says that every process starts from one `main.ts`, which reads the role, boots the kernel and starts the role. Section 4.3 says that tools such as `bieberkit` act on the project and are never imported by it (and `bieberkit check` reports an import of one). `@bieberkit/core` is the kernel (config, container, resolver, lifecycle) but may import nothing, so it cannot start a Fastify server or a queue worker.

The code that joins them exists as a sketch in `packages/core/src/kernel.test.ts` (`startApp`) and as parts: `registerHttp` (http), the workers (queue), the tracer, the metrics server and the reporter (core), the pino adapter (log). Nothing composes them, and the milestones that follow (the CLI commands `start`, `dev`, `db:seed`, `doctor`, the base plugins) need one place that does.

## Options

| Option                                                    | For                                                                                                                             | Against                                                                                                                         |
| --------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| A. The boot in `main.ts` of each project (generated code) | No package. A project can read and change it                                                                                    | About 150 lines of wiring that every project owns and every upgrade has to migrate. A change of a contract breaks every project |
| B. The boot in `bieberkit` (the CLI)                      | The CLI exists                                                                                                                  | The project imports a tool, which section 4.3 forbids. A production image would carry the CLI to start a server                 |
| C. A package in the product layer, `@bieberkit/server`    | Upgrades with the framework. The CLI and `main.ts` call the same function. May import every contract (the layer rules allow it) | One more package (spec 4.1 lists none), and ADR 0003 is the only precedent for adding one                                       |

## Decision

Option C. `@bieberkit/server` is in the product layer. It owns what the CLI and a project both need and no tool may export: finding the project (config, plugins, modules), and `boot` of the roles. `apps/server/src/main.ts` is `await main()` from it, and `bieberkit start` and `dev` run that file. The CLI imports the finders from it, so there is one way to load a project.

It adds no third party dependency (P9): it joins `core`, `data`, `http`, `queue`, `cache`, `storage`, `mail`, `auth` and `log`.

## Evidence

- `kernel.test.ts` already proves the sequence on a test app (config, resolve, env, container, lifecycle, stop in reverse).
- `@bieberkit/testing` boots the same pieces for a test, with fakes only at the two headers that name a user and a tenant, which shows that the composition is a function and not a design.

## Consequences

- Easier: a project upgrades its boot with the framework. The generated `main.ts` is one line, and `bieberkit check` can keep forbidding tools in project code.
- Harder: this package depends on every contract, so it changes when one does. A contract change that breaks it fails its tests in the same pull request.
- Ruled out: boot code in a template, and the CLI as a library of a project.

## Spec changes

- Section 4.1: the package list gets `server/  @bieberkit/server  boot of the process roles`. Section 4.3: it is in the product layer. Section 4.2: `main.ts` is the entry that calls it.

## Follow-ups

- The base plugins (M1.8) add the authenticator and the administrator seed to the boot through the services of the container.
