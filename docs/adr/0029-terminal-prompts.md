<!--
  BieberKit

  @file        docs/adr/0029-terminal-prompts.md
  @description Architecture decision record for the terminal prompts of create-bieberkit and the CLI: @clack/prompts behind a port of the kit.
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

# 0029. Terminal prompts: @clack/prompts behind a port of the kit

- Status: Accepted
- Date: 2026-11-26
- Deciders: Bieber Kieu
- Requirements: spec 5.1, spec 6, P1, P9

## Context

`pnpm create bieberkit` is the first thing a person sees of the framework. Today each question is one `node:readline` line, such as `Which database? (postgres, mysql, sqlite*)`, answered by typing a word or a number. There are no arrow keys, no hints, no summary, and the output of `pnpm install` and git scrolls past unformatted. Only the database, the template and, when git does not know it, the author are asked. The name must be typed on the command line, and the extra plugins of spec 6 step 4, the admin, the site, the license, the install and git are reachable only by flag.

The maintainer wants the experience of create-vite and create-t3-app: a guided flow with arrow keys. Both are built on `@clack/prompts`.

Constraints: every prompt keeps its flag, and `--yes`, `--json` and a terminal that is not a TTY never prompt (spec 5.1, `BK_CREATE_CHOICE_NEEDED`). The `Ask` port of `create-bieberkit/kit` is shared with the `bieberkit` CLI (`plugin remove` asks to drop data, `backup` asks for a passphrase). A new runtime dependency needs this record (P9).

## Options

| Option                                                         | For                                                                                                                                                                              | Against                                                                                                                     |
| -------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| A. `@clack/prompts` behind the kit's port, bundled into `dist` | The exact look of create-vite and create-t3-app. Select, multiselect, confirm, text, password, spinner, notes, and Ctrl+C handled and tested on many terminals, Windows included | Six packages of code to trust, even inlined. Their notices must ship, and a fix in clack waits for our release              |
| B. Own prompts on `node:readline` and ANSI codes               | No dependency                                                                                                                                                                    | 400 to 600 lines of raw mode, redraw, narrow terminals, Windows and Ctrl+C to write and keep. Hard to reach the same polish |
| C. `@inquirer/prompts`                                         | Mature, many prompt types                                                                                                                                                        | Heavier, and does not look like the two tools the maintainer named                                                          |
| D. Do nothing                                                  | No work                                                                                                                                                                          | The first impression stays as it is                                                                                         |

## Decision

Option A, bundled. `@clack/prompts` is a development dependency of `create-bieberkit`, and tsdown inlines it into `dist`, as create-vite does. Only one file of the kit imports it. Commands keep talking to a port, so tests answer with a script, and the CLI gets the same prompts through `create-bieberkit/kit`.

Bundled into `dist`, so the published package has no new dependency (P9):

| Package                       | Version | Used by                     | License | Maintainers (npm)                        | Reason                        |
| ----------------------------- | ------- | --------------------------- | ------- | ---------------------------------------- | ----------------------------- |
| `@clack/prompts`              | 1.9.0   | create-bieberkit (kit)      | MIT     | natemoo-re, 43081j, dreyfus92 and 4 more | The prompts and the spinner   |
| `@clack/core`                 | 1.6.0   | through `@clack/prompts`    | MIT     | same as above                            | The unstyled prompt engine    |
| `sisteransi`                  | 2.0.0   | through `@clack/core`       | MIT     | terkelg                                  | Cursor and erase codes        |
| `fast-wrap-ansi`              | 0.2.2   | through `@clack/core`       | MIT     | 43081j                                   | Wraps text with colour codes  |
| `fast-string-width`           | 3.0.2   | through `fast-wrap-ansi`    | MIT     | fabiospampinato                          | The printed width of a string |
| `fast-string-truncated-width` | 3.0.3   | through `fast-string-width` | MIT     | fabiospampinato                          | Its core                      |

None has an install script. Their license texts go in `NOTICE`, as MIT requires for a copy. A fix in clack reaches people with the next release of the framework, not on their own install. Colours come from `node:util` `styleText`, which honours `NO_COLOR`, so `picocolors` is not needed. 1.9.0 was published on 2026-11-09, past `minimumReleaseAge`. MIT is compatible with Apache-2.0.

### The port

`Ask` becomes `Prompts`, with `select`, `multiselect`, `confirm`, `text` (with a validator), `password`, `spinner`, `note`, `intro` and `outro`. A cancel (Ctrl+C or Esc) throws `BK_CANCELLED` (exit 1), and nothing has been written because choices resolve before files (spec 6). The two CLI call sites move to `confirm` and `password`.

### The flow of create-bieberkit

Asked in this order, each only when its flag was not given:

1. Name (text, checked as an npm name and an empty folder). The positional becomes optional when a person is at the terminal.
2. Database (select): PostgreSQL, MySQL, SQLite, each with a one-line hint. SQLite is highlighted, as the `--yes` default.
3. Template (select). A question with one choice is not asked, and its answer shows in the summary. Today only `blank` ships.
4. Extra plugins (multiselect) of the index that support the dialect and are not in the template. Not asked when there are none.
5. Admin app and public site (confirm each).
6. License (select): UNLICENSED, MIT, Apache-2.0, or another SPDX identifier (text).
7. Author (text), only when git does not know it.
8. Install and git (confirm each).

Then a summary note and "Create the project?". Writing files, `pnpm install` and git each run under a spinner. The output of a step is kept and shown only when it fails. The end is a note with the next commands and the URLs, then the outro.

## Evidence

create-vite 9.4.0 bundles `@clack/prompts` ^1.9.0 (a development dependency, inlined at build), and create-t3-app 7.40.0 depends on `@clack/prompts` ^0.6.3 (their `package.json` on npm). The tree and versions above are from `pnpm view` on 2026-11-26.

## Consequences

- The scaffolder looks like the tools people know, and every choice is reachable without knowing its flag.
- Agents and CI see no change: the flags, `--yes`, `--json` and `BK_CREATE_CHOICE_NEEDED` stay as they are.
- The install of `pnpm create bieberkit` gains no package: clack ships inside `dist` (about 95 kB unpacked before tree-shaking). An update of clack waits for `minimumReleaseAge` in this repository, and reaches people with a release.
- `NOTICE` carries the MIT notices of the six packages.
- A second prompt library is ruled out (P1). New prompts go through the port.

## Spec changes

- 5.1: `<name>` is asked when it is missing and a person is at the terminal. The flags table is unchanged.
- 6: steps 1 to 4 describe the order above, the summary and the confirmation. Step 12 shows the next steps in the closing note.

## Follow-ups

- Implement the port with clack, the scripted test double, and the flow above.
- Move `plugin remove` and `backup` in the CLI to the port.
