---
'@bieberkit/auth': minor
'@bieberkit/cache': minor
---

Settle the leftovers of M1.4. `createAuth` takes `secondaryStorage`, and `@bieberkit/cache/bentocache` gets `redisSecondaryStorage` (sessions on Valkey, with the database still holding every session). `@bieberkit/auth` gets `checkScopedPermissions` and `explainCondition` (the build-time rule of AUTHZ-06) and `recordImpersonationStart` and `recordImpersonationEnd` (the audit of AUTHZ-05). The organization plugin of Better Auth is not loaded (ADR 0021).
