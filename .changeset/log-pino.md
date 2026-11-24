---
'@bieberkit/log': minor
'@bieberkit/core': minor
---

Add `@bieberkit/log`: the logger port under one import, `@bieberkit/log/pino` (`createPinoLogger`, the same line and the same redaction as the default logger) and `@bieberkit/log/testing` with `loggerContractSuite`, which the default logger and the pino adapter both pass. `@bieberkit/core` exports `createLogSanitizer` and `RESERVED_LOG_FIELDS`.
