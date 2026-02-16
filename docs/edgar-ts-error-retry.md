# edgar-ts Error Handling and Retry Specification

**Date:** 2026-02-15  
**Status:** Approved

## Objectives
1. Provide predictable typed errors for orchestration systems.
2. Distinguish retryable and non-retryable conditions.
3. Centralize retry and timeout policy.

## Error Taxonomy
Base class:
```ts
class EdgarError extends Error {
  code: string;
  retryable: boolean;
  metadata?: Record<string, unknown>;
}
```

Subclasses:
1. `ConfigurationError` (`retryable: false`)
2. `ValidationError` (`retryable: false`)
3. `RateLimitError` (`retryable: true`)
4. `TimeoutError` (`retryable: true`)
5. `NetworkError` (`retryable: true`)
6. `Upstream5xxError` (`retryable: true`)
7. `Upstream4xxError` (`retryable: false`, except configurable `429` mapping)
8. `NotFoundError` (`retryable: false`)
9. `NormalizationError` (`retryable: false`)
10. `IntegrityError` (`retryable: false`)
11. `UnknownEdgarError` (`retryable` determined by conservative mapping, default false)

## Retry Policy
Defaults:
1. `maxAttempts = 3`
2. `baseDelayMs = 250`
3. `maxDelayMs = 4000`
4. full jitter exponential backoff

Formula:
`delay = random(0, min(maxDelayMs, baseDelayMs * 2^(attempt-1)))`

Retryable classes:
1. `RateLimitError`
2. `TimeoutError`
3. `NetworkError`
4. `Upstream5xxError`

Non-retryable classes:
1. `ConfigurationError`
2. `ValidationError`
3. `NotFoundError`
4. `NormalizationError`
5. `IntegrityError`
6. `Upstream4xxError` (except policy-defined retriable subset)

## Timeout and Cancellation
1. Every request uses abortable timeout via `AbortSignal`.
2. Timeout triggers `TimeoutError`.
3. Caller-provided abort signal takes precedence and emits cancellation-aware error metadata.

## Rate-Limit Interaction
1. Rate cap is enforced before outbound calls.
2. Received upstream 429 responses are mapped to `RateLimitError` and retried per policy.
3. Retry path still respects local limiter.

## Error Metadata Requirements
Common metadata keys:
1. `operation` (method name)
2. `url` (when available)
3. `attempt` and `maxAttempts`
4. `statusCode` (if HTTP)
5. `cik`, `accessionNo`, `sequence` when relevant

## Partial Failure Semantics
1. Single-operation methods reject entirely on failure.
2. No silent fallback to partial data in v1.
3. Future batch APIs may adopt per-item results; not in current scope.

## Logging and Telemetry Rules
1. Emit retry events with attempt count and cause code.
2. Emit terminal failure events with typed code and metadata.
3. Do not log raw response bodies by default.

## Caller Guidance
1. Retry only when `error.retryable === true` if wrapping outside client.
2. Route non-retryable failures to dead-letter or manual investigation.
3. Record error metadata for audit and diagnostics.

## Test Requirements
1. Retry matrix test per retryable class.
2. Non-retry test per non-retryable class.
3. Timeout and abort behavior tests.
4. Metadata presence assertions on representative failures.
