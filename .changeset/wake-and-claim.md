---
'@bieberkit/data': minor
'@bieberkit/queue': patch
---

Keep a wake. `@bieberkit/data/orm` gets `createWakeSignal`, a sleep that a wake ends and that remembers a wake that came while nobody slept; the outbox dispatcher and the loops of the queue worker use it, so a hint that arrives in the middle of a batch or a claim is not lost. The claim of the queue worker is READ COMMITTED on MySQL, so the claims of two queues no longer lock each other's rows.
