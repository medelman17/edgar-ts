---
phase: 01-http-transport-rate-limiting
plan: 02
subsystem: http
tags: [retry, exponential-backoff, full-jitter, error-classification, retryability]
dependency-graph:
  requires: [errors, types]
  provides: [calculateBackoffMs, classifyResponseError]
  affects: []
tech-stack:
  added: [exponential-backoff-full-jitter, error-classification]
  patterns: [aws-retry-best-practice, uniform-jitter-distribution, http-status-mapping]
key-files:
  created:
    - src/http/retry.ts
    - src/http/error-mapper.ts
    - tests/http/retry.test.ts
    - tests/http/error-mapper.test.ts
  modified:
    - src/http/index.ts
decisions:
  - Full jitter formula (AWS best practice) prevents thundering herd problem
  - Exponential backoff capped at maxDelayMs to bound worst-case delay
  - 5xx/429/408 classified as retryable; 404/4xx as non-retryable
  - Error metadata always includes statusCode and url for observability
metrics:
  duration: 185s
  tasks-completed: 2
  files-created: 4
  files-modified: 1
  test-coverage: 40 tests passing (16 retry + 24 error-mapper)
  commits: 2
completed: 2026-02-16T02:50:30Z
---

# Phase 01 Plan 02: Retry Policy & Error Classification Summary

**One-liner:** Exponential backoff with full jitter (AWS best practice) and HTTP status → typed error classification with retryability flags

## Objective

Build retry policy and error classification engines as isolated, testable modules ready for SecHttpClient integration.

## What Was Built

### 1. Exponential Backoff with Full Jitter (`src/http/retry.ts`)

**Implementation:**
- `calculateBackoffMs(attempt, policy)` function with AWS best practice full jitter
- Exponential cap: `baseDelayMs * 2^attempt`, capped at `maxDelayMs`
- Full jitter: uniformly distributed delay in `[0, min(maxDelayMs, exponentialCap)]`
- Prevents synchronized retry spikes across concurrent clients (thundering herd problem)

**Formula:**
```typescript
exponentialCap = baseDelayMs * 2^attempt
maxJitter = min(maxDelayMs, exponentialCap)
delay = floor(random(0, maxJitter))
```

**Examples (default policy: base=250ms, max=4000ms):**
- Attempt 0: random(0, 250ms)
- Attempt 1: random(0, 500ms)
- Attempt 2: random(0, 1000ms)
- Attempt 3: random(0, 2000ms)
- Attempt 4+: random(0, 4000ms) — capped

**Key Features:**
- Uniform distribution ensures no convergence (verified with variance tests)
- Validates attempt bounds: `0 <= attempt < maxAttempts`
- Returns integer milliseconds (no fractional delays)
- Zero external dependencies (uses built-in `Math.random()`)

**Tests:** 16 passing
- Validation: negative/out-of-bounds attempts throw
- Exponential formula: delays within expected ranges for each attempt
- Max delay ceiling: high attempts capped at maxDelayMs
- Jitter distribution: 100 samples per attempt show high variance (no convergence)
- Concurrent clients: 10 clients get different delays (no synchronization)
- Custom policy: respects non-default baseDelayMs/maxDelayMs
- Edge cases: baseDelayMs === maxDelayMs, very low maxAttempts, integer output

### 2. HTTP Status → Typed Error Mapper (`src/http/error-mapper.ts`)

**Implementation:**
- `classifyResponseError(statusCode, url)` function mapping HTTP status to typed errors
- All errors include `{ statusCode, url }` metadata for observability
- Correct retryability flags enable orchestrator-level retry decisions

**Mapping Rules:**

| Status Code Range | Error Type | Retryable | Rationale |
|------------------|------------|-----------|-----------|
| 500-599 (5xx) | TransportError | ✓ | Server errors (transient failures) |
| 429 | RateLimitedError | ✓ | External rate limiting (always worth retrying) |
| 408 | TimeoutError | ✓ | Server timeout (not client-side timeout) |
| 404 | NotFoundError | ✗ | Resource does not exist (permanent condition) |
| 400-403, 405-499 | TransportError | ✗ | Client errors (malformed request, auth issues) |
| Other (1xx, 2xx, 3xx, 6xx+) | TransportError | ✗ | Unexpected status codes |

**Tests:** 24 passing
- 5xx errors: all classified as retryable TransportError
- 429 rate limiting: RateLimitedError with retryable=true
- 408 timeout: TimeoutError with retryable=true
- 404 not found: NotFoundError with retryable=false
- Other 4xx: non-retryable TransportError
- Unexpected codes: non-retryable TransportError
- Metadata preservation: all errors include statusCode and url
- Error code assignment: correct EdgarErrorCode for each type
- Comprehensive coverage: all common HTTP status codes tested

## Deviations from Plan

None - plan executed exactly as written.

## Verification Results

**Code quality:**
- ✓ `pnpm typecheck` passes
- ✓ `pnpm lint` passes (3 pre-existing warnings in other files)
- ✓ `pnpm test tests/http/` passes (67/67 tests — 16 retry + 24 error-mapper + 27 from Plan 01)
- ✓ No `any` types - all exports have explicit type annotations
- ✓ Path alias `@/` used throughout

**Retry policy behavior:**
- ✓ Exponential backoff formula correct: base * 2^attempt
- ✓ Full jitter applied: random(0, min(max, exponential))
- ✓ 100 delays per attempt have high variance (no convergence)
- ✓ Attempt bounds enforced: attempt >= maxAttempts throws
- ✓ Integer milliseconds returned (no fractional values)

**Error classification behavior:**
- ✓ 5xx status codes → retryable TransportError
- ✓ 429 → RateLimitedError (retryable=true)
- ✓ 408 → TimeoutError (retryable=true)
- ✓ 404 → NotFoundError (retryable=false)
- ✓ Other 4xx → non-retryable TransportError
- ✓ Metadata always present (statusCode, url)
- ✓ Correct error codes assigned (TRANSPORT_ERROR, RATE_LIMITED, TIMEOUT, NOT_FOUND)

## Technical Decisions

### Decision 1: Full Jitter vs Linear/Exponential Backoff

**Context:** Need retry delays that prevent synchronized spikes across concurrent clients.

**Options:**
1. Linear backoff (`delay = baseDelay * attempt`) — predictable, but clients synchronize
2. Exponential backoff (`delay = baseDelay * 2^attempt`) — grows faster, still synchronized
3. Exponential with decorrelated jitter (`delay = random(baseDelay, prevDelay * 3)`) — complex state
4. Exponential with full jitter (`delay = random(0, min(max, base * 2^attempt))`) — AWS best practice

**Choice:** Full jitter (Option 4)

**Rationale:**
- AWS-proven pattern (documented in "Exponential Backoff and Jitter" article)
- Uniformly distributed delays prevent thundering herd problem
- Simpler than decorrelated jitter (no state tracking)
- Variance tests prove non-convergence (100 samples per attempt)
- Zero external dependencies (uses `Math.random()`)

### Decision 2: Validate Attempt Bounds in calculateBackoffMs

**Context:** Function receives retry attempt number from caller.

**Options:**
1. No validation — trust caller (risk of incorrect delays)
2. Clamp invalid attempts — silent correction (hides bugs)
3. Throw on invalid attempts — fail fast (caller bug detection)

**Choice:** Throw on invalid attempts (Option 3)

**Rationale:**
- Fail-fast design catches caller bugs immediately
- Negative attempts indicate logic error (should never happen)
- Attempts >= maxAttempts indicate retry loop bug (should stop earlier)
- Tests verify error messages provide clear diagnostics

### Decision 3: HTTP Status Code Classification Rules

**Context:** Need to map HTTP status codes to retryable/non-retryable errors.

**Options:**
1. Conservative (only 503 retryable) — misses transient failures
2. Aggressive (all 4xx/5xx retryable) — wastes retries on permanent errors
3. Spec-based (5xx/429/408 retryable, 404/4xx non-retryable) — follows HTTP semantics

**Choice:** Spec-based classification (Option 3)

**Rationale:**
- Aligns with HTTP specification semantics:
  - 5xx = server error (transient, worth retrying)
  - 429 = rate limited (external throttling, always retry after backoff)
  - 408 = server timeout (transient, not client-side timeout)
  - 404 = not found (permanent, filing/exhibit does not exist)
  - Other 4xx = client error (malformed request, won't fix with retry)
- Maximizes retry efficiency (retries only when likely to succeed)
- Matches SEC EDGAR behavior patterns from research

### Decision 4: Include statusCode and url in All Error Metadata

**Context:** Errors need context for debugging and observability.

**Options:**
1. Message only — loses structured data
2. statusCode only — missing request context
3. Both statusCode and url — full observability

**Choice:** Both statusCode and url (Option 3)

**Rationale:**
- Enables telemetry hooks to log/track specific error patterns
- Debugging: URL identifies which filing/exhibit failed
- Observability: statusCode enables retry/error rate dashboards
- Minimal overhead (two primitives per error)

## Files Created

| File | Purpose | Lines | Exports |
|------|---------|-------|---------|
| `src/http/retry.ts` | Exponential backoff with full jitter | 47 | calculateBackoffMs |
| `src/http/error-mapper.ts` | HTTP status → typed error classification | 68 | classifyResponseError |
| `tests/http/retry.test.ts` | Retry policy unit tests | 202 | - |
| `tests/http/error-mapper.test.ts` | Error classification tests | 242 | - |

**Total:** 4 files, 559 lines

## Next Steps

**Immediate (Plan 03):**
- Implement SecHttpClient orchestrator integrating:
  - TokenBucket rate limiting (from Plan 01)
  - Timeout/abort composition (from Plan 01)
  - Retry policy with exponential backoff (from Plan 02)
  - Error classification (from Plan 02)
- Write integration tests validating full request lifecycle
- Verify retry loop respects rate limiting (retries go through token bucket)

**Dependencies for downstream:**
- Plan 03 can now import calculateBackoffMs and classifyResponseError
- SecHttpClient will use these modules for retry orchestration
- Error retryability flags drive retry loop decisions

## Performance Metrics

| Metric | Value |
|--------|-------|
| Duration | 185s (~3 minutes) |
| Tasks completed | 2/2 |
| Tests written | 40 (16 retry + 24 error-mapper) |
| Test pass rate | 100% |
| Commits | 2 |

## Self-Check: PASSED

**Files created:**
- ✓ FOUND: src/http/retry.ts
- ✓ FOUND: src/http/error-mapper.ts
- ✓ FOUND: tests/http/retry.test.ts
- ✓ FOUND: tests/http/error-mapper.test.ts

**Commits exist:**
- ✓ FOUND: e7f166f (Task 1 - exponential backoff)
- ✓ FOUND: 1907afa (Task 2 - error mapper)

**Exports verified:**
- ✓ calculateBackoffMs exported from src/http/index.ts
- ✓ classifyResponseError exported from src/http/index.ts
