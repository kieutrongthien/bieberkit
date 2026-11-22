---
'@bieberkit/http': minor
---

Add the transition routes `POST /<resource>/:id/actions/<transition>` and the bulk route `POST /<resource>/bulk` (update, delete and transition for up to 100 rows, each with its version, and a result for each row) to the entity routes. Routes can be `idempotent: true` and honor `Idempotency-Key` through a store (`createMemoryIdempotencyStore` by default), can be `deprecated` with `Deprecation`, `Sunset` and `Link` headers, and public GET routes can send `cache` headers with tags. A handler can ask `ctx.can(permission)`. The create route of every entity is idempotent.
