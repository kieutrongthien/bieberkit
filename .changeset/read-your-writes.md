---
'@bieberkit/data': minor
'@bieberkit/cache': minor
---

Add read your own writes (DATA-13). With read replicas, the lists and counts of a user who wrote in the last 5 seconds are read from the primary. `@bieberkit/data/orm` gets `ReadYourWrites`, `createMemoryReadYourWrites`, `useReadYourWrites` and `READ_YOUR_WRITES_MS`, and records the user after each commit. `@bieberkit/cache` gets `createCacheReadYourWrites`, which keeps it in the strongly consistent keys of the cache so that every process sees it. A store that fails never fails a write, and a read that cannot be answered goes to the primary.
