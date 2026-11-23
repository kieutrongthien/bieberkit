---
'@bieberkit/auth': minor
'@bieberkit/data': minor
'@bieberkit/http': minor
---

Add authentication. `@bieberkit/auth` gets Better Auth 1.7.25 on the Kysely of the request (`createAuth`, the five auth tables as migration steps 0.2.0), `registerAuthRoutes` (one transaction for each change, with its audit entry and outbox event, and the counters of the limits kept when a request fails), the limits per address and per account on sign in, sign up and password reset, `createAuthenticator` (the cookie `__Host-bk_session` to a principal), `createTenantResolver` (`X-Tenant` checked against the roles of the user) and the drift check `checkAuthDrift`. `@bieberkit/data` gets `requestKysely`, `runInTransaction` and `applyPluginMigrations`. `@bieberkit/http` gets `HttpServer.mount`, which hands a prefix to a web handler with the client IP that `TRUST_PROXY` resolved.
