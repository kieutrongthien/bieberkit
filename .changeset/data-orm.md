---
'@bieberkit/data': minor
---

Add `compileEntities`, which turns entity definitions into MikroORM schemas with the standard columns, constraints, composite tenant foreign keys, soft delete and shadow columns, and the tenant model: a tenant filter that cannot be switched off outside the audited `db.asSystem`, `runAsTenant`, the tenant of every write, and the check that every referenced id is visible. Also `expectVersion` and the 412 on a stale write, `softDelete`, `restore`, `bulkInsert` and `bulkUpdate`.
