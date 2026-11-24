---
'@bieberkit/admin-core': minor
'@bieberkit/admin-antd': minor
'@bieberkit/http': minor
'@bieberkit/server': minor
'create-bieberkit': minor
---

Add the first slice of the admin (ADR 0025). `@bieberkit/admin-core` is the headless client of the API (session, metadata, list, get, create, update, delete, the problems of RFC 9457 as one error) and the functions that turn the metadata of an entity into its columns and form. `@bieberkit/admin-antd` is the application: login, the menu of the entities that the user may read, the generic list and the generic form, built to static files with Vite. `@bieberkit/http` gets `serveStatic`, and the web role serves the admin under `/admin/` with its own Content-Security-Policy when the adapter is installed, and serves the metadata at `/api/v1/_meta`. A project made by `create` depends on the adapter. The mounted handlers of the server send their body as bytes.
