<!--
  BieberKit

  @file        docs/adr/0023-observability-without-an-sdk.md
  @description ADR 0023: traces and metrics are written in core on Node.js built-ins (OTLP over HTTP and the Prometheus text format), with no OpenTelemetry SDK and no metrics library.
  @author      Bieber Kieu <kieutrongthien@gmail.com>
  @copyright   Copyright (c) 2026 Bieber Kieu
  @license     Apache-2.0

  Licensed under the Apache License, Version 2.0 (the "License");
  you may not use this file except in compliance with the License.
  You may obtain a copy of the License at

      http://www.apache.org/licenses/LICENSE-2.0

  Unless required by applicable law or agreed to in writing, software
  distributed under the License is distributed on an "AS IS" BASIS,
  WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
  See the License for the specific language governing permissions and
  limitations under the License.

  SPDX-License-Identifier: Apache-2.0
-->

# 0023. Traces and metrics without an SDK

- Status: Accepted
- Accepted: 2026-11-24, by delegation: the maintainer asked the engineer to settle every open decision, and the evidence below favours one option.
- Date: 2026-11-24
- Deciders: Bieber Kieu
- Requirements: OBS-02, OBS-03, OBS-04, PKG-04, P9, SEC-09

## Context

OBS-02 wants traces over HTTP, database queries, cache calls, queue dispatch and job execution, with the trace carried into the jobs. OBS-03 wants metrics, and OBS-04 wants them on a port that is never public. `OTEL_EXPORTER_OTLP_ENDPOINT` and `METRICS_PORT` are in the config already. ADR 0003 left "whether `@opentelemetry/instrumentation-pino` fits" to this decision.

`@bieberkit/core` has no runtime dependency (PKG-04), and the code that must create spans (`data`, `cache`, `queue`, `http`) all sit above it. OBS-06 settled the same question for errors: a Sentry-compatible server is reached with no SDK.

## Options

| Option                                                                                          | For                                                                                                                    | Against                                                                                                                                                                                                                              |
| ----------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| A. The OpenTelemetry SDK (`@opentelemetry/api`, `sdk-trace-node`, OTLP exporter, `prom-client`) | The standard libraries, and their automatic instrumentation                                                            | About 30 packages in the tree for a few spans. Core cannot use them (PKG-04), so a port is needed anyway. Automatic instrumentation of `pg`, `ioredis` and Fastify wraps our own code twice and records statements and URLs (SEC-09) |
| B. A tracer and a metrics registry in core on Node.js built-ins                                 | No dependency. Spans only where the framework decides, with ids and names and never a body. One port for every package | We write and keep the OTLP JSON shape and the Prometheus text format. No automatic instrumentation of libraries that we do not call through our contracts                                                                            |
| C. Only the port in core, and the SDK as an adapter package                                     | Standard exporter for those who want it                                                                                | A package and about 30 dependencies for what B does in 600 lines. A second way to do it (P1)                                                                                                                                         |

## Decision

Option B. Core gets:

- a `Tracer` port, a no-op default, an exporter that posts OTLP over HTTP as JSON to `OTEL_EXPORTER_OTLP_ENDPOINT` (batched, bounded, never blocking and never throwing), W3C `traceparent` parse and format, and a memory exporter for tests;
- a `Metrics` registry with counters, gauges, histograms and collectors, the Prometheus text format, and a small server on `METRICS_PORT` that answers `GET /metrics` and nothing else.

Spans carry names, kinds, ids, the status and a few attributes that are ids or counts (`http.route`, `db.system`, `bk.job.name`). They never carry a query text, a parameter, a URL with its query string, a header, a body or an error message: an error is its class and its code. Tracing is off when the endpoint is empty. The metrics server refuses a request that has a `Forwarded` or `X-Forwarded-*` header, because only a proxy sets one, which gives OBS-04 a second line of defence besides not publishing the port.

## Evidence

- OTLP/HTTP with JSON encoding is part of the OTLP specification and accepted by the OpenTelemetry Collector, Jaeger, Tempo and the hosted back ends.
- The Prometheus text exposition format 0.0.4 is a line format with `# HELP`, `# TYPE` and samples.
- `@opentelemetry/api` 1.x alone is small, but without an SDK it records nothing, so it does not remove the exporter.

## Consequences

- Easier: no new dependency, one tracer for every package, and spans that cannot leak data because there is no hook that collects it.
- Harder: the project owns the encoding. Contract tests pin the OTLP shape against the specification fields, and the Collector is the check on a real run.
- Ruled out: automatic instrumentation of third-party libraries, `@opentelemetry/*` and `prom-client` in the tree.

## Spec changes

- Section 20: OBS-02 to OBS-04 say "without an SDK" and name the guard on forwarded requests.

## Follow-ups

- The kernel builds the tracer and the metrics server from the config (M1.8, with the CLI). `OTEL_EXPORTER_OTLP_HEADERS` is not read yet: the hosted back ends that need a key come with a later config key.
