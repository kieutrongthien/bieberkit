---
'@bieberkit/queue': minor
'@bieberkit/data': minor
---

Add the queue. `@bieberkit/queue` gets `defineJob`, `createQueue` with the `sync` and `database` drivers (jobs in `bk_jobs`, claimed with `SKIP LOCKED`, with a lease, retries with backoff and a dead-letter list), the worker with its own slots for each queue, the glue that moves an outbox row into the queue in one transaction, the scheduler with its lock and cron expressions, the context of the dispatching code that a job restores (Q-10), and `@bieberkit/queue/testing` with the contract suite that every driver passes. `@bieberkit/data` gets `rawKysely` and exports `retryOnDeadlock`.
