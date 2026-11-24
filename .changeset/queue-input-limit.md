---
'@bieberkit/queue': minor
---

Limit the input of a job to 1 MiB as JSON on every driver (`QUEUE_INPUT_TOO_LARGE`, 413), and make the column `input` a `MEDIUMTEXT` on MySQL (migration step `jobs-input-wide`, version 0.2.0), where `TEXT` held only 64 KB.
