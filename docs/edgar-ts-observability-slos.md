# edgar-ts Observability and SLO Plan

**Date:** 2026-02-15  
**Status:** Approved

## Objectives
1. Make request behavior and failures auditable.
2. Detect regressions in reliability and compliance quickly.
3. Provide actionable signals for runtime differences.

## Telemetry Events
1. `request.start`
2. `request.end`
3. `request.retry`
4. `request.rate_limited`
5. `request.failed`
6. `operation.completed`

## Required Event Fields
1. `operation`
2. `requestId`
3. `method`
4. `endpointClass`
5. `attempt`
6. `durationMs`
7. `statusCode` (if HTTP)
8. `errorCode` (if failed)
9. `runtime` (`node` or `bun`)

## Metrics
1. `edgar_requests_total` (counter)
2. `edgar_request_failures_total` (counter by error code)
3. `edgar_request_retries_total` (counter)
4. `edgar_rate_limit_wait_ms` (histogram)
5. `edgar_operation_latency_ms` (histogram by operation)
6. `edgar_discovered_filings_count` (histogram)
7. `edgar_listed_exhibits_count` (histogram)
8. `edgar_contract_exhibits_count` (histogram)
9. `edgar_download_bytes` (histogram)

## Initial SLO Targets
1. `SLO-001`: Successful operation ratio >= 99.0% over rolling 7 days.
2. `SLO-002`: `discoverFilings` p95 latency <= 3s on fixture-backed integration environment.
3. `SLO-003`: `downloadExhibit` p95 latency <= 5s for representative fixture payload sizes.
4. `SLO-004`: Rate-cap violation count = 0.
5. `SLO-005`: Runtime parity failures = 0 on release branches.

## Alerting Thresholds
1. Error ratio > 2% for 15 minutes.
2. Retry rate > 20% for 15 minutes.
3. Timeout errors exceed 50 in 10 minutes.
4. Any detected rate-cap violation.
5. Node/Bun parity regression in CI.

## Debug Playbook
1. High 429 frequency:
- confirm configured cap
- inspect retry/backoff behavior
- verify user-agent validity
2. High normalization failures:
- inspect fixture drift
- add defensive normalization case
- classify as data-shape error if unrecoverable
3. Timeout spikes:
- verify endpoint latency changes
- inspect network health
- tune timeout and retry only if safe
4. Runtime-specific failures:
- compare failing tests by runtime
- isolate API assumptions not portable between Node/Bun

## Logging Policy
1. Log structured events only.
2. Avoid raw body logging by default.
3. Include correlation IDs for all failure events.

## Operational Readiness Checklist
1. Telemetry hooks documented and demonstrated in examples.
2. Metrics emitted for each public operation.
3. Alert definitions checked into ops documentation.
4. Runbook includes owner and escalation path.
