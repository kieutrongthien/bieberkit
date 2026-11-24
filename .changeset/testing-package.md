---
'@bieberkit/testing': minor
'@bieberkit/data': minor
'@bieberkit/http': minor
---

Add `@bieberkit/testing`: `createTestApp({ modules })` boots the entities, routes, jobs and conditions of modules over a real database with the real authorizer, `actingAs(user, roles)` and `withTenant(tenant)` call the API as a user with roles in a tenant, `factory(entity)` makes valid rows, `describeEntityContracts` generates the validation and pagination tests of every entity, `describeDialects` runs a suite on every dialect, and `installNetworkGuard` makes a test that connects outside the machine fail. `@bieberkit/data` adds the module contribution `entities`. `@bieberkit/http` adds the module contribution `routes` and exports `entityPath`.
