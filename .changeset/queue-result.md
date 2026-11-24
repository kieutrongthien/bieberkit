---
'@bieberkit/queue': minor
---

Keep the result of a job. A handler may return JSON, which is stored with the job (migration step `jobs-result`, version 0.2.0: a new column `result`, `MEDIUMTEXT` on MySQL), and `queue.status(jobId)` answers where a job is, its result, its error, and the tenant and user that dispatched it. A result that is not JSON or is over 1 MiB is not kept and the job is still done. The contract suite gets a tenth case.
