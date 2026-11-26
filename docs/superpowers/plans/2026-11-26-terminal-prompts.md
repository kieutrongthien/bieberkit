<!--
  BieberKit

  @file        docs/superpowers/plans/2026-11-26-terminal-prompts.md
  @description Implementation plan for ADR 0029: the Prompts port of the kit, backed by a bundled @clack/prompts, and the new flow of create-bieberkit.
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

# Terminal prompts Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `pnpm create bieberkit` asks with arrow keys, a summary and spinners, like create-vite, while flags, `--yes` and `--json` behave as before.

**Architecture:** The kit's `Ask` function becomes a `Prompts` port. One file, `kit/terminal.ts`, implements it with `@clack/prompts`, which tsdown inlines into `dist`. Commands and tests only see the port; tests answer with a scripted double.

**Tech Stack:** TypeScript, `@clack/prompts` 1.9.0 (dev dependency, bundled), tsdown 0.23.7, vitest.

**Spec:** `docs/adr/0029-terminal-prompts.md`, `docs/spec/SPEC.md` sections 5.1 and 6.

## Global Constraints

- Every prompt keeps its flag. `--yes`, `--json` and a stdin that is not a TTY never prompt (spec 5.1).
- With nobody to ask and no `--yes`, `BK_CREATE_CHOICE_NEEDED` lists every missing flag, exit 2.
- Prompts, spinners and notes write to stderr. Stdout stays one machine-readable document with `--json`.
- Only `packages/create/src/kit/terminal.ts` imports `@clack/prompts`. `@clack/prompts` is in `devDependencies`, never `dependencies`.
- No clack type appears in a `.d.ts` that ships (the port has its own types).
- A cancel (Ctrl+C, Esc) throws `CliError` code `BK_CANCELLED`, exit 1, and writes no file.

## Review Focus

- Ctrl+C at the summary confirm: nothing is written, exit 1, message `Cancelled.`. Test in Task 2.
- A name typed at the prompt that points at a non-empty folder: the prompt says so and asks again instead of failing later. Test in Task 2.
- `--json` with a TTY: no prompt and no spinner text on stdout. Covered by the existing 5.1 test, kept in Task 2.
- A failing `pnpm install` under the spinner: the spinner stops with an error, the problem is in the outcome, exit 1. Test in Task 2.
- The published `dist` imports no `@clack/*` package. Test in Task 3.

---

### Task 1: The Prompts port, its test double and the clack terminal

**Files:**

- Modify: `packages/create/src/kit/command.ts` (replace `Ask`)
- Modify: `packages/create/src/kit/run.ts` (`Io.ask` → `Io.prompts`; skip an empty `outcome.text`)
- Create: `packages/create/src/kit/terminal.ts`
- Create: `packages/create/src/kit/scripted.ts` (test double, exported for the CLI tests)
- Modify: `packages/create/src/kit/index.ts`, `packages/create/src/bin.ts`, `packages/cli/src/bin.ts`, `packages/cli/src/commands/plugin.ts`, `packages/cli/src/commands/backup.ts`, `packages/cli/src/run.ts` if it forwards `ask`
- Test: `packages/create/src/kit/scripted.test.ts`, `packages/cli/src/plugin.test.ts` (PLG-03 test moves to the double)

**Interfaces:**

- Produces, in `kit/command.ts`:

```ts
export interface PromptOption<T extends string> {
  readonly value: T;
  readonly label: string;
  readonly hint?: string;
}
export interface Prompts {
  intro(title: string): void;
  note(text: string, title: string): void;
  outro(text: string): void;
  select<T extends string>(message: string, options: readonly PromptOption<T>[], initial: T): Promise<T>;
  multiselect<T extends string>(
    message: string,
    options: readonly PromptOption<T>[],
    initial: readonly T[],
  ): Promise<T[]>;
  confirm(message: string, initial: boolean): Promise<boolean>;
  /** `validate` answers the problem to show, or undefined when the value is good. */
  text(
    message: string,
    options?: {
      readonly initial?: string;
      readonly placeholder?: string;
      readonly validate?: (value: string) => string | undefined;
    },
  ): Promise<string>;
  password(message: string): Promise<string>;
  /** Runs `work` under a spinner: `title` while it runs, `done` (or the error's first line) when it ends. Rethrows. */
  task<T>(title: string, done: string, work: () => Promise<T>): Promise<T>;
}
```

`CommandContext.ask` becomes `CommandContext.prompts?: Prompts`, `Io.ask` becomes `Io.prompts?: Prompts`, same rule as today for when it is set.

- Produces `terminalPrompts(): Prompts` in `kit/terminal.ts`: clack with `output: process.stderr`; a cancelled answer (`isCancel`) calls `cancel('Cancelled.')` and throws `new CliError('Cancelled.', { code: 'BK_CANCELLED', fix: 'Run the command again.' })`.
- Produces `scriptedPrompts(answers: readonly (string | boolean | readonly string[])[]): Prompts & { readonly asked: string[]; readonly shown: string[] }` in `kit/scripted.ts`: each prompt records its message in `asked` and takes the next answer; the answer `CANCEL` (exported constant) throws the same `BK_CANCELLED` error; `intro`, `note`, `outro` record into `shown`; `task` records its title and runs `work`; running out of answers throws.
- Exported from `kit/index.ts`: `Prompts`, `PromptOption`, `terminalPrompts`, `scriptedPrompts`, `CANCEL`.

- [ ] **Step 1: Write the failing tests** in `kit/scripted.test.ts`: `it('5.1 a scripted prompt answers in order and records the questions')`; `it('5.1 a cancel is BK_CANCELLED, exit 1')` asserting `failureOf(error)` is `{ code: 'BK_CANCELLED', exit: 1 }`. In `plugin.test.ts` change the PLG-03 test to pass `scriptedPrompts([false])` and `scriptedPrompts([true])`.
- [ ] **Step 2: Run** `pnpm test packages/create/src/kit packages/cli/src/plugin.test.ts`. Expected: FAIL, `scriptedPrompts` is not exported.
- [ ] **Step 3: Implement** the port, `scripted.ts`, `terminal.ts`; move `plugin remove` to `confirm(..., false)` and `backup:verify` to `password(...)`; give both bins `...(process.stdin.isTTY ? { prompts: terminalPrompts() } : {})`.
- [ ] **Step 4: Run** the tests of step 2 and `pnpm typecheck`. Expected: PASS.
- [ ] **Step 5: Commit** `feat(create): a prompts port in the kit, backed by @clack/prompts`.

### Task 2: The flow of create-bieberkit

**Files:**

- Modify: `packages/create/src/scaffold/choices.ts`, `packages/create/src/commands/create.ts`, `packages/create/src/scaffold/run.ts`
- Test: `packages/create/src/create.test.ts`

**Interfaces:**

- Consumes: `Prompts`, `scriptedPrompts`, `CANCEL` from Task 1.
- `resolveChoices(args, deps)` takes `deps.prompts: Prompts | undefined` instead of `deps.ask`. The positional `name` becomes `required: false`; with no name and nobody to ask it is listed in `BK_CREATE_CHOICE_NEEDED` as `<name>`.
- `scaffold(choices, planned, exec, prompts?)`: when `prompts` is given, the install and git steps run through `prompts.task`.

Questions, in this order, each only when its flag is missing (messages exact):

| Message                    | Kind                       | Options and default                                                                                                                                                 |
| -------------------------- | -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `Project name?`            | text, placeholder `my-app` | validate: `checkProjectName` message, or `The folder <folder> exists and is not empty.`                                                                             |
| `Which database?`          | select                     | `postgres` "PostgreSQL" hint `recommended for production`; `mysql` "MySQL"; `sqlite` "SQLite" hint `development and a single server`; initial `sqlite`              |
| `Which template?`          | select                     | the templates, label = name, hint = description; not asked when there is one                                                                                        |
| `Extra plugins?`           | multiselect                | index plugins that support the dialect and are not in the template; initial none; not asked when the list is empty                                                  |
| `Include the admin app?`   | confirm                    | `true`                                                                                                                                                              |
| `Include the public site?` | confirm                    | `template.site === true`                                                                                                                                            |
| `License?`                 | select                     | `UNLICENSED` hint `private, grants nothing`; `MIT`; `Apache-2.0`; `other` "Another SPDX identifier", which asks `SPDX identifier?` (text, validated with `SPDX_ID`) |
| `Author (Name <email>)?`   | text                       | only when git does not know it; validated with `AUTHOR`                                                                                                             |
| `Run pnpm install?`        | confirm                    | `true`                                                                                                                                                              |
| `Create a git repository?` | confirm                    | `true`                                                                                                                                                              |

Then `note(<summary>, 'Summary')` with Name, Database, Template (and its plugin count), Plugins, Admin, Site, License, and `confirm('Create the project?', true)`; a no throws `BK_CANCELLED`. With prompts the command calls `intro('create-bieberkit <version>')` first, runs writing under `task('Writing files', 'Files written (<n>)', …)`, ends with `note(<next commands and URLs>, 'Next steps')` and `outro('Done. Happy building!')`, and returns `text: ''`. Without prompts the text outcome stays as today.

- [ ] **Step 1: Write the failing tests** in `create.test.ts` (replace the current 5.1 "a person at the terminal" test):
  - `it('6 a person at the terminal is asked in order, sees a summary, and gets the project')`: no flags but `demo`; answers `['mysql', [], true, false, 'MIT', true, true, true]`; `asked` equals the messages of the table without `Project name?`, `Which template?` and `Author`, plus `Create the project?`; `shown` includes a `Summary` note and `Done. Happy building!`; `demo/bieberkit.config.ts` has `dialect: 'mysql'`.
  - `it('5.1 --yes and --json never ask, even with a person at the terminal')`: `asked` stays `[]`.
  - `it('5.1 a missing name is asked, and a folder that is not empty is refused at the prompt')`: given an existing non-empty `taken` folder, the validator of `Project name?` returns the not-empty message for `taken` and undefined for `fresh`.
  - `it('5.1 without a name and with nobody to ask, <name> is in the list of what is missing')`.
  - `it('6 a cancel at the summary writes nothing, exit 1')`: last answer `CANCEL`; folder absent; error code `BK_CANCELLED`.
  - `it('6 a failing install stops its spinner, and the problem is reported, exit 1')`: `exec` rejects for `pnpm`; outcome exit 1; `problems[0]` starts with `pnpm install failed`.
- [ ] **Step 2: Run** `pnpm test packages/create/src/create.test.ts`. Expected: the new tests FAIL.
- [ ] **Step 3: Implement** in `choices.ts`, `create.ts`, `run.ts`. The scripted double needs `text` to run the validator on its answer and throw when it fails, so the validator test can call it.
- [ ] **Step 4: Run** `pnpm test packages/create packages/cli`. Expected: PASS.
- [ ] **Step 5: Commit** `feat(create): ask every choice with arrow keys, a summary and spinners`.

### Task 3: Bundle, notices, spec and changeset

**Files:**

- Modify: `packages/create/tsdown.config.ts` (inline `@clack/*`, `sisteransi`, `fast-*`), `packages/create/NOTICE` (the six MIT notices with their copyright lines, taken from each package's `LICENSE`)
- Modify: `docs/spec/SPEC.md` 5.1 and 6 as the ADR says
- Create: `.changeset/terminal-prompts.md` (`create-bieberkit: minor`, `bieberkit: patch`)
- Test: `packages/create/src/index.test.ts`

- [ ] **Step 1: Write the failing test** `it('ADR-0029 the published dist imports no @clack package, and NOTICE names each bundled one')`: after `pnpm --filter create-bieberkit build`, no file of `dist/*.js` matches `/from\s*["']@clack\//`, no `dist/*.d.ts` mentions `@clack`, `package.json` has no `@clack/prompts` in `dependencies`, and `NOTICE` contains each of the six package names.
- [ ] **Step 2: Run** it. Expected: FAIL on `NOTICE`.
- [ ] **Step 3: Implement** the tsdown config, `NOTICE`, the spec edits and the changeset.
- [ ] **Step 4: Run** `pnpm check`, `pnpm typecheck`, `pnpm lint`, `pnpm test`. Expected: all pass. Then run `node packages/create/dist/bin.js` in a scratch folder at a real terminal to see the flow.
- [ ] **Step 5: Commit** `build(create): bundle @clack/prompts into dist, with its notices`, ticking the roadmap item if one exists.
