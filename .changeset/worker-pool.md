---
'@bieberkit/queue': minor
---

Add the pool of worker threads for CPU-heavy work (Q-09). `createWorkerPool` runs a task, a module that is named by a URL or an absolute path, on a `worker_threads` thread, with a size, a queue, idle threads that end, a timeout, a limit of memory, an `AbortSignal` and `close`. A task that hangs, crashes or uses too much memory costs its thread and no more, and the call fails with `QUEUE_TASK_TIMEOUT`, `QUEUE_TASK_CRASHED` or `QUEUE_TASK_FAILED`.
