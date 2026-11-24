---
'@bieberkit/queue': minor
---

Add the `redis` queue driver on BullMQ and Valkey. `@bieberkit/queue/redis` gets `createRedisQueue` and `createQueueFromConfig` (the queue that `QUEUE_DRIVER` selects). It passes the same contract suite as the `sync` and `database` drivers: a queue and a worker of BullMQ for each of `critical`, `default` and `reports`, job ids that callers choose, retries with the backoff of the job, dead letters with `retry` and `discard`, jobs of a dead worker given to another, and the publisher of the outbox. `Queue.driver` can be `redis`.
