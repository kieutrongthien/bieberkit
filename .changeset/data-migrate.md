---
'@bieberkit/data': minor
---

Add migrations under `@bieberkit/data/orm`: `openMigrator` (snapshot diff per dialect over `@mikro-orm/migrations`, `make`, `up`, `down`, `status`, connecting with `MIGRATE_DATABASE_URL` only), the refusal of destructive statements unless `allowDestructive`, and `runPluginMigrations` for plugin steps with the `bieberkit_plugin_migrations` ledger, the same deploy guard for contract steps, and SQLite rebuilds with foreign keys off. Add the helpers `uuidType` and `setNotNull`, and, in the root export, `detectDestructive`, `upStatementsOfMigration`, `migrationFileName` and the step functions `orderSteps`, `validateSteps` and `findStepRisks`.
