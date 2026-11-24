---
'@bieberkit/plugin-users': minor
'@bieberkit/plugin-roles': minor
'@bieberkit/plugin-settings': minor
'@bieberkit/plugin-audit-log': minor
'@bieberkit/plugin-notifications': minor
'@bieberkit/plugin-media': minor
'create-bieberkit': minor
'@bieberkit/server': minor
'@bieberkit/testing': minor
'@bieberkit/http': minor
'@bieberkit/core': minor
'@bieberkit/data': minor
'@bieberkit/auth': minor
'@bieberkit/storage': minor
---

Add the base plugins of the blank template: `users` (list, create, and the administrator of the seed), `roles` (roles, permissions, assignment, and the base roles `admin` and `staff`), `settings`, `audit-log` (a read-only list with filters and a cursor), `notifications` (with read-own and update-own) and `media` (a signed upload URL and a confirmation that checks the bytes). The server registers the services `config`, `pluginEnv`, `database`, `auth`, `permissions` and `storage` for every role, and a route handler reads them from `ctx.services`; `createTestApp` registers the same ones, and `app.disk` and `app.services`. The web role serves Better Auth under `/api/auth`, with the session cookie as the principal. `create` lists the base plugins in the blank template and writes a random value for any plugin key that ends in `_PASSWORD`, `_SECRET`, `_TOKEN` or `_KEY`. The manifests of plugins now list their tables and routes, so collisions are found before boot.
