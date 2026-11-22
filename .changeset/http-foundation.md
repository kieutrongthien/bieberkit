---
'@bieberkit/http': minor
'@bieberkit/data': minor
---

Add the HTTP server of `@bieberkit/http`: `createHttpServer` on Fastify 5 with the 12 stages of a request in a fixed order and four named hook stages for plugins (`afterAuth`, `beforeHandler`, `afterHandler`, `onResponse`), ports for authentication, tenant resolution, authorization and rate limits, RFC 9457 problems with `code` and `traceId`, request ids and W3C trace context, routes that must declare a response schema and a permission or `public: true`, a 1 MiB body limit and the timeouts of the spec, the health endpoints, and the graceful shutdown with `registerHttp` for the lifecycle. `@bieberkit/data/build` exports `issuesOf`, which turns the errors of an Ajv validator into issues with a dotted path.
