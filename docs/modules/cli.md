<!--
  BieberKit

  @file        docs/modules/cli.md
  @description Module spec of the bieberkit CLI: the framework of commands, the output and exit codes, the project loader, and the slices of M1.7.
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

# bieberkit (the project CLI)

- Package: `bieberkit` (tools layer, it may import every package)
- Spec sections: 5.2, 5.3, 5.4, 6, AI-02, AI-03, GEN-01 to GEN-03, CFG-06
- Status: **Slice C1 prepared on 2026-11-24.** M1.7 is cut into slices (below), and each is a reviewable change.

## Slices of M1.7

| Slice | Content                                                                                                                                                                     | State       |
| ----- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------- |
| C1    | The framework of commands, the output, `--json` and the exit codes, the project loader, `plugins`, `env:check`, `env:example`                                               | this change |
| C2    | `bieberkit check` and its rules (boundaries, headers, env access, route permissions, destructive migrations, WP-01, string SQL, stale generated files, ORM in entity files) |             |
| C3    | Deterministic generators (`.bieberkit/*`, `packages/client`, `openapi`, `client:generate`, `routes`) and `make:entity`, `make:module`, `make:job`                           |             |
| C4    | `create-bieberkit`: every flag and prompt, the plugin graph before any write, the files of section 6                                                                        |             |
| C5    | The runtime commands: `start <role>` (the boot that wires the tracer, the metrics server and `redactKeys`), `dev`, `build`, `migrate`, `db:seed`, `doctor`, `test`          |             |
| C6    | `add` and `remove` with the data ownership prompt, and the Oxlint plugin                                                                                                    |             |

## Behavior of C1

1. **One function runs it.** `runCli(argv, io)` answers the exit code. `bin.ts` gives it the real streams and sets `process.exitCode`, and a test gives it arrays. Nothing in the CLI reads `process.env` (P8): a command that needs the environment gets it from core, which reads the real one unless a test passes a source.
2. **Exit codes (section 5.3).** `0` success, `1` failure, `2` the command was used wrongly (unknown command, unknown flag, a flag without its value, a missing or an extra argument), `3` a check found violations (`env:example --check` when the file is stale).
3. **`--json` on every command (AI-03).** One document on stdout: `{ "ok": true, "command", "data" }`, or `{ "ok": false, "command", "error": { code, message, fix, docs, exit, problems? } }`. A check that finds violations is `{ "ok": false, "command", "data" }` with exit code 3. Progress goes to stderr, so stdout can always be parsed. The same answer without `--json` is text, and a failure is text on stderr: `error[CODE]: message`, each problem, `fix:` and `docs:`.
4. **Stable codes (AI-02).** A failure of the CLI has a code that starts with `BK_`: `BK_USAGE_UNKNOWN_COMMAND` (with the nearest command when it is within two edits), `BK_USAGE_UNKNOWN_FLAG`, `BK_USAGE_FLAG_VALUE`, `BK_USAGE_MISSING_ARGUMENT`, `BK_USAGE_UNEXPECTED_ARGUMENT`, `BK_PROJECT_NOT_FOUND`, `BK_PLUGIN_NOT_INSTALLED`, `BK_PLUGIN_NOT_EXPORTED`, `BK_PLUGIN_OPTIONS` and `BK_UNEXPECTED`. An error of the framework keeps its own code (`CFG_ENV_MISSING`, `CFG_CONFIG_INVALID`, `PLG_CYCLE`), and a list of problems (the env, the config, the plugins) is kept as `problems`, each with its key. An error that is not ours or the framework's is `BK_UNEXPECTED` with its message and never its stack. The link is `https://bieberkit.dev/docs/errors/<CODE>`; the address is one constant (`DOCS_BASE`) until the documentation site exists.
5. **The project loader.** A command finds `bieberkit.config.ts` in the working directory or above it (`--cwd` changes the directory), reads it (Node strips the types), checks it with `validateConfig`, loads each plugin that it lists from `node_modules` (the default export of its main file, as in section 11.2), checks its options with the parser that the plugin declared, and resolves the graph with `resolvePlugins` against the real version of core and the dialect of the project. The result is the plugins in boot order.
6. **`plugins`** lists them in boot order with version and requirements.
7. **`env:check`** validates the environment against the merged schema of core and the plugins, reading `.env` of the project and then the real variables (the real ones win, CFG-03). Every problem is reported together.
8. **`env:example`** prints `.env.example` (core first, then the plugins in boot order, a description and what a key takes above each key). A secret never shows its value or default (CFG-06). `--write` writes the file only when it differs, and `--check` exits with 3 when it is missing or out of date, so CI can keep a committed generated file honest (GEN-01). The same schema gives the same bytes (GEN-03).
9. **No telemetry.** The CLI sends nothing anywhere.

## Tests

`args.test.ts` (flags in both forms, negation, short flags, `--`, each usage error), `errors.test.ts` (each kind of failure and its code, fix, link and exit code), `run.test.ts` (help, version, the shape of `--json`, stdout against stderr, the exit codes), `commands.test.ts` (throwaway projects on disk: plugin order, a plugin that is missing, not exported or given options it does not take, an invalid config, `env:check` valid and invalid, `env:example` printed, written, checked and stable).
