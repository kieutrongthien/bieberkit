<!--
  BieberKit

  @file        docs/adr/0030-setting-declarations.md
  @description Decision record: a setting is declared with defineSetting in core and contributed under the settings key of a module or plugin.
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

# 0030. Settings are declared with `defineSetting` and contributed under `settings`

- Status: Proposed
- Date: 2026-11-26
- Deciders: Bieber Kieu
- Requirements: SET-01 to SET-07, P1, P9, PKG-01, PKG-04, BPL-03, PLG-07

## Context

The `settings` plugin stores any key with a text value through generated entity routes. Nothing says which keys exist, what type they hold, who may see them, whether they differ per tenant, or whether they are secret. SET-01 asks that every setting is declared before it is used, and that a read is typed (SET-05). Decision 2 of [the design](../modules/base-plugins-complete.md) puts the declaration on `definePlugin`, which is a public API the maintainer designs (AGENTS.md, Workflow 6).

Constraints:

- **Layers (PKG-01).** In slice S6, `@bieberkit/auth` (contracts) declares the `security.*` policies. It cannot import a plugin, so the declaration type cannot live in `@bieberkit/plugin-settings`.
- **Core (PKG-04)** may use Node.js built-ins only. A JSON Schema validator cannot go there.
- **One way (P1).** Plugin options already validate with a `Parser` (`{ parse }`, Zod Mini compatible).
- **Existing pattern.** `definePlugin` passes keys it does not know into the module's `contributions`, and a package types them by merging `ModuleContributions`. `scopedPermissions` and `subscriptions` work this way.

## Options

| Option                                                                             | For                                                                                                                                                      | Against                                                                                    |
| ---------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| A. `defineSetting` in core, contributed as `settings: [...]` by a plugin or module | Same as `scopedPermissions` and `subscriptions`; auth can declare in S6; `definePlugin` can check the key prefix like env and permissions; no dependency | A new public type in core                                                                  |
| B. A runtime registry of the plugin (`settings.declare()` at boot)                 | No change to `definePlugin`                                                                                                                              | Auth cannot declare; keys are not known statically; a second way to contribute (P1)        |
| C. Declared in `bieberkit.config.ts` by the project                                | One place                                                                                                                                                | A plugin cannot bring its own settings, so the base plugins and S6 have nowhere to declare |
| D. Do nothing (a free key/value store)                                             | No work                                                                                                                                                  | SET-01 to SET-07 cannot be met: no validation, no secret, no typed read                    |

Two sub-choices go with A:

| Question                      | Chosen                                                  | Rejected                                                                                 |
| ----------------------------- | ------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| How a `json` value is checked | A `Parser<T>`, the type of plugin options               | JSON Schema with a validator: a runtime dependency (P9) and a second validation style    |
| How a read is typed           | `settings.get(def)`, which takes the declaration object | `get('key')` with declaration merging of value types: every plugin writes the type twice |

## Decision

Option A. `@bieberkit/core` exports `defineSetting<T>()` and `SettingDef<T>`, and `ModuleContributions` gains `settings?: readonly SettingDef[]`. A declaration has:

- `key`: dotted, lower case, at most 120 characters
- `type`: `string`, `number`, `boolean`, `enum` (with `values`) or `json` (with a `parser`)
- `default`, `label`, and optionally `description` and `group`
- `scope`: `global` or `tenant`
- `public` and `secret`, optional and never together

`defineSetting` refuses a bad declaration with `CORE_SETTING_INVALID`. This includes a default that fails its own check. `definePlugin` refuses a key that does not start with `<shortName>.` (`PLG_PREFIX_SETTING`). The settings plugin collects the declarations of every module at boot, refuses a key declared twice (`SETTINGS_DUPLICATE_KEY`), and serves typed reads through its `settings` service (BPL-03).

The keys are not added to the static manifest (PLG-07) in this decision. The prefix rule already makes a collision between two plugins impossible.

## Evidence

- `definePlugin` keeps unknown keys as contributions: `packages/core/src/plugins/define-plugin.ts` (`KNOWN`, `contributions`).
- The same pattern is in use: `scopedPermissions` in `plugins/notifications`, `subscriptions` in `packages/queue/src/subscriptions.ts` (BPL-04).
- `Parser` is already the validation port of plugin options in the same file.

## Consequences

- **Easier.** A plugin, or a framework package in S6, declares a setting next to its code, and reads it with a type. The admin (M2.2) lists the declarations with their labels, groups and defaults.
- **Harder.** A setting cannot be added at run time. A project that needs a new one declares it in its own module.
- **Ruled out.** Undeclared keys, the generated entity routes of `settings.Setting` (SET-02), and a JSON Schema validator in core.
- How BieberKit enforces session, MFA and network policy from these settings (decision 7 of the design) is a separate ADR in slice S6.

## Spec changes

- New section 12.3 with SET-01 to SET-07.
- Section 11 (definePlugin): the `settings` key and the prefix rule.
- Document history.

## Follow-ups

- Slice S2: implement the declaration, storage, service and routes.
- When the admin needs it, list setting keys in the static manifest.
- Slice S6: the ADR for the policy port.
