---
'@bieberkit/core': minor
'@bieberkit/data': minor
'@bieberkit/http': minor
'@bieberkit/queue': minor
'@bieberkit/cache': minor
---

Add traces and metrics without an SDK (ADR 0023). `@bieberkit/core` gets the tracer (`createTracer`, `createOtlpExporter` and `createTracerFromConfig` for OTLP over HTTP, `parseTraceparent`, `formatTraceparent`), the metrics registry with the Prometheus text format (`createMetrics`, `registerProcessMetrics`) and `startMetricsServer` for `METRICS_PORT`. `@bieberkit/http` takes `tracer` and `metrics`: a span and `bk_http_request_duration_seconds` for each request. `@bieberkit/data` takes `tracer` and `metrics` (a span for each query of the ORM, `bk_db_pool_connections`), and the outbox keeps the `traceparent` of the event (step 0.4.0). `@bieberkit/queue` takes `tracer` and `metrics`: a span for each dispatch and delivery, the trace carried in the job (step 0.3.0), `bk_job_duration_seconds` and `bk_queue_jobs`. `@bieberkit/cache` takes `tracer` and `metrics`: a span for each call and `bk_cache_lookups_total`.
