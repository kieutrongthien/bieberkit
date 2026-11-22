---
'@bieberkit/data': minor
---

Add `@bieberkit/data/build` and `@bieberkit/data/runtime`: `emitStandalone` and `writeStandalone` emit the Ajv validators and the fast-json-stringify serializers of the entities as standalone modules with a reproducible hash, and `loadStandalone` loads them without compiling a schema. `validate` normalizes to NFC and returns the issues with their path and rule, `serialize` writes only the fields of the read schema, and `assertCurrent` refuses a build that does not match the entities. The generated code asks only for `@bieberkit/data/runtime`.
