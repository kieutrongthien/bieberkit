<!--
  BieberKit

  @file        docs/adr/0020-bullmq-install-script.md
  @description ADR 0020: how BullMQ is installed under strictDepBuilds: msgpackr-extract is denied by name, and the redis queue driver runs on the pure JavaScript path of msgpackr.
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

# 0020. BullMQ and the install script of msgpackr-extract

- Status: Accepted
- Accepted: 2026-11-24, by delegation: the maintainer asked the engineer to settle every open decision, and this one follows the requirements and the evidence above.
- Date: 2026-11-24
- Deciders: Bieber Kieu
- Requirements: Q-11, PKG-03, SEC-14, P9, ADR 0010 (decision 3)

## Context

The `redis` queue driver is BullMQ on Valkey (ADR 0010, Accepted). ADR 0010 says that the install script of `msgpackr-extract` must not be allowed. `pnpm-workspace.yaml` sets `strictDepBuilds: true` and `allowBuilds: {}`, so a dependency with an install script that is not listed makes the install fail.

BullMQ 6.7.6 depends on `msgpackr` 2.1.4, which has an optional dependency `msgpackr-extract` 3.0.7 (MIT, kriszyp). Its `install` script runs `node-gyp-build-optional-packages`: it looks for a prebuilt binary in one of six platform packages and, if there is none, falls back to the pure JavaScript path of `msgpackr`. The result, checked on 2026-11-24 in a copy of the repository:

- With no entry, `pnpm add bullmq@6.7.6 ioredis@5.11.1` stops: `Ignored build scripts: msgpackr-extract@3.0.7`.
- With `allowBuilds: { msgpackr-extract: false }`, the same command succeeds, `✓ Lockfile passes supply-chain policies`, and `bullmq` and `ioredis` are in the manifest. No script runs.

The file that decides this is `pnpm-workspace.yaml`, which an agent may not change (AGENTS.md, SEC-14). So the driver code is on the branch `feat/queue-redis`, and it cannot be installed from a clean checkout until a maintainer makes the choice below.

## Options

| Option                                        | For                                                                                                       | Against                                                                                         |
| --------------------------------------------- | --------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| A. `allowBuilds: { msgpackr-extract: false }` | Says "reviewed, and denied" in the file that records it. No script runs. The decision of ADR 0010 is kept | msgpackr encodes with its JavaScript path: a little slower, which a job payload does not notice |
| B. `allowBuilds: { msgpackr-extract: true }`  | Native speed of the encoder                                                                               | Runs a script from a dependency on every install, and on CI. Against ADR 0010 and the policy    |
| C. Remove `msgpackr-extract` with an override | Same result as A                                                                                          | The override is a second place to keep in step, and it hides the choice                         |
| D. No BullMQ: our own Redis driver            | No dependency                                                                                             | Our own queue on Redis is a project of its own. It contradicts ADR 0010, which measured BullMQ  |

## Decision proposed

Option A. The maintainer adds to `pnpm-workspace.yaml`:

```yaml
allowBuilds:
  msgpackr-extract: false
```

Then `feat/queue-redis` installs and builds, and its tests run against a Valkey with `maxmemory-policy noeviction` (`QUEUE_TEST_REDIS_URL`). The reason for the pull request that adds the entry is this ADR.

Runtime dependencies that the branch adds (P9):

| Package   | Version | Used by                  | License | Maintainers (npm)                   | Reason                                        |
| --------- | ------- | ------------------------ | ------- | ----------------------------------- | --------------------------------------------- |
| `bullmq`  | 6.7.6   | queue (`/redis` subpath) | MIT     | taskforce.sh (manast, and the team) | The queue on Valkey of ADR 0010               |
| `ioredis` | 5.11.1  | queue (`/redis` subpath) | MIT     | ioredis-robot, dmaier-redislabs     | The client of BullMQ. The version of ADR 0016 |

`bullmq` 6.7.7 and later are held back by `minimumReleaseAge` until 2026-11-24 and 2026-11-26. Its own dependencies are `tslib`, `semver`, `msgpackr`, `cron-parser` and `node-abort-controller` (all MIT, except `tslib`: 0BSD).

## Consequences

- Easier: one line, with the reason in an ADR, unblocks the driver. The file keeps the record of every build that was reviewed.
- Harder: the branch cannot be merged to `main` before the entry, because `pnpm install --frozen-lockfile` fails on it.
- Ruled out: running the script of `msgpackr-extract`, and a queue of our own on Redis.

## Spec changes

None. 15.1 already names BullMQ.
