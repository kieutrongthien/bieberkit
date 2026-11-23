---
'@bieberkit/cache': minor
---

Add the checks of `bieberkit doctor` on the instances of Valkey (Q-08). `@bieberkit/cache/bentocache` gets `checkRedisInstances`: the queue needs `noeviction`, the cache needs an evicting policy and a memory limit, and the two must not be one server. A finding never shows a user or a password.
