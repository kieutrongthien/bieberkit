<!--
  BieberKit

  @file        docs/adr/0033-entity-extensions.md
  @description Decision record: a plugin adds fields to another plugin's entity by declaring an extension, which the framework stores in a 1:1 table of the extending plugin and merges into the API of the target.
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

# 0033. Entity extensions: fields of another plugin's entity in a 1:1 table

- Status: Accepted
- Date: 2026-11-27
- Deciders: Bieber Kieu
- Requirements: PLG-06, PLG-02, PLG-03, PLG-07, MOD-01, DATA-08, DATA-18, DATA-19, DATA-26, API-13, AUTHZ-02, UI-02, P7

## Context

Spec 11.3 says that a plugin adds fields to another plugin's entity with `extends`, "stored in an extension table owned by the extending plugin, joined automatically, and exposed in the target's API and admin form". PLG-06 says the fields never become columns of the target table, so that the target plugin can change its schema freely and removing the extending plugin drops only its own table. The example of 11.1 writes `extends: { 'pages.Page': { fields: { seo: f.hasOne(() => SeoMeta) } } }`, and ADR 0009 left `extends` out of `defineEntity`. Nothing implements it, and H2 of M2.1 asks for a design that the maintainer reviews, because it changes the data layer, the generated routes and the plugin contract.

What the code does today, and so what constrains the design:

- A plugin contributes `entities` to its module. `definePlugin` passes keys that it does not know to `ModuleContributions`, so a new contribution key needs no change to `definePlugin` (ADR 0030 used the same way).
- `compileEntities` turns `EntityDef`s into MikroORM schemas, and builds a sibling `<table>_i18n` entity for localized fields. Everything above the ORM (the generated routes, `_meta`, OpenAPI, the authorizer, the generated types) reads the field list through `entityOfSchema(schema)`.
- Reads of a page go through `listPage`, which knows the fields of the entity; localized values are merged by a batched query (`localize.ts`). Writes go through `toOrmData` and `em.create`/`em.assign`.
- `bieberkit remove` and the resolver read the tables of a plugin from its manifest (`tables`, PLG-07), which a collector fills from `entities`.
- A target with hand-written routes (media) or no `EntityDef` (`AuthUser`) has no generated route that could expose extra fields.

## Options

| Option                                                                                                                         | For                                                                                                                                               | Against                                                                                                              |
| ------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| A. `extends` gives fields; the framework makes a 1:1 table of the extending plugin and merges the fields into the target's API | The target's API, `_meta` and types show the fields with no work of the target plugin; the write path is one transaction; matches PLG-06 and 11.3 | The data layer must split a row into base and extension parts                                                        |
| B. A JSON column on the target                                                                                                 | Simple                                                                                                                                            | Breaks PLG-06 (a column of the target); no types, no index, no field masks                                           |
| C. Columns added to the target table by the extending plugin's migration                                                       | Simple reads                                                                                                                                      | Breaks PLG-06 and MOD-01; the target cannot change its schema freely                                                 |
| D. `f.hasOne(() => OwnEntity)` as in the example of 11.1: a relation to a hand-written entity of the extending plugin          | The extending plugin controls its entity                                                                                                          | The API shows a nested object and has no write path; each plugin writes its own routes and joins; no flat form field |

## Decision

Option A. The declaration is the `extends` contribution of 11.1, with a value made by a new builder `defineExtension` in `@bieberkit/data`. Neither `definePlugin` nor `defineEntity` changes its signature; `ModuleContributions` gains `extends`.

```ts
const PageSeo = defineExtension({
  table: 'seo_page_ext',
  fields: { seoTitle: f.string({ max: 70 }).optional(), noindex: f.boolean().default(false) },
  permissions: { fields: { noindex: { read: 'seo.read', update: 'seo.manage' } } },
});
export default definePlugin({ name: '@bieberkit/plugin-seo', requires: { '@bieberkit/plugin-pages': '^1.0.0' }, extends: { 'pages.Page': PageSeo }, ... });
```

1. **Storage.** One table for each (extending module, target), named by the author (`table`, snake case, at most 40 characters, not the table of an entity). Its primary key is `id`, equal to the id of the target row, with a foreign key to the target and `on delete cascade`. When the target has a tenant, the extension has `tenant_id` and the key is the composite `(tenant_id, id)` of DATA-26, so a row of one tenant can never point at a row of another (DATA-19). There is no column in the target table, ever. The table is an entity of the compiled list, so `migrate:make` diffs it, adding a field is an expand step and removing one is destructive (DATA-08).
2. **Fields.** Scalar fields of the field DSL only (no relations, no features, no `sequence`). A name that the target has, or another extension of the same target has, is `DATA_EXTENSION_FIELD_CLASH`; a target that no module declares is `DATA_EXTENSION_TARGET_UNKNOWN`; a table that an entity or another extension already uses is `DATA_EXTENSION_TABLE_CLASH`. All three fail at boot, with the module and the field named.
3. **Effective entity.** `resolveExtensions` is a pure function of the entity defs and the extensions. It gives the extension entities for the compiler and the **effective** def of each target: its own fields followed by the fields of the extensions, in the order of the plugins. The routes, `_meta`, OpenAPI, the authorizer and the generated types read the effective def, so they need no knowledge of extensions. The ORM schema of the target is built from its own fields only. One helper, `entitiesOf(modules)`, replaces the separate `contributed(modules, 'entities')` reads, so every caller sees the same list.
4. **Reads.** List and detail load the extension rows of a page with one batched query by id (as `localize.ts` does) and merge them into the rows. A row with no extension row shows the defaults of the fields. The extra query is made only when the target has an extension.
5. **Writes.** A create or an update that carries extension fields writes the extension row in the same transaction: a create inserts it with the defaults of the other fields, an update inserts or changes it. The `version` of the target increases when only extension fields changed, so `If-Match` (API-13) covers the record as a whole; the audit entry and the outbox event of the target list the extension fields among those changed.
6. **Permissions.** The permission of the target covers the extension fields. An extension may give a field its own read and update permission, which becomes a field mask of the effective entity (AUTHZ-02). Tenant isolation is that of the target: the extension is read and written only through the target row that the caller may see.
7. **Not in this slice.** Filtering, sorting, searching and aggregating by an extension field (they need a join; a request that asks is `HTTP_FILTER_UNKNOWN`, 400), relation fields in an extension, an extension of an extension, and a target that has no `EntityDef` or no generated routes (`media`, `users.User`): their extra fields would need a hook in each hand-written route, which each of those plugins adds when it wants to be a target.
8. **Plugin graph.** An extending plugin lists the plugin of the target in `requires`, so that `bieberkit remove` of the target is refused while an extension exists (PLG-03), and the manifest `tables` lists the extension table, so the resolver sees a collision (`PLG_COLLISION_TABLE`) and `remove` of the extending plugin drops only its own table and lists it before it asks.

## Evidence

- The sibling-entity precedent: `translationOf` and `applyTranslations` in `packages/data/src/orm`.
- The manifest collectors and `tablesOf` of `remove`: `packages/server/src/manifest.ts`, `packages/cli/src/commands/plugin.ts`.
- The entity list is read in `boot.ts`, `migrations.ts`, `seed.ts`, `services.ts`, `cli/src/app.ts`, `commands/plugin.ts`, `scoped-permissions.ts` and in the test apps; each moves to `entitiesOf`.
- Tests (written before the code, `packages/data/src/schema/extend.test.ts`, `packages/testing/src/extends.dialects.test.ts`, `packages/server/src/manifest.test.ts`, `packages/cli/src/plugin.test.ts`): the table is made and the target has no new column; the fields appear in list, detail, create and update, in `_meta` and in OpenAPI; validation, field masks and tenant isolation hold; two plugins extend one target; removing the extending plugin drops one table and keeps the target rows; the three boot errors.

## Consequences

- **Easier.** A plugin adds fields to a base plugin without a fork, and the admin form and the API show them. The target plugin upgrades its own schema without a conflict.
- **Harder.** A page that has extensions costs one more query. The mapper has to split a row, so an unexpected field would fail at the ORM and not in the route; the tests pin the split.
- **Ruled out.** Columns of the target, a JSON column, and filters on extension fields in this slice.

## Spec changes

- 11.1: the example of `extends` becomes `extends: { 'pages.Page': PageSeo }`, with `PageSeo` made by `defineExtension`.
- 11.3 and PLG-06: the mechanism and its limits, as above.
- Document history.

## Follow-ups

- Filter and sort by an extension field, with the join and its index.
- Extension of hand-written targets (`media`, `users.User`) through a hook that each target publishes.
- A manifest key `extends`, so that the resolver can require the plugin of the target by itself.
