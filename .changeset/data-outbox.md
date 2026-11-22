---
'@bieberkit/data': minor
---

Add the outbox and the audit log under `@bieberkit/data/orm`: `emitEvent` and `recordAudit` write with the data of a unit of work, `createOutboxDispatcher` moves rows to a publisher with `SKIP LOCKED` batches, backoff for a failing row and one delete per row on MySQL, `processOnce` and `purgeProcessed` for the processed ids of subscribers, and `outboxLag`. The framework tables come as `dataMigrationSteps` (the plugin `@bieberkit/data`), the audit log is append-only through the unit of work, SQLite triggers and `grantAuditLog` for PostgreSQL and MySQL, and `createDatabase` takes `audit: 'table'` to write every use of `asSystem` to it.
