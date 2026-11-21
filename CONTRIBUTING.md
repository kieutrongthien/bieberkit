<!--
  BieberKit

  @file        CONTRIBUTING.md
  @description How to contribute to BieberKit: issues first, sign-off, AI disclosure.
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

# Contributing to BieberKit

BieberKit has one maintainer, Bieber Kieu. These rules keep review time sustainable (spec section 24).

## Before you start

1. **Open an issue first** (GOV-01). A pull request needs a linked issue that the maintainer has accepted. Typo and documentation fixes are the exception.
2. Read [AGENTS.md](AGENTS.md). It is short and lists the rules that matter most, for humans and agents alike.
3. Large or design-level changes need an ADR in `docs/adr/` first.

## Setup

```sh
sh tools/bootstrap.sh
```

The script checks Node.js and pnpm versions, sets the git hooks path to `.githooks/`, installs dependencies and runs `pnpm check`.

## Making a change

- Write tests first, from the spec. Name tests after the requirement they prove.
- Every new file needs the header from spec section 23. `pnpm check:headers --fix` inserts it, you write the description.
- Run `pnpm check`, `pnpm typecheck`, `pnpm lint` and `pnpm test` before pushing.
- A change to a published package needs a changeset: `pnpm changeset`.

## Commits

- Conventional Commits: `type(scope): summary`, for example `fix(http): reject the null origin in CORS`.
- **Sign off every commit** with `git commit -s`. This adds the Developer Certificate of Origin line (GOV-03, [developercertificate.org](https://developercertificate.org/)). The `commit-msg` hook rejects commits without it.

## AI-assisted contributions

AI tools are welcome (GOV-02). In the pull request, say which tools you used and for what. You must be able to explain every line. Pull requests that the author cannot explain, or that have no accepted issue, are closed.

## License

By contributing you agree that your contribution is licensed under the Apache License 2.0, as stated in section 5 of the license.
