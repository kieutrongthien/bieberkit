---
'@bieberkit/data': minor
---

Add `listPage` with the page size limit, the keyset cursor, the total on request, the index rule and filters on compared fields, read as plain objects with one query per relation. Add translations for localized fields (`setTranslation`, the `Translation` schema that `compileEntities` adds, and reading with a locale and a fallback), the mappers `toApiRow` and `toOrmData`, the `orm.uniques` override, and the `queryLog` option of `createDatabase`.
