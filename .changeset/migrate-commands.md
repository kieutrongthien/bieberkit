---
'bieberkit': minor
'@bieberkit/data': minor
'@bieberkit/server': minor
---

Add the migrate commands and `build`. `bieberkit migrate:make [name]` writes a migration from the entities and the snapshot, `bieberkit migrate` runs the steps of the plugins and then the files of the project under one lock (`--status`, `--rollback`, `--allow-destructive`), and `bieberkit build` regenerates, checks the types and emits the standalone validators and serializers. `@bieberkit/data` gets the migration lock (`withMigrationLock`, `DATA_MIGRATE_LOCKED`), `Migrator.pluginStatus`, the subpath `@bieberkit/data/migration` that the migration files import, and the module key `migrations` for the steps of a plugin. `@bieberkit/server` gets `makeMigration`, `runMigrations`, `rollbackMigration`, `migrationStatus` and `contributedRecord`, and the migrate role runs them in production. `check` gets the rules `plugin-steps` and `scoped-permissions`. A fix: the scoped permissions of a module were not given to the authorizer of the web role.
