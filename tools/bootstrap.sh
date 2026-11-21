#!/bin/sh
# BieberKit
#
# @file        tools/bootstrap.sh
# @description First-time setup of a BieberKit checkout: hooks, dev tools, install and checks.
# @author      Bieber Kieu <kieutrongthien@gmail.com>
# @copyright   Copyright (c) 2026 Bieber Kieu
# @license     Apache-2.0
#
# Licensed under the Apache License, Version 2.0 (the "License");
# you may not use this file except in compliance with the License.
# You may obtain a copy of the License at
#
#     http://www.apache.org/licenses/LICENSE-2.0
#
# Unless required by applicable law or agreed to in writing, software
# distributed under the License is distributed on an "AS IS" BASIS,
# WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
# See the License for the specific language governing permissions and
# limitations under the License.
#
# SPDX-License-Identifier: Apache-2.0

set -eu

# First-time setup of a BieberKit checkout. Safe to run again.
# Usage: sh tools/bootstrap.sh

cd "$(dirname "$0")/.."

fail() {
  echo "bootstrap: $1" >&2
  echo "    Fix: $2" >&2
  exit 1
}

command -v git >/dev/null 2>&1 || fail "git is not installed." "install git."
command -v node >/dev/null 2>&1 || fail "Node.js is not installed." "install Node.js 26 LTS (24.12 or later also works)."
command -v pnpm >/dev/null 2>&1 || fail "pnpm is not installed." "install pnpm 12, see https://pnpm.io/installation"

node -e '
const [major, minor] = process.versions.node.split(".").map(Number);
if (major < 24 || (major === 24 && minor < 12)) {
  console.error("bootstrap: Node.js " + process.versions.node + " is too old.\n    Fix: use Node.js 26 LTS or 24.12 or later.");
  process.exit(1);
}' || exit 1

PNPM_VERSION=$(pnpm --version)
PNPM_MAJOR=$(echo "$PNPM_VERSION" | cut -d. -f1)
[ "$PNPM_MAJOR" -ge 12 ] || fail "pnpm $PNPM_VERSION is too old." "run pnpm self-update 12"

# Git repository and hooks (pre-commit checks, DCO sign-off on commit-msg).
[ -d .git ] || git init -b main
git config core.hooksPath .githooks
chmod +x .githooks/* tools/bootstrap.sh

# Turborepo needs the packageManager field. Record the pnpm version in use.
node -e '
const fs = require("node:fs");
const pkg = JSON.parse(fs.readFileSync("package.json", "utf8"));
pkg.packageManager = "pnpm@" + process.argv[1];
fs.writeFileSync("package.json", JSON.stringify(pkg, null, 2) + "\n");' "$PNPM_VERSION"

# Development tools. Added once, then pinned exactly by saveExact and the lockfile.
if ! grep -q '"turbo"' package.json; then
  pnpm add --workspace-root --save-dev \
    typescript@^7 \
    @types/node@^24 \
    turbo@^2 \
    tsdown \
    oxlint \
    oxlint-tsgolint \
    oxfmt \
    vitest@^4 \
    publint \
    @arethetypeswrong/cli \
    @changesets/cli
fi

pnpm install
pnpm check

echo
echo "bootstrap: done."
echo "    Next: git add -A && git commit -s -m 'chore: initial scaffold'"
