<!--
  BieberKit

  @file        README.md
  @description Overview of the BieberKit framework repository.
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

# BieberKit

BieberKit is an open-source TypeScript framework for management-style web apps and APIs. One command creates a production-ready project with API, admin UI, auth, permissions, queue, cache and storage already wired. Features come from plugins, and starter templates (blank, cms, crm, saas) are presets of plugins.

> Status: specification and scaffolding (Phase 0). Nothing is published yet. Read [the specification](docs/spec/SPEC.md).

```sh
pnpm create bieberkit@latest example-project   # planned, not published yet
```

## Stack

Node.js 26 LTS (24.12 or later), TypeScript 7 with erasable syntax only, pnpm 12, Fastify 5, MikroORM 7 on PostgreSQL, MySQL or SQLite, Better Auth, CASL, BullMQ on Valkey, BentoCache, FlyDrive, React 19 with TanStack and Ant Design 6 for the admin, TanStack Start for server-rendered public sites. The full baseline is in [spec section 3](docs/spec/SPEC.md#3-technology-baseline).

## Repository

| Path | Content |
| --- | --- |
| `packages/` | Framework packages (`@bieberkit/*`, `bieberkit`, `create-bieberkit`) |
| `plugins/` | First-party plugins (`@bieberkit/plugin-*`) |
| `templates/` | Starter templates: blank, cms, crm, saas |
| `registry/` | Copy-in UI blocks and module recipes |
| `skills/` | Agent Skills shipped into generated projects |
| `docs/` | Specification, ADRs, module specs |
| `examples/` | Sample apps for upgrade and compatibility tests |
| `tools/` | Header checker, layer checker, skill sync, bootstrap |

## Development

Requirements: Node.js 26 LTS (24.12 or later), pnpm 12, git.

```sh
sh tools/bootstrap.sh   # first time only: git, hooks, dev tools, install, checks
pnpm check              # headers, package layers, skill mirror
pnpm typecheck && pnpm lint && pnpm test && pnpm build
```

Contributions follow [CONTRIBUTING.md](CONTRIBUTING.md). AI coding agents read [AGENTS.md](AGENTS.md).

## License

Apache License 2.0. See [LICENSE](LICENSE) and [NOTICE](NOTICE). Copyright 2026 Bieber Kieu.
