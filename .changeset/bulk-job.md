---
'@bieberkit/http': minor
---

Run the bulk calls of 101 to 500 rows as a job (API-14, PERF-05). `createBulkJob` gives the job `http.bulk` and the port for `registerEntityRoutes({ bulk })`; the bulk route then answers `202` with the id of the job and its `Location`, and the job runs as the principal that sent the call and asks the authorizer again. `registerJobRoutes` adds `GET /api/v1/_jobs/:id`, where the user and the tenant that sent a job read its state and its result. `authorizationFor` is the helper of the three questions to the authorizer, used by the server and by the job. The bulk route is now `idempotent`.
