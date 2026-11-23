---
'@bieberkit/cache': minor
'@bieberkit/data': minor
'@bieberkit/http': minor
---

Add the cache. `@bieberkit/cache` gets `createCache` (`get`, `set`, `has`, `forget`, `remember` with a stampede lock across processes, `tags` with generations, `lock`, `atomic`, and the `tenant` view), a memory engine, `createLayeredEngine` (a first level of 5 seconds in front of a shared one), `createCacheIdempotencyStore` for the shared `Idempotency-Key` store, `@bieberkit/cache/bentocache` (the `file` and `redis` engines, `createCacheFromConfig` and `checkEvictionPolicy`) and `@bieberkit/cache/testing` with the engine suite. `@bieberkit/data` gets `afterCommit`. `@bieberkit/http` exports `IdempotencyStore`, `StoredResponse` and `createMemoryIdempotencyStore`.
