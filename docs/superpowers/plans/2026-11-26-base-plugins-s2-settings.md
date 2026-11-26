<!--
  BieberKit

  @file        docs/superpowers/plans/2026-11-26-base-plugins-s2-settings.md
  @description Implementation plan for slice S2 of the complete base plugins: the declaration of settings (ADR 0030), their storage, service and routes, tests first behind the gate of the declaration.
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

# M1.11 slice S2: settings (SET-01..07), with ADR 0030 for the declaration

## Context

S1 is merged into local `main` (210b082). Next on the roadmap is **S2 Complete settings**, which is `[D]` only for the declaration. Today `plugins/settings` is one generic entity (`bk_settings`: key and text value) with generated CRUD routes. Nothing declares a key, nothing validates a value, there is no tenant value, no secret and no typed read. Decision 2 of `docs/modules/base-plugins-complete.md` says the declaration is a new key on `definePlugin`, which changes a public API. That needs an ADR and the maintainer's acceptance (AGENTS.md, Workflow 6).

Decisions taken in this session (maintainer, 2026-11-26):

1. **Where a setting is declared**: a `settings` contribution key, with `defineSetting()` and `SettingDef` in `@bieberkit/core`. It follows the pattern of `scopedPermissions` and `subscriptions`: `definePlugin` passes unknown keys into `contributions`, and `ModuleContributions` is extended by declaration merging. Core holds the type so that `@bieberkit/auth` can declare `security.*` in S6 without importing a plugin.
2. **JSON validation**: a setting of type `json` takes a `Parser<T>` (`{ parse }`, Zod Mini compatible, the type that `definePlugin({ options })` already uses). No new dependency.
3. **Typed read**: `settings.get(def)` takes the declaration object, so the result type comes from `defineSetting<T>`. No declaration merging of value types.
4. **Two ADRs**: ADR 0030 covers the declaration only. The policy port of decision 7 gets its own ADR in S6. The design doc is corrected to say so.

## Branch

`feat/base-plugins-settings` from `main`. No worktree. The plan is copied to `docs/superpowers/plans/2026-11-26-base-plugins-s2-settings.md` with the header.

## The declaration (what ADR 0030 proposes)

```ts
export const siteName = defineSetting({
  key: 'settings.site.name',      // a plugin's keys start with `<shortName>.`, checked by definePlugin like env and permissions
  type: 'string',                 // 'string' | 'number' | 'boolean' | 'enum' (with `values`) | 'json' (with `parser`)
  default: 'BieberKit',           // must pass its own validation, checked at define time
  label: { en: 'Site name' },
  description: { en: '…' },       // optional
  group: 'general',               // optional, for the admin
  scope: 'global',                // or 'tenant': a value per tenant, falling back to global, then to the default (SET-04)
  public: true,                   // optional: served by GET /settings/public (SET-07); refused together with `secret`
  secret: false,                  // optional: encrypted at rest, never returned, never in audit data (SET-03)
});
definePlugin({ …, settings: [siteName] });
```

- `defineSetting` validates the key (`/^[a-z][a-z0-9-]*(\.[a-z][a-z0-9-]*)+$/`, at most 120 characters), the type and its extra field, `default` and `public` with `secret`. Errors are `CORE_SETTING_INVALID` (MOD-17).
- `definePlugin` refuses a key without the plugin prefix (`PLG_PREFIX_SETTING`), the way it handles env and permissions. Framework modules such as auth in S6 are not plugins and have no prefix rule.
- The plugin collects every module's `settings` at boot. A key declared twice is `SETTINGS_DUPLICATE_KEY` (500, at boot).
- Not in the static manifest (PLG-07) in this slice. The prefix makes collisions between plugins impossible. Listing keys in the manifest is a follow-up for when the admin needs it.

## Storage and service (no gate, built after the ADR is accepted)

- **Entity `settings.Setting`**: it becomes `tenant` (uuid, the nil tenant for a global value), `key`, `value` (text, JSON-encoded, nullable), `secretValue` (text `.encrypted()`, nullable, SEC-08), `createdAt`, `updatedAt`, unique on (`tenant`, `key`). `api` is turned off: the generated entity routes go (SET-02, P1). The table arrives through the project's migration, as every plugin entity does (plugins.md, decision 1).
- **Service `settings`**: contributed through `definePlugin({ services })` (BPL-03), with types through `ServiceRegistry` merging.
  - `get(def, { tenantId? })`: typed value; tenant value, then global value, then default.
  - `set(def | key, value, { tenantId?, actorId })`: validates, writes, and audits `settings.setting.updated` with old and new value (key only for a secret, SET-06), in one transaction.
  - `reset(...)`: deletes the stored value, audited as `settings.setting.reset`.
  - Reads go through the cache contract with the tag `settings`, invalidated after commit (DATA-13). A cache that is down falls back to the database, then to the default (SET-05).
- **Routes** (thin, over the service):
  - `GET /api/v1/settings/settings` (`settings.read`): every declared setting with `value`, `default`, `hasValue` and its declaration fields. A secret shows `"********"`. Keyset by key, page of at most 100 (BPL-06).
  - `GET .../settings/:key`, `PUT .../settings/:key` (`settings.manage`, `{ value }`), `DELETE .../settings/:key` (`settings.manage`, back to the default).
  - An undeclared key is `SETTINGS_UNKNOWN_KEY` (404). A bad value is `SETTINGS_INVALID_VALUE` (422) with the reason.
  - `GET /api/v1/settings/public`: `public: true`, no session needed, `cache` headers (API-09). Only declarations marked `public`.
- The plugin declares its own first settings, with the prefix `settings.`: `settings.site.name`, `settings.site.locale`, `settings.site.logo` (the login screen and the site, SET-07).

## Files

| File                                                                                                                                                                                                             | Change                                                                     |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| `docs/adr/0030-setting-declarations.md`, `docs/adr/README.md`                                                                                                                                                    | the ADR (Proposed) and its index line                                      |
| `packages/core/src/settings/define-setting.ts` (new), `packages/core/src/index.ts`                                                                                                                               | `defineSetting`, `SettingDef`, the `settings` key on `ModuleContributions` |
| `packages/core/src/plugins/define-plugin.ts`                                                                                                                                                                     | prefix check of `settings` keys (`PLG_PREFIX_SETTING`)                     |
| `plugins/settings/src/{index,service,routes,declarations}.ts`                                                                                                                                                    | entity, service, routes, own declarations                                  |
| `docs/spec/SPEC.md` (new section 12.3, SET-01..07, changelog), `docs/modules/base-plugins-complete.md` (decisions 2 and 7 corrected), `docs/modules/plugins.md` (settings row), `docs/ROADMAP.md`, `.changeset/` | docs                                                                       |

## Tasks

### Task 1: ADR, then the declaration tests (RED), then GATE

1. Write ADR 0030 (Proposed) with the options from this session, and the spec text of SET-01 to SET-07 in the same PR.
2. RED tests for the declaration in `packages/core/src/settings/define-setting.test.ts` and `define-plugin.test.ts`:
   - `SET-01` a valid declaration for each type
   - a bad key, a missing `values` or `parser`, a default that fails, and `public` together with `secret` are each `CORE_SETTING_INVALID`
   - `definePlugin` refuses a key without the prefix (`PLG_PREFIX_SETTING`)
   - `settings` reaches `module.contributions`
   - `get` is typed from the declaration (type test)
3. RED tests for the plugin in `plugins/settings/src/index.test.ts`, with `describeDialects` and `createTestApp`:
   - `SET-01` unknown key is 404; a duplicate key fails at boot
   - `SET-02` the generated entity routes are gone; PUT validates, and DELETE goes back to the default
   - `SET-03` a secret is masked in the list and in get, and is absent from the audit data and from the stored `value` column
   - `SET-04` tenant value, then global, then default; tenants do not see each other's values
   - `SET-05` the typed `get`; invalidation after commit; the default when the cache throws
   - `SET-06` audit entries with old and new value, rolled back when the audit fails
   - `SET-07` `/settings/public` without a session lists only public settings, with cache headers
   - `BPL-06` page and cursor
   - `AUTHZ-01` the two permissions
4. **GATE**: show the ADR and the RED output, then stop. The maintainer accepts the ADR (status change) or asks for changes. Commit the ADR, the spec text and the tests on the branch.

### Task 2: core declaration (after GATE)

`defineSetting`, the contribution type and the prefix check. The tests of item 2 go green.

### Task 3: settings plugin

Entity, service with cache, routes, own declarations, and the service in the registry. The tests of item 3 go green.

### Task 4: docs, manifests, changeset, roadmap

Regenerate the manifests (`pnpm manifests:write`, because the routes change), update the docs, add a changeset (core minor, plugin-settings minor) and tick S2.

## Verification

1. `sh tools/test-services.sh start`, `export $(sh tools/test-services.sh env | xargs)`, then `BK_REQUIRE_DIALECTS=all pnpm test packages/core plugins/settings`.
2. `pnpm check`, `pnpm typecheck`, `pnpm lint`, then `BK_REQUIRE_DIALECTS=all pnpm test:coverage` on Node 26 and `pnpm test` on Node 24.12, with the output read in the session.
3. Keep the branch for the maintainer, or open a PR. Never merge without being asked, and never push.
