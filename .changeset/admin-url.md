---
'@bieberkit/core': minor
'@bieberkit/http': minor
'@bieberkit/server': minor
'@bieberkit/admin-antd': minor
'create-bieberkit': minor
---

The address of the admin is a setting: `ADMIN_URL` is a path of the application (`https://example.com/panel`), the root of a host of its own (`https://admin.example.com`), or a path of that host, and `/admin` when it is not set. The build no longer knows the address: the server writes it in the page. `@bieberkit/http` gets `server.fallback` and `serveStatic` takes a `host`, an empty `prefix` and a `transformPage`. The sign in trusts the origin of the admin, and the generated Caddyfile and `.env.production.example` know the host of the admin.
