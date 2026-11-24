---
'create-bieberkit': minor
'bieberkit': minor
---

Add the scaffolder. `create-bieberkit <name>` and `bieberkit create <name>` make a project from flags or prompts (`--db`, `--template`, `--plugins`, `--admin`, `--site`, `--author`, `--license`, `--install`, `--git`, `--yes`, `--json`), resolve the plugin graph before they write a file, and write the config, the environment with fresh secrets, `.env.example`, `compose.yaml`, the headers of the project, the workspace with the settings of the supply chain, a `LICENSE` for a known SPDX identifier, and the first commit. `create-bieberkit/kit` holds the arguments, the failures and the runner that the CLI shares.
