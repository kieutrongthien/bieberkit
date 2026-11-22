---
'@bieberkit/auth': minor
'@bieberkit/data': minor
'@bieberkit/http': minor
---

Add authorization. `@bieberkit/auth` gets the permission registry, the CASL ability of one request with default deny, the condition language that fails closed, roles as data per tenant (`authMigrationSteps`, `loadGrants`), the authorizer of the HTTP server with the audit of a denial, and `@bieberkit/auth/testing` with the generated permission matrix and the six mutants that check it. `@bieberkit/data` gets `scope` on `listPage` and `aggregate`, `findScoped`, `findAllScoped` and `applyPluginMigrations`. `@bieberkit/http` gets `Authorizer.access` and `Authorizer.allows`, `ctx.access` and `ctx.allows`, the rows and fields of an entity limited by them (404 outside the scope, 403 for a write that leaves it or touches a masked field), and `status`, `code` and `details` in the `onResponse` hook.
