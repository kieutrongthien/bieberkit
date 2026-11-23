---
'@bieberkit/queue': minor
---

Add the wake of a worker by `LISTEN/NOTIFY` on PostgreSQL. A job that is added sends `pg_notify` in the transaction of the insert, so it is announced at the commit. `WorkerOptions` gets `wake` (a `WakeSource`), and `@bieberkit/queue/postgres` gets `pgWakeSource`, which holds one connection, connects again when it is lost and never stops the worker. The poll stays as the fallback.
