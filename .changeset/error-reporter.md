---
'@bieberkit/core': minor
'@bieberkit/http': minor
'@bieberkit/queue': minor
---

Add the error reporter (OBS-06). `@bieberkit/core` gets the `ErrorReporter` port, `reportError`, a no-op, a memory and a composite reporter, `createSentryReporter` (Sentry, GlitchTip and Bugsink through the envelope endpoint, with no SDK, sampling, a budget per minute and a pause on 429), `createErrorReporterFromConfig`, `installProcessHandlers`, and the variables `ERROR_REPORTER_DSN` and `ERROR_REPORTER_SAMPLE_PERCENT`. `@bieberkit/http` replaces the `onError` option of the server with `errorReporter`. `@bieberkit/queue` gets the `errorReporter` option of `createQueue`, which receives a job that failed for good.
