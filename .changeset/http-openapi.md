---
'@bieberkit/http': minor
---

Add the OpenAPI 3.1 document and the metadata contract: `openApiDocument` and `registerOpenApi` serve `/api/v1/openapi.json` (public outside production and with `API_DOCS_PUBLIC`, and for the permission `system.api-docs` otherwise), and `registerMeta` serves `/api/v1/_meta` with the entities, fields, transitions, layouts and permissions that the caller may see, an ETag, and the published JSON Schema `META_SCHEMA`. The server gets `routes()` and `docsPublic`, a route can say `requiresIfMatch`, and `HttpEnv` has `API_DOCS_PUBLIC`.
