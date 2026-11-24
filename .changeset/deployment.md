---
'create-bieberkit': minor
'bieberkit': minor
---

Add the deployment files to a new project (ADR 0026): `Dockerfile`, `.dockerignore`, `compose.prod.yaml` with the proxy, the four roles, the database, the two Valkeys, the backup and its upload, `.env.production.example`, and `deploy/` with the Caddyfile and the backup scripts. Add `bieberkit backup:verify`, which restores the newest dump into a throwaway database and checks that nothing is left to migrate. The repository gets `pnpm bench`, a k6 run of the reference endpoints.
